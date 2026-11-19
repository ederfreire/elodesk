import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Plan from "../../models/Plan";
import Tag from "../../models/Tag";
import Whatsapp from "../../models/Whatsapp";
import Company from "../../models/Company";
import QueueIntegrations from "../../models/QueueIntegrations";
import TicketTag from "../../models/TicketTag";
import ContactWallet from "../../models/ContactWallet";
import { Op } from "sequelize";

const ShowTicketService = async (
  id: string | number,
  companyId: number
): Promise<Ticket> => {
  const ticket = await Ticket.findOne({
    where: {
      id,
      companyId
    },
    attributes: [
      "id",
      "createdAt",
      "uuid",
      "queueId",
      "lastFlowId",
      "flowStopped",
      "dataWebhook",
      "flowWebhook",
      "isGroup",
      "channel",
      "status",
      "contactId",
      "useIntegration",
      "lastMessage",
      "updatedAt",
      "unreadMessages",
      "companyId",
      "whatsappId",
      "imported",
      "lgpdAcceptedAt",
      "amountUsedBotQueues",
      "useIntegration",
      "integrationId",
      "userId",
      "amountUsedBotQueuesNPS",
      "lgpdSendMessageAt",
      "isBot",
      "typebotSessionId",
      "typebotStatus",
      "sendInactiveMessage",
      "fromMe",
      "isOutOfHour",
      "isActiveDemand",
      "typebotSessionTime",
      "hashFlowId"
    ],
    include: [
      {
        model: Contact,
        as: "contact",
        // leadSource e utmLinkId entram aqui: a lista de atributos e
        // restritiva, entao qualquer campo fora dela volta `undefined` para o
        // frontend. A origem era gravada no banco normalmente, mas sumia do
        // chip a cada recarregamento da pagina porque nunca chegava de volta.
        attributes: ["id", "companyId", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "disableBot", "isGroup", "remoteJid", "urlPicture", "lgpdAcceptedAt", "leadSource", "utmLinkId"],
        include: ["extraInfo", "tags",
          {
            association: "wallets",
            attributes: ["id", "name"]
          },
          {
            model: ContactWallet,
            include: [
              {
                model: User,
                attributes: ["id", "name"]
              },
              {
                model: Queue,
                attributes: ["id", "name"]
              }
            ]
          }]
      },
      {
        model: Queue,
        as: "queue",
        attributes: ["id", "name", "color"],
        include: ["chatbots"]
      },
      {
        model: User,
        as: "user",
        attributes: ["id", "name"],
      },
      {
        model: Tag,
        as: "tags",
        attributes: ["id", "name", "color"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        // wacallsChatSessionId precisa estar aqui: SendWacallsText/SendWacallsMediaMessage
        // checam ticket.whatsapp.wacallsChatSessionId pra saber se a conexão wacalls
        // está pareada. Sem esse campo na lista, ele sempre vem undefined mesmo com a
        // conexão conectada de verdade, e todo envio falha com "Conexão wacalls não pareada".
        attributes: ["id", "name", "groupAsTicket", "greetingMediaAttachment", "facebookUserToken", "facebookUserId", "status", "token", "channel", "color", "phone_number_id", "tokenMeta", "send_token", "waba_id", "allowSignature", "wacallsChatSessionId"]

      },
      {
        model: Company,
        as: "company",
        attributes: ["id", "name"],
        include: [{
          model: Plan,
          as: "plan",
          attributes: ["id", "name", "useKanban"]
        }]
      },
      {
        model: QueueIntegrations,
        as: "queueIntegration",
        attributes: ["id", "name"]
      },
      {
        model: TicketTag,
        as: "ticketTags",
        attributes: ["tagId"]
      }
    ]
  });

  if (ticket?.companyId !== companyId) {
    throw new AppError("Não é possível consultar registros de outra empresa");
  }

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  try {
    const queueWhere: any = ticket.queueId ? { queueId: ticket.queueId } : { queueId: null };
    const baseWhere = {
      companyId,
      status: "pending",
      userId: null,
      isGroup: false,
      ...queueWhere
    };

    let queuePosition = await Ticket.count({
      where: {
        ...baseWhere,
        id: { [Op.lte]: ticket.id }
      }
    });

    if (!queuePosition) {
      queuePosition = (await Ticket.count({ where: baseWhere })) + 1;
    }

    (ticket as any).setDataValue("queuePosition", String(queuePosition));
  } catch (error: any) {
    (ticket as any).setDataValue("queuePosition", "1");
  }

  return ticket;
};

export default ShowTicketService;
