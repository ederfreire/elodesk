import { Op, fn, where, col, Filterable, Includeable, literal } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Tag from "../../models/Tag";

import { intersection } from "lodash";
import Whatsapp from "../../models/Whatsapp";
import ContactTag from "../../models/ContactTag";
import ContactWallet from "../../models/ContactWallet";

import removeAccents from "remove-accents";

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
  userId: number;
  withUnreadMessages?: string;
  queueIds: number[];
  tags: number[];
  users: number[];
  contacts?: string[];
  updatedStart?: string;
  updatedEnd?: string;
  connections?: string[];
  whatsappIds?: number[];
  statusFilters?: string[];
  queuesFilter?: string[];
  isGroup?: string;
  companyId: number;
  allTicket?: string;
  sortTickets?: string;
  searchOnMessages?: string;
}

interface Response {
  tickets: Ticket[];
  count: number;
  hasMore: boolean;
}

const isTruthy = (value: any): boolean => {
  if (typeof value === "string") {
    return ["true", "enabled", "enable", "1", "yes", "sim"].includes(value.trim().toLowerCase());
  }

  return value === true || value === 1;
};

const ListTicketsService = async ({
  searchParam = "",
  pageNumber = "1",
  queueIds,
  tags,
  users,
  status,
  date,
  dateStart,
  dateEnd,
  updatedAt,
  showAll,
  userId,
  withUnreadMessages = "false",
  whatsappIds,
  statusFilters,
  companyId,
  sortTickets = "DESC",
  searchOnMessages = "false"
}: Request): Promise<Response> => {
  const user = await ShowUserService(userId, companyId);

  const showTicketAllQueues = user.allHistoric === "enabled";
  const showTicketWithoutQueue = isTruthy(user.allTicket);
  const showGroups = isTruthy(user.allowGroup);
  const showPendingNotification = await FindCompanySettingOneService({ companyId, column: "showNotificationPending" });
  const showNotificationPendingValue = isTruthy(showPendingNotification?.[0]?.showNotificationPending);
  const allowUserCrossQueuesSetting = await FindCompanySettingOneService({ companyId, column: "allowUserCrossQueues" });
  const allowUserCrossQueues = allowUserCrossQueuesSetting?.[0]?.allowUserCrossQueues === true || allowUserCrossQueuesSetting?.[0]?.allowUserCrossQueues === "true";
  const queueVisibilityFilter = showTicketWithoutQueue
    ? { [Op.or]: [{ [Op.in]: queueIds }, null] }
    : { [Op.in]: queueIds };
  // Um ticket só é considerado de GRUPO quando o próprio contato é um grupo
  // (ou o ticket está marcado como tal). O `status: "group"` sozinho não vale
  // como prova: tickets comuns que ficaram com esse status por reabertura
  // antiga apareciam indevidamente na aba Grupos.
  const groupTicketCondition: any = {
    [Op.or]: [
      { isGroup: true },
      { "$contact.isGroup$": true },
      { "$contact.remoteJid$": { [Op.like]: "%@g.us" } }
    ]
  };
  const nonGroupTicketCondition: any = {
    [Op.and]: [
      { [Op.or]: [{ isGroup: false }, { isGroup: null }] },
      { [Op.or]: [{ "$contact.isGroup$": false }, { "$contact.isGroup$": null }] },
      {
        [Op.or]: [
          { "$contact.remoteJid$": null },
          { "$contact.remoteJid$": { [Op.notLike]: "%@g.us" } }
        ]
      }
    ]
  };

  let whereCondition: Filterable["where"];

  whereCondition = allowUserCrossQueues && user.profile === "user"
    ? {
        companyId,
        [Op.or]: [
          { userId },
          { status: "pending", queueId: queueVisibilityFilter }
        ]
      }
    : {
        [Op.or]: [{ userId }, { status: "pending" }],
        queueId: queueVisibilityFilter,
        companyId
      };


  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "urlPicture", "companyId", "isGroup", "remoteJid"],
      include: ["extraInfo", "tags",
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
      attributes: ["id", "name", "expiresTicket", "groupAsTicket", "color", "sendIdQueue"]
    },
  ];

  const userQueueIds = user.queues.map(queue => queue.id);

  if (status === "open") {
    whereCondition = allowUserCrossQueues && user.profile === "user"
      ? {
          companyId,
          status: "open",
          userId
        }
      : {
          ...whereCondition,
          userId,
          queueId: { [Op.in]: queueIds }
        };
  } else
    if (status === "group") {
      if (!showGroups) {
        whereCondition = {
          companyId,
          id: -1 as any
        };
      } else {
        const userWhatsappIds: number[] = [];
        if (user.whatsapps && user.whatsapps.length > 0) {
          user.whatsapps.forEach((w: any) => userWhatsappIds.push(w.id));
        }
        if (user.whatsappId && !userWhatsappIds.includes(user.whatsappId)) {
          userWhatsappIds.push(user.whatsappId);
        }

        const groupVisibilityCondition: any = {
          companyId,
          status: { [Op.notIn]: ["closed", "lgpd", "nps", "chatbot"] },
          queueId: { [Op.or]: [{ [Op.in]: queueIds }, null] },
          ...(userWhatsappIds.length > 0 ? { whatsappId: { [Op.in]: userWhatsappIds } } : {})
        };

        whereCondition = {
          [Op.and]: [
            groupTicketCondition,
            groupVisibilityCondition
          ]
        };
      }
    }
      else
        // NOVA LÓGICA PARA STATUS CHATBOT
        if (status === "chatbot") {
          // Para status chatbot, mostrar tickets que estão sendo processados pelo flowbuilder
          // Admins podem ver todos, usuários comuns só os seus ou os sem responsável
          if (user.profile === "admin" || showAll === "true") {
            whereCondition = {
              companyId,
              status: "chatbot",
               queueId: showTicketWithoutQueue ? { [Op.or]: [{ [Op.in]: queueIds }, null] } : { [Op.in]: queueIds }
            };
          } else {
            whereCondition = {
              companyId,
              status: "chatbot",
              [Op.or]: [{ userId }, { userId: null }],
              queueId: showTicketWithoutQueue ? { [Op.or]: [{ [Op.in]: queueIds }, null] } : { [Op.in]: queueIds }
            };
          }
        }
        else
          if (user.profile === "user" && status === "pending" && showTicketWithoutQueue) {
            const TicketsUserFilter: any[] | null = [];

            let ticketsIds = [];

            if (!showTicketAllQueues) {
              ticketsIds = await Ticket.findAll({
                where: {
                  userId: { [Op.or]: [user.id, null] },
                   queueId: { [Op.or]: [{ [Op.in]: queueIds }, null] },
                  status: "pending",
                  companyId
                },
              });
            } else {
              ticketsIds = await Ticket.findAll({
                where: {
                  userId: { [Op.or]: [user.id, null] },
                  status: "pending",
                  companyId
                },
              });
            }

            if (ticketsIds) {
              TicketsUserFilter.push(ticketsIds.map(t => t.id));
            }

            const ticketsIntersection: number[] = intersection(...TicketsUserFilter);

            whereCondition = {
              ...whereCondition,
              id: ticketsIntersection
            };
          }
          else
            if (user.profile === "user" && status === "pending" && !showTicketWithoutQueue) {
              const TicketsUserFilter: any[] | null = [];

              let ticketsIds = [];

              if (!showTicketAllQueues) {
                ticketsIds = await Ticket.findAll({
                  where: {
                    companyId,
                    userId:
                      { [Op.or]: [user.id, null] },
                    status: "pending",
                    queueId: { [Op.in]: queueIds }
                  },
                });
              } else {
                ticketsIds = await Ticket.findAll({
                  where: {
                    companyId,
                    [Op.or]:
                      [{
                        userId:
                          { [Op.or]: [user.id, null] }
                      },
                      {
                        status: "pending"
                      }
                      ],
                    status: "pending"
                  },
                });
              }
              if (ticketsIds) {
                TicketsUserFilter.push(ticketsIds.map(t => t.id));
              }

              const ticketsIntersection: number[] = intersection(...TicketsUserFilter);

              whereCondition = {
                ...whereCondition,
                id: ticketsIntersection
              };
            }

  if (showAll === "true" && (user.profile === "admin" || user.allUserChat === "enabled") && status !== "search" && status !== "group") {
    if (user.allHistoric === "enabled" && showTicketWithoutQueue) {
      whereCondition = { companyId };
    } else if (user.allHistoric === "enabled" && !showTicketWithoutQueue) {
      whereCondition = { companyId, queueId: { [Op.ne]: null } };
    } else if (user.allHistoric === "disabled" && showTicketWithoutQueue) {
      whereCondition = { companyId, queueId: { [Op.or]: [{ [Op.in]: queueIds }, null] } };
    } else if (user.allHistoric === "disabled" && !showTicketWithoutQueue) {
      whereCondition = { companyId, queueId: { [Op.in]: queueIds } };
    }
  }


  if (status && status !== "search" && status !== "group") {
    whereCondition = {
      ...whereCondition,
      status: showAll === "true" && status === "pending" ? { [Op.or]: [status, "lgpd"] } : status
    };
  }


  if (status === "closed") {
    let latestTickets;

    if (!showTicketAllQueues) {
      let whereCondition2: Filterable["where"] = {
        companyId,
        status: "closed",
      }

      // Se showAll === "true" E usuário tem permissão (admin ou allUserChat), mostrar todos
      if (showAll === "true" && (user.profile === "admin" || user.allUserChat === "enabled")) {
        whereCondition2 = {
          ...whereCondition2,
           queueId: showTicketWithoutQueue ? { [Op.or]: [{ [Op.in]: queueIds }, null] } : { [Op.in]: queueIds },
        }
      } else {
        // Caso contrário, filtrar apenas os tickets do próprio usuário
        whereCondition2 = {
          ...whereCondition2,
           queueId: showTicketWithoutQueue ? { [Op.or]: [{ [Op.in]: queueIds }, null] } : { [Op.in]: queueIds },
          userId
        }
      }

      latestTickets = await Ticket.findAll({
        attributes: ['companyId', 'contactId', 'whatsappId', [literal('MAX("id")'), 'id']],
        where: whereCondition2,
        group: ['companyId', 'contactId', 'whatsappId'],
      });

    } else {
      let whereCondition2: Filterable["where"] = {
        companyId,
        status: "closed",
      }

      // Se showAll === "true" E usuário tem permissão (admin ou allUserChat), mostrar todos
      if (showAll === "true" && (user.profile === "admin" || user.allUserChat === "enabled")) {
        whereCondition2 = {
          ...whereCondition2,
           queueId: showTicketWithoutQueue ? { [Op.or]: [{ [Op.in]: queueIds }, null] } : { [Op.in]: queueIds },
        }
      } else {
        // Caso contrário, filtrar apenas os tickets do próprio usuário
        whereCondition2 = {
          ...whereCondition2,
          queueId: showTicketWithoutQueue ? { [Op.or]: [{ [Op.in]: queueIds }, null] } : { [Op.in]: queueIds },
          userId
        }
      }

      latestTickets = await Ticket.findAll({
        attributes: ['companyId', 'contactId', 'whatsappId', [literal('MAX("id")'), 'id']],
        where: whereCondition2,
        group: ['companyId', 'contactId', 'whatsappId'],
      });

    }

    const ticketIds = latestTickets.map((t) => t.id);

    whereCondition = {
      id: ticketIds

    };
  }
  else
    if (status === "search") {
      whereCondition = {
        companyId
      }

      // FILTRO DE FILA NA BUSCA — lista vazia significa "não filtrar".
      //
      // Antes o filtro era aplicado sempre, mesmo com a lista vazia. No
      // PostgreSQL isso vira `"queueId" IN (NULL)`, que NÃO casa com nada
      // (comprovado gerando o SQL do próprio Sequelize 5). Resultado: quem
      // não tem fila atribuída, ou desmarcou todas em "Filtro por Filas",
      // pesquisava qualquer coisa e recebia "Nada aqui" — sempre, para
      // qualquer termo. Com "ver todos" ligado era um pouco diferente e
      // igualmente errado: `(queueId IN (NULL) OR queueId IS NULL)` só
      // encontrava conversas SEM fila, escondendo todas as que têm fila.
      //
      // Os filtros de tags e de usuários deste mesmo arquivo já tratavam
      // lista vazia como "não filtrar" (`length > 0`). O de fila era a
      // exceção — e é essa exceção que quebrava a pesquisa.
      const temFiltroDeFila = Array.isArray(queueIds) && queueIds.length > 0;
      const filtroDeFila = (incluirSemFila: boolean) => {
        if (!temFiltroDeFila) return {};
        return {
          queueId: incluirSemFila
            ? { [Op.or]: [{ [Op.in]: queueIds }, null] }
            : { [Op.in]: queueIds }
        };
      };

      let latestTickets;
      if (!showTicketAllQueues && user.profile === "user") {
        latestTickets = await Ticket.findAll({
          attributes: ['companyId', 'contactId', 'whatsappId', [literal('MAX("id")'), 'id']],
          where: {
            [Op.or]: [{ userId }, { status: ["pending", "closed", "group", "chatbot"] }], // INCLUINDO CHATBOT NA BUSCA
            ...filtroDeFila(showAll === "true" || showTicketWithoutQueue),
            companyId
          },
          group: ['companyId', 'contactId', 'whatsappId'],
        });
      } else {
        let whereCondition2: Filterable["where"] = {
          companyId,
          [Op.or]: [{ userId }, { status: ["pending", "closed", "group", "chatbot"] }] // INCLUINDO CHATBOT NA BUSCA
        }

        if (showAll === "false" && user.profile === "admin") {
          whereCondition2 = {
            ...whereCondition2,
            ...filtroDeFila(false)
          }

        } else if (showAll === "true" && user.profile === "admin") {
          whereCondition2 = {
            companyId,
            ...filtroDeFila(true)
          }
        }

        latestTickets = await Ticket.findAll({
          attributes: ['companyId', 'contactId', 'whatsappId', [literal('MAX("id")'), 'id']],
          where: whereCondition2,
          group: ['companyId', 'contactId', 'whatsappId'],
        });

      }

      const ticketIds = latestTickets.map((t) => t.id);

      whereCondition = {
        ...whereCondition,
        id: ticketIds
      };

      if (searchParam) {
        const sanitizedSearchParam = removeAccents(searchParam.toLocaleLowerCase().trim());
        if (searchOnMessages === "true") {
          includeCondition = [
            ...includeCondition,
            {
              model: Message,
              as: "messages",
              attributes: ["id", "body"],
              where: {
                body: where(
                  fn("LOWER", fn('unaccent', col("body"))),
                  "LIKE",
                  `%${sanitizedSearchParam}%`
                ),
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
                  fn("LOWER", fn("unaccent", col("contact.name"))),
                  "LIKE",
                  `%${sanitizedSearchParam}%`
                )
              },
              { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
              {
                // O include acima usa o apelido "messages" (plural), mas aqui
                // estava "$message.body$" e col("body") — sem qualificar a
                // tabela. O SQL gerado saía com LOWER(unaccent("body")) solto:
                // hoje ainda resolve por sorte, porque só a tabela Messages tem
                // coluna "body" na consulta, mas basta entrar um join novo com
                // uma coluna de mesmo nome para virar "column reference is
                // ambiguous" e derrubar a busca inteira.
                "$messages.body$": where(
                  fn("LOWER", fn("unaccent", col("messages.body"))),
                  "LIKE",
                  `%${sanitizedSearchParam}%`
                )
              }
            ]
          };
        } else {
          whereCondition = {
            ...whereCondition,
            [Op.or]: [
              {
                "$contact.name$": where(
                  fn("LOWER", fn("unaccent", col("contact.name"))),
                  "LIKE",
                  `%${sanitizedSearchParam}%`
                )
              },
              { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
            ]
          };
        }

      }

    } else
      if (withUnreadMessages === "true") {
        // Collect user whatsapp IDs for group filtering
        const userWhatsappIds: number[] = [];
        if (user.whatsapps && user.whatsapps.length > 0) {
          user.whatsapps.forEach((w: any) => userWhatsappIds.push(w.id));
        }
        if (user.whatsappId && !userWhatsappIds.includes(user.whatsappId)) {
          userWhatsappIds.push(user.whatsappId);
        }

        // FILTRO DE FILA — lista vazia significa "nao filtrar".
        //
        // Mesmo problema ja documentado no bloco `status === "search"` deste
        // arquivo: no PostgreSQL, `queueId IN (NULL)` nao casa com NADA. Como
        // `userQueueIds` vem de `user.queues`, um usuario sem fila atribuida
        // (tipico de admin) gerava:
        //     (\"queueId\" IN (NULL) OR \"queueId\" IS NULL)
        // ou seja, so encontrava ticket SEM fila. Qualquer ticket COM fila
        // sumia do sino — que era exatamente o sintoma: aba \"Aguardando\" com
        // ticket de 9 nao lidas e o sino dizendo \"Nenhuma notificacao\".
        //
        // O frontend (canShowTicketNotification) ja tratava lista vazia como
        // "sem filtro" (`queueIds.length > 0 && ...`). O backend era a
        // excecao, e os dois discordavam.
        const temFiltroDeFila = Array.isArray(userQueueIds) && userQueueIds.length > 0;

        // Espalhados com spread: passar `queueId: undefined` direto no where
        // faz o Sequelize reclamar (ou gerar `queueId = NULL`), entao quando
        // nao ha filtro a chave simplesmente nao entra no objeto.
        const queueFilter = temFiltroDeFila
          ? {
              queueId: showTicketWithoutQueue
                ? { [Op.or]: [{ [Op.in]: userQueueIds }, null] }
                : { [Op.in]: userQueueIds }
            }
          : {};
        // Pending: always accept null queue so pending without queue shows notification
        const pendingQueueFilter = temFiltroDeFila
          ? { queueId: { [Op.or]: [{ [Op.in]: userQueueIds }, null] } }
          : {};

        const orConditions: any[] = [
          // 1. Open non-group tickets assigned to this user
          {
            [Op.and]: [
              nonGroupTicketCondition,
              {
                userId,
                status: { [Op.notIn]: ["pending", "group", "closed", "lgpd", "nps", "chatbot"] },
                ...queueFilter,
                unreadMessages: { [Op.gt]: 0 },
                companyId
              }
            ]
          },
          // 2. Pending tickets (any userId) when setting is active — accept null queue
          ...(showNotificationPendingValue ? [{
            [Op.and]: [
              nonGroupTicketCondition,
              {
                status: "pending",
                ...pendingQueueFilter,
                unreadMessages: { [Op.gt]: 0 },
                companyId
              }
            ]
          }] : [])
        ];

        // 3. Group tickets (if user has group permission) - any non-closed status with isGroup true
        // Accept groups with or without queue
        //
        // Antes exigia `userWhatsappIds.length > 0`: usuario sem conexao
        // vinculada nunca via grupo no sino. Lista vazia = sem filtro, igual
        // ao que o frontend ja fazia com `allowedWhatsappIds`.
        if (showGroups) {
          orConditions.push({
            [Op.and]: [
              groupTicketCondition,
              {
                ...(userWhatsappIds.length > 0
                  ? { whatsappId: { [Op.in]: userWhatsappIds } }
                  : {}),
                status: { [Op.notIn]: ["closed", "lgpd", "nps", "chatbot"] },
                ...pendingQueueFilter,
                unreadMessages: { [Op.gt]: 0 },
                companyId
              }
            ]
          });
        }

        whereCondition = {
          [Op.or]: orConditions
        };
      }

  // Filtros globais (Tags, Usuários, Conexões, Status) — aplicáveis em todas as abas
  if (Array.isArray(tags) && tags.length > 0) {
    const contactTagFilter: any[] | null = [];
    const contactTags = await ContactTag.findAll({
      where: { tagId: tags }
    });
    if (contactTags) {
      contactTagFilter.push(contactTags.map(t => t.contactId));
    }

    const contactsIntersection: number[] = intersection(...contactTagFilter);

    whereCondition = {
      ...whereCondition,
      contactId: contactsIntersection
    };

    if (user.profile === "user" && showAll !== "true" && status === "search") {
      whereCondition = {
        ...whereCondition,
        [Op.or]: [
          { userId },
          { status: "pending" }
        ]
      };
    }
  }

  if (Array.isArray(users) && users.length > 0) {
    whereCondition = {
      ...whereCondition,
      userId: users
    };
  }

  if (Array.isArray(whatsappIds) && whatsappIds.length > 0) {
    whereCondition = {
      ...whereCondition,
      whatsappId: whatsappIds
    };
  }

  if (Array.isArray(statusFilters) && statusFilters.length > 0) {
    if (status === "search") {
      whereCondition = {
        ...whereCondition,
        status: { [Op.in]: statusFilters }
      };
    } else if (!(status === "group" && statusFilters.includes("group"))) {
      // Nas abas o filtro de status era ignorado; agora restringe a aba.
      whereCondition = {
        [Op.and]: [whereCondition, { status: { [Op.in]: statusFilters } }]
      } as any;
    }
  }

  whereCondition = {
    ...whereCondition,
    companyId
  };

  // Segregação final e estrita das abas: a aba "Grupos" só lista grupos de
  // verdade e as demais abas (Aguardando/Atendendo/Resolvidos) nunca listam
  // grupos — vale para todos os canais (WhatsApp Plus, Baileys, API oficial,
  // Facebook/Instagram), já que o critério é o contato, não a conexão.
  if (status === "group") {
    whereCondition = { [Op.and]: [whereCondition, groupTicketCondition] };
  } else if (status && status !== "search") {
    whereCondition = { [Op.and]: [whereCondition, nonGroupTicketCondition] };
  }

  const limit = 40;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
    include: includeCondition,
    attributes: ["id", "uuid", "userId", "queueId", "isGroup", "channel", "status", "contactId", "useIntegration", "lastMessage", "updatedAt", "unreadMessages", "whatsappId"],
    distinct: true,
    limit,
    offset,
    order: [["updatedAt", sortTickets]],
    subQuery: false
  });

  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count,
    hasMore
  };
};

export default ListTicketsService;