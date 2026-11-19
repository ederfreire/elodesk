import { Op, fn, where, col, Filterable, Includeable } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Tag from "../../models/Tag";
import TicketTag from "../../models/TicketTag";
import ContactWallet from "../../models/ContactWallet";
import { intersection } from "lodash";
import Whatsapp from "../../models/Whatsapp";
import FindCompanySettingOneService from "../CompaniesSettings/FindCompanySettingOneService";
 
interface Request {
  searchParam?: string;
  pageNumber?: string;
  status?: string;
  date?: string;
  dateStart?: string;
  dateEnd?: string;
  updatedAt?: string;
  showAll?: string;
  userId: string;
  withUnreadMessages?: string;
  queueIds: number[];
  whatsappIds: number[];
  tags: number[];
  users: number[];
  companyId: number;
}

interface Response {
  tickets: Ticket[];
  count: number;
  hasMore: boolean;
}

const ListTicketsServiceKanban = async ({
  searchParam = "",
  pageNumber = "1",
  queueIds,
  whatsappIds,
  tags,
  users,
  status,
  date,
  dateStart,
  dateEnd,
  updatedAt,
  showAll,
  userId,
  withUnreadMessages,
  companyId
}: Request): Promise<Response> => {
  const user = await ShowUserService(userId, companyId);
  const isAdmin = user.profile === "admin";
  const allowUserCrossQueuesSetting = await FindCompanySettingOneService({ companyId, column: "allowUserCrossQueues" });
  const allowUserCrossQueues = allowUserCrossQueuesSetting?.[0]?.allowUserCrossQueues === true || allowUserCrossQueuesSetting?.[0]?.allowUserCrossQueues === "true";
  const queueVisibilityFilter = { [Op.or]: [{ [Op.in]: queueIds }, null] };
  const whatsappVisibilityFilter = whatsappIds.length > 0
    ? { [Op.in]: whatsappIds }
    : undefined;

  // Tickets explicitamente arquivados numa etapa do Kanban (têm tag com
  // kanban=1). Precisa ser calculado ANTES do filtro de visibilidade porque
  // ele também entra ali: um atendimento encerrado pelo fluxo normalmente
  // fica sem atendente (userId null) e sem status "pending", então seria
  // barrado pela regra "vejo os meus + os pendentes" antes mesmo de chegar
  // no filtro de status.
  const idsDeTicketsArquivados = await (async (): Promise<number[]> => {
    try {
      const tagsDeKanban = await Tag.findAll({
        where: { companyId, kanban: 1 },
        attributes: ["id"]
      });
      const idsDeKanban = tagsDeKanban.map(t => t.id);
      if (idsDeKanban.length === 0) return [];

      const vinculos = await TicketTag.findAll({
        where: { tagId: { [Op.in]: idsDeKanban } },
        attributes: ["ticketId"]
      });
      return [...new Set(vinculos.map(v => v.ticketId))];
    } catch {
      // Se falhar, o quadro volta ao comportamento antigo em vez de quebrar.
      return [];
    }
  })();

  const filtroDeArquivados =
    idsDeTicketsArquivados.length > 0
      ? [{ id: { [Op.in]: idsDeTicketsArquivados } }]
      : [];

  // Sempre filtrar por usuário - cada usuário vê apenas seus tickets + pendentes
  let whereCondition: Filterable["where"] = allowUserCrossQueues
    ? {
        [Op.or]: [
          { userId },
          { status: "pending", queueId: queueVisibilityFilter },
          ...filtroDeArquivados
        ],
        ...(whatsappVisibilityFilter ? { whatsappId: whatsappVisibilityFilter } : {})
      }
    : {
        [Op.or]: [{ userId }, { status: "pending" }, ...filtroDeArquivados],
        queueId: queueVisibilityFilter,
        ...(whatsappVisibilityFilter ? { whatsappId: whatsappVisibilityFilter } : {})
      };

  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "email", "companyId", "urlPicture"],
      include: [
        {
          model: ContactCustomField,
          as: "extraInfo"
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
        }
      ]
    },
    {
      model: Queue,
      as: "queue",
      attributes: ["id", "name", "color"]
    },
    {
      model: User,
      as: "user",
      attributes: ["id", "name"]
    },
    {
      model: Tag,
      as: "tags",
      attributes: ["id", "name", "color"]
    },
    {
      model: Whatsapp,
      as: "whatsapp",
      attributes: ["name"]
    },
  ];

  // showAll permite admin ver todos os tickets no kanban
  if (showAll === "true" && isAdmin) {
    whereCondition = {
      queueId: { [Op.or]: [{ [Op.in]: queueIds }, null] },
      ...(whatsappVisibilityFilter ? { whatsappId: whatsappVisibilityFilter } : {})
    };
  }

  // Status visíveis no quadro.
  //
  // Antes era só pending/open. Isso impedia colunas de arquivamento
  // ("Perdido", "Ganho"): o nó de encerrar move o card para a etapa e fecha o
  // atendimento — e o card simplesmente não aparecia, deixando a coluna
  // sempre zerada.
  //
  // Agora um ticket FECHADO também aparece, mas só se estiver explicitamente
  // arquivado numa etapa do Kanban. Atendimento fechado sem etapa continua
  // fora do quadro, como sempre foi.
  whereCondition = {
    ...whereCondition,
    [Op.and]: [
      ...((whereCondition as any)[Op.and] || []),
      {
        [Op.or]: [
          { status: { [Op.in]: ["pending", "open"] } },
          ...(idsDeTicketsArquivados.length > 0
            ? [{ status: "closed", id: { [Op.in]: idsDeTicketsArquivados } }]
            : [])
        ]
      }
    ]
  };

  if (searchParam) {
    const sanitizedSearchParam = searchParam.toLocaleLowerCase().trim();

    includeCondition = [
      ...includeCondition,
      {
        model: Message,
        as: "messages",
        attributes: ["id", "body"],
        where: {
          body: where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        required: false,
        duplicating: false
      }
    ];

    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        {
          "$contact.name$": where(
            fn("LOWER", col("contact.name")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
        {
          "$message.body$": where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        }
      ]
    };
  }

  if (dateStart && dateEnd) {
    whereCondition = {
      createdAt: {
        [Op.between]: [+startOfDay(parseISO(dateStart)), +endOfDay(parseISO(dateEnd))]
      }
    };
  }

  if (updatedAt) {
    whereCondition = {
      updatedAt: {
        [Op.between]: [
          +startOfDay(parseISO(updatedAt)),
          +endOfDay(parseISO(updatedAt))
        ]
      }
    };
  }

  if (withUnreadMessages === "true") {
    const userQueueIds = user.queues.map(queue => queue.id);

    whereCondition = isAdmin
      ? {
          queueId: { [Op.or]: [userQueueIds, null] },
          unreadMessages: { [Op.gt]: 0 }
        }
      : {
          [Op.or]: [{ userId }, { status: "pending" }],
          queueId: { [Op.or]: [userQueueIds, null] },
          unreadMessages: { [Op.gt]: 0 }
        };
  }

  if (Array.isArray(tags) && tags.length > 0) {
    const ticketsTagFilter: any[] | null = [];
    for (let tag of tags) {
      const ticketTags = await TicketTag.findAll({
        where: { tagId: tag }
      });
      if (ticketTags) {
        ticketsTagFilter.push(ticketTags.map(t => t.ticketId));
      }
    }

    const ticketsIntersection: number[] = intersection(...ticketsTagFilter);

    whereCondition = {
      ...whereCondition,
      id: {
        [Op.in]: ticketsIntersection
      }
    };

    // Restringir visibilidade: usuários não-admin só veem seus próprios tickets + pendentes ao filtrar por tags
    if (!isAdmin && showAll !== "true") {
      whereCondition = {
        ...whereCondition,
        [Op.or]: [
          { userId: Number(userId) },
          { status: "pending" }
        ]
      };
    }
  }

  if (Array.isArray(users) && users.length > 0) {
    const ticketsUserFilter: any[] | null = [];
    for (let user of users) {
      const ticketUsers = await Ticket.findAll({
        where: { userId: user }
      });
      if (ticketUsers) {
        ticketsUserFilter.push(ticketUsers.map(t => t.id));
      }
    }

    const ticketsIntersection: number[] = intersection(...ticketsUserFilter);

    whereCondition = {
      ...whereCondition,
      id: {
        [Op.in]: ticketsIntersection
      }
    };
  }

  const limit = 400;
  const offset = limit * (+pageNumber - 1);

  whereCondition = {
    ...whereCondition,
    companyId
  };

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
    include: includeCondition,
    distinct: true,
    limit,
    offset,
    order: [["updatedAt", "DESC"]],
    subQuery: false
  });
  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count,
    hasMore
  };
};

export default ListTicketsServiceKanban;