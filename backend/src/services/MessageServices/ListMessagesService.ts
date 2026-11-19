import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { Op } from "sequelize";
import { intersection } from "lodash";
import User from "../../models/User";
import isQueueIdHistoryBlocked from "../UserServices/isQueueIdHistoryBlocked";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import FindCompanySettingOneService from "../CompaniesSettings/FindCompanySettingOneService";

interface Request {
  ticketId: string;
  companyId: number;
  pageNumber?: string;
  queues?: number[];
  user?: User;
}

interface Response {
  messages: Message[];
  ticket: Ticket;
  count: number;
  hasMore: boolean;
}

const ListMessagesService = async ({
  pageNumber = "1",
  ticketId,
  companyId,
  queues = [],
  user
}: Request): Promise<Response> => {

  if (!isNaN(Number(ticketId))) {
    const uuid = await Ticket.findOne({
      where: {
        id: ticketId,
        companyId
      },
      attributes: ["uuid"]
    });
    if (!uuid) {
      throw new AppError("ERR_NO_TICKET_FOUND", 404);
    }
    ticketId = uuid.uuid;
  }
  const ticket = await Ticket.findOne({
    where: {
      uuid: ticketId,
      companyId
    }
  });

  const ticketsFilter: any[] | null = [];

  const isAllHistoricEnabled = await isQueueIdHistoryBlocked({ userRequest: user.id });
  const allowUserCrossQueuesSetting = await FindCompanySettingOneService({ companyId, column: "allowUserCrossQueues" });
  const allowUserCrossQueues = allowUserCrossQueuesSetting?.[0]?.allowUserCrossQueues === true || allowUserCrossQueuesSetting?.[0]?.allowUserCrossQueues === "true";

  const safeQueues = (Array.isArray(queues) ? queues : [])
    .map(queueId => Number(queueId))
    .filter(queueId => Number.isInteger(queueId) && queueId > 0);

  const canViewAllOrGroup =
    user.profile === "admin" ||
    user.allTicket === "enabled" || user.allTicket === "enable" ||
    (ticket.isGroup && user.allowGroup);

  const queueCondition = canViewAllOrGroup
    ? (safeQueues.length > 0 ? { [Op.or]: [safeQueues, null] } : { [Op.is]: null })
    : (safeQueues.length > 0 ? { [Op.in]: safeQueues } : { [Op.in]: [-1] });

  const baseTicketHistoryWhere = {
    companyId: ticket.companyId,
    contactId: ticket.contactId,
    whatsappId: ticket.whatsappId,
    isGroup: ticket.isGroup
  };

  let ticketIds = [];
  if (allowUserCrossQueues && user.profile === "user") {
    ticketIds = await Ticket.findAll({
      where: baseTicketHistoryWhere,
      attributes: ["id"]
    });
  } else if (!isAllHistoricEnabled) {
    ticketIds = await Ticket.findAll({
      where: {
        ...baseTicketHistoryWhere,
        id: { [Op.lte]: ticket.id },
        queueId: queueCondition
      },
      attributes: ["id"]
    });
  } else {
    ticketIds = await Ticket.findAll({
      where: {
        ...baseTicketHistoryWhere,
        id: { [Op.lte]: ticket.id },
      },
      attributes: ["id"]
    });
  }

  if (ticketIds) {
    ticketsFilter.push(ticketIds.map(t => t.id));
  }
  // }

  const tickets: number[] = intersection(...ticketsFilter);

  if (!tickets) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  // await setMessagesAsRead(ticket);
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: messages } = await Message.findAndCountAll({
    where: { ticketId: tickets, companyId },
    attributes: ["id", "wid", "fromMe", "mediaUrl", "body", "mediaType", "ack", "createdAt", "ticketId", "isDeleted", "queueId", "isForwarded", "isEdited", "isPrivate", "companyId", "userId"],
    limit,
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "name"],
      },
      {
        model: User,
        as: "user",
        attributes: ["id", "name"],
        required: false
      },
      {
        model: Message,
        attributes: ["id", "wid", "fromMe", "mediaUrl", "body", "mediaType", "companyId"],
        as: "quotedMsg",
        include: [
          {
            model: Contact,
            as: "contact",
            attributes: ["id", "name"],
          }
        ],
        required: false
      },
      {
        model: Ticket,
        required: true,
        attributes: ["id", "whatsappId", "queueId", "userId"],
        include: [
          {
            model: Queue,
            as: "queue",
            attributes: ["id", "name", "color"]
          },
          {
            model: User,
            as: "user",
            attributes: ["id", "name"],
            required: false
          }
        ],
      }
    ],

    distinct: true,
    offset,
    subQuery: false,
    order: [["createdAt", "DESC"]] 
  });

  const hasMore = count > offset + messages.length;

  return {
    messages: messages.reverse(),
    ticket,
    count,
    hasMore
  };
};

export default ListMessagesService;