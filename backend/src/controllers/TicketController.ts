import { Request, Response } from "express";
import Queue from "../models/Queue";
import AppError from "../errors/AppError";
import { sendConnectionGreeting, sendQueueGreeting } from "../helpers/SendGreetingMessage";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import formatBody from "../helpers/Mustache";
import { getIO } from "../libs/socket";
import logger from "../utils/logger";
import Ticket from "../models/Ticket";
import { FlowBuilderModel } from "../models/FlowBuilder";
import Contact from "../models/Contact";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import CreateTicketService from "../services/TicketServices/CreateTicketService";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketUUIDService from "../services/TicketServices/ShowTicketFromUUIDService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import ShowUserService from "../services/UserServices/ShowUserService";
import FindCompanySettingsService from "../services/CompaniesSettings/FindCompanySettingsService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import ListTicketsServiceKanban from "../services/TicketServices/ListTicketsServiceKanban";
import TriggerFlowService from "../services/TicketServices/TriggerFlowService";
import CreateLogTicketService from "../services/TicketServices/CreateLogTicketService";
import ShowLogTicketService from "../services/TicketServices/ShowLogTicketService";
import ShowTicketReportService from "../services/TicketServices/ShowTicketReportService";
import ListClosingReportService from "../services/TicketServices/ListClosingReportService";
import FindOrCreateATicketTrakingService from "../services/TicketServices/FindOrCreateATicketTrakingService";
import ListTicketsServiceReport from "../services/TicketServices/ListTicketsServiceReport";
import RelatorioVendasService from "../services/ReportService/RelatorioVendasService";
import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { Mutex } from "async-mutex";
import CountUnreadTabBadgesService from "../services/TicketServices/CountUnreadTabBadgesService";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
  date?: string;
  dateStart?: string;
  dateEnd?: string;
  updatedAt?: string;
  showAll: string;
  withUnreadMessages?: string;
  queueIds?: string;
  tags?: string;
  users?: string;
  whatsapps: string;
  whatsappIds?: string;
  statusFilter: string;
  isGroup?: string;
  sortTickets?: string;
  searchOnMessages?: string;
};

type IndexQueryReport = {
  searchParam: string;
  contactId: string;
  whatsappId: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  queueIds: string;
  tags: string;
  users: string;
  page: string;
  pageSize: string;
  onlyRated: string;
  protocol?: string;
  sortBy?: string;
  sortOrder?: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
  sendFarewellMessage?: boolean;
  sendRatingMessage?: boolean;
  whatsappId?: string;
  valorVenda?: number;
  motivoNaoVenda?: string;
  motivoFinalizacao?: string;
  finalizadoComVenda?: boolean;
  isTransfered?: boolean;
  msgTransfer?: string;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    dateStart,
    dateEnd,
    updatedAt,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    tags: tagIdsStringified,
    users: userIdsStringified,
    withUnreadMessages,
    whatsapps: whatsappIdsStringified,
    statusFilter: statusStringfied,
    sortTickets,
    searchOnMessages
  } = req.query as IndexQuery;

  const userId = Number(req.user.id);
  const { companyId } = req.user;

  let queueIds: number[] = [];
  let tagsIds: number[] = [];
  let usersIds: number[] = [];
  let whatsappIds: number[] = [];
  let statusFilters: string[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  if (userIdsStringified) {
    usersIds = JSON.parse(userIdsStringified);
  }

  if (whatsappIdsStringified) {
    whatsappIds = JSON.parse(whatsappIdsStringified);
  }

  if (statusStringfied) {
    statusFilters = JSON.parse(statusStringfied);
  }

  const { tickets, count, hasMore } = await ListTicketsService({
    searchParam,
    tags: tagsIds,
    users: usersIds,
    pageNumber,
    status,
    date,
    dateStart,
    dateEnd,
    updatedAt,
    showAll,
    userId,
    queueIds,
    withUnreadMessages,
    whatsappIds,
    statusFilters,
    companyId,
    sortTickets,
    searchOnMessages
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const report = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const {
    searchParam,
    contactId,
    whatsappId: whatsappIdsStringified,
    dateFrom,
    dateTo,
    status: statusStringified,
    queueIds: queueIdsStringified,
    tags: tagIdsStringified,
    users: userIdsStringified,
    page: pageNumber,
    pageSize,
    onlyRated,
    protocol,
    sortBy,
    sortOrder
  } = req.query as IndexQueryReport;

  const userId = req.user.id;
  const { companyId } = req.user;

  let queueIds: number[] = [];
  let whatsappIds: string[] = [];
  let tagsIds: number[] = [];
  let usersIds: number[] = [];
  let statusIds: string[] = [];

  if (statusStringified) {
    statusIds = JSON.parse(statusStringified);
  }

  if (whatsappIdsStringified) {
    whatsappIds = JSON.parse(whatsappIdsStringified);
  }

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  if (userIdsStringified) {
    usersIds = JSON.parse(userIdsStringified);
  }

  const { tickets, totalTickets } = await ListTicketsServiceReport(
    companyId,
    {
      searchParam,
      queueIds,
      tags: tagsIds,
      users: usersIds,
      status: statusIds,
      dateFrom,
      dateTo,
      userId,
      contactId,
      whatsappId: whatsappIds,
      onlyRated: onlyRated,
      protocol,
      sortBy,
      sortOrder
    },
    +pageNumber,

    +pageSize
  );

  return res.status(200).json({ tickets, totalTickets });
};

export const kanban = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    dateStart,
    dateEnd,
    updatedAt,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    tags: tagIdsStringified,
    users: userIdsStringified,
    whatsappIds: whatsappIdsStringified,
    withUnreadMessages
  } = req.query as IndexQuery;

  const userId = req.user.id;
  const { companyId } = req.user;

  let queueIds: number[] = [];
  let tagsIds: number[] = [];
  let usersIds: number[] = [];
  let whatsappIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  if (userIdsStringified) {
    usersIds = JSON.parse(userIdsStringified);
  }

  if (whatsappIdsStringified) {
    whatsappIds = JSON.parse(whatsappIdsStringified);
  }

  const { tickets, count, hasMore } = await ListTicketsServiceKanban({
    searchParam,
    tags: tagsIds,
    users: usersIds,
    pageNumber,
    status,
    date,
    dateStart,
    dateEnd,
    updatedAt,
    showAll,
    userId,
    queueIds,
    whatsappIds,
    withUnreadMessages,
    companyId
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status, userId, queueId, whatsappId }: TicketData =
    req.body;
  const { companyId, id: loggedUserId, profile } = req.user;

  try {
    const user = await ShowUserService(loggedUserId, companyId);
    const companySettings = await FindCompanySettingsService({ companyId });
    const allowUserCrossQueues =
      companySettings?.allowUserCrossQueues === true ||
      String(companySettings?.allowUserCrossQueues) === "true";

    const requestedQueueId = queueId ? Number(queueId) : null;
    const requestedWhatsappId = whatsappId ? Number(whatsappId) : null;
    const userQueueIds = (user.queues || []).map(queue => queue.id);
    const userWhatsappIds = [
      ...(user.whatsapps || []).map(whatsapp => whatsapp.id),
      user.whatsappId
    ].filter(Boolean);

    if (profile !== "admin" && !allowUserCrossQueues) {
      if (requestedQueueId && !userQueueIds.includes(requestedQueueId)) {
        throw new AppError("ERR_NO_PERMISSION", 403);
      }

      if (requestedWhatsappId && !userWhatsappIds.includes(requestedWhatsappId)) {
        throw new AppError("ERR_NO_PERMISSION", 403);
      }
    }

    const ticket = await CreateTicketService({
      contactId,
      status,
      userId: Number(loggedUserId || userId),
      companyId,
      queueId: requestedQueueId,
      whatsappId: requestedWhatsappId ? String(requestedWhatsappId) : undefined
    });

    // Ticket criado manualmente pelo atendente: NÃO enviar saudação automática
    // (a saudação só deve disparar quando o cliente inicia a conversa).

    const io = getIO();
    io.of(String(companyId))
      // .to(ticket.status)
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });

    return res.status(200).json(ticket);
  } catch (err) {
    // Se for erro 409 (ticket já existe)
    if (err.statusCode === 409) {
      const existingTicket = JSON.parse(err.message);
      
      // Verificar se o usuário que está tentando criar é o dono do ticket existente
      if (existingTicket.userId === userId) {
        // É o mesmo usuário, retornar o ticket existente
        return res.status(200).json(existingTicket);
      } else {
        // É outro usuário, retornar erro 403 (Forbidden)
        return res.status(403).json({
          error: "Ticket já existe",
          message: `Este contato já está sendo atendido por outro usuário: ${existingTicket.user?.name || 'Desconhecido'}`,
          ticket: existingTicket
        });
      }
    }
    // Para outros erros, lançar novamente
    throw err;
  }
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { id: userId, companyId } = req.user;

  const contact = await ShowTicketService(ticketId, companyId);

  // Log "access" removido: estava marcando "entrou na conversa" toda vez
  // que o ticket era aberto/clicado. Agora só é registrado quando o
  // ticket realmente é iniciado (transição para "open" no UpdateTicketService).

  return res.status(200).json(contact);
};

export const showLog = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { id: userId, companyId } = req.user;

  const log = await ShowLogTicketService({ ticketId, companyId });

  return res.status(200).json(log);
};

export const showReport = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  const report = await ShowTicketReportService({ ticketId, companyId });

  return res.status(200).json(report);
};

export const closingReport = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const {
    dateFrom,
    dateTo,
    status: statusStringified,
    queueIds: queueIdsStringified,
    users: userIdsStringified,
    closingSubject,
    page: pageNumber,
    pageSize
  } = req.query as any;

  const { companyId } = req.user;

  let queueIds: number[] = [];
  let usersIds: number[] = [];
  let statusIds: string[] = [];

  if (statusStringified) statusIds = JSON.parse(statusStringified);
  if (queueIdsStringified) queueIds = JSON.parse(queueIdsStringified);
  if (userIdsStringified) usersIds = JSON.parse(userIdsStringified);

  const { tickets, totalTickets } = await ListClosingReportService(
    companyId,
    {
      dateFrom,
      dateTo,
      status: statusIds,
      queueIds,
      users: usersIds,
      closingSubject
    },
    pageNumber ? +pageNumber : 1,
    pageSize ? +pageSize : 9999999
  );

  return res.status(200).json({ tickets, totalTickets });
};





export const showFromUUID = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { uuid } = req.params;
  const { id: userId, companyId } = req.user;

  const ticket: Ticket = await ShowTicketUUIDService(uuid, companyId);

  if (
    ["whatsapp", "whatsapp_oficial"].includes(ticket.channel) &&
    ticket.whatsappId &&
    ticket.unreadMessages > 0
  ) {
    SetTicketMessagesAsRead(ticket);
  }

  // Log "access" removido: ver comentário em `show`. Evita registrar
  // "entrou na conversa" toda vez que o ticket é apenas aberto via UUID.

  return res.status(200).json(ticket);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const rawTicketData: TicketData = req.body;
  const ticketData = {
    ...rawTicketData,
    whatsappId: rawTicketData.whatsappId ? Number(rawTicketData.whatsappId) : undefined
  };
  const { companyId } = req.user;

  const mutex = new Mutex();
  const { ticket } = await mutex.runExclusive(async () => {
    const result = await UpdateTicketService({
      ticketData,
      ticketId,
      companyId
    });
    return result;
  });

  return res.status(200).json(ticket);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { id: userId, companyId } = req.user;

  // await ShowTicketService(ticketId, companyId);

  const ticket = await DeleteTicketService(ticketId, userId, companyId);

  const io = getIO();

  io.of(String(companyId))
    // .to(ticket.status)
    // .to(ticketId)
    // .to("notification")
    .emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticketId: +ticketId
    });

  return res.status(200).json({ message: "ticket deleted" });
};

export const closeAll = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { status }: TicketData = req.body;
  const io = getIO();

  const { rows: tickets } = await Ticket.findAndCountAll({
    where: { companyId: companyId, status: status },
    order: [["updatedAt", "DESC"]]
  });

  // Antes era `tickets.forEach(async ...)`: o forEach não espera nada, então a
  // resposta 200 saía ANTES de qualquer ticket ter sido fechado de verdade —
  // a tela recarregava a lista velha e o contador continuava lá. Pior: erro em
  // um ticket virava promessa rejeitada solta, sem dono. Agora fecha um a um,
  // isolando falhas, e só responde quando terminou.
  let fechados = 0;

  for (const ticket of tickets) {
    const ticketData = {
      status: "closed",
      userId: ticket.userId || null,
      queueId: ticket.queueId || null,
      unreadMessages: 0,
      amountUsedBotQueues: 0,
      sendFarewellMessage: false
    };

    try {
      await UpdateTicketService({ ticketData, ticketId: ticket.id, companyId });
      fechados += 1;
    } catch (err: any) {
      logger.warn(
        `[closeAll] Falha ao fechar ticket ${ticket.id}: ${err?.message}`
      );
    }
  }

  return res.status(200).json({ total: tickets.length, fechados });
};

export const relatorioVendas = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { dateFrom, dateTo, userId } = req.query;
  const { companyId } = req.user;

  if (!dateFrom || !dateTo) {
    return res.status(400).json({
      error: "Data inicial e final são obrigatórias"
    });
  }

  try {
    const relatorio = await RelatorioVendasService({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      userId: userId ? Number(userId) : undefined,
      companyId
    });

    return res.status(200).json(relatorio);
  } catch (error) {
    console.error("Erro ao gerar relatório de vendas:", error);
    return res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
};

export const transferTickets = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { sourceConnectionId, targetConnectionId } = req.body;
  const { companyId } = req.user;

  try {
    // Contar tickets para transferir
    const ticketCount = await Ticket.count({
      where: {
        whatsappId: sourceConnectionId,
        companyId,
        status: ["open", "pending"]
      }
    });

    if (ticketCount === 0) {
      return res.status(200).json({
        requiresProgress: false,
        transferred: 0,
        message: "Nenhum ticket encontrado para transferir"
      });
    }

    const PROGRESS_THRESHOLD = 50;
    const io = getIO();

    if (ticketCount <= PROGRESS_THRESHOLD) {
      // Transferência imediata
      const tickets = await Ticket.findAll({
        where: {
          whatsappId: sourceConnectionId,
          companyId,
          status: ["open", "pending"]
        }
      });

      let transferred = 0;
      for (const ticket of tickets) {
        try {
          await ticket.update({ whatsappId: targetConnectionId });
          transferred++;
        } catch (error) {
          console.error(`Error transferring ticket ${ticket.id}:`, error);
        }
      }

      return res.status(200).json({
        requiresProgress: false,
        transferred,
        message: "Tickets transferidos com sucesso"
      });
    } else {
      // Transferência em background
      const jobId = `transfer-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}`;

      // Processar em background
      setTimeout(async () => {
        const BATCH_SIZE = 50;
        let processed = 0;

        try {
          while (processed < ticketCount) {
            const tickets = await Ticket.findAll({
              where: {
                whatsappId: sourceConnectionId,
                companyId,
                status: ["open", "pending"]
              },
              limit: BATCH_SIZE,
              offset: processed
            });

            if (tickets.length === 0) break;

            for (const ticket of tickets) {
              try {
                await ticket.update({ whatsappId: targetConnectionId });
                processed++;
              } catch (error) {
                console.error(`Error transferring ticket ${ticket.id}:`, error);
              }
            }

            // Enviar progresso via WebSocket
            io.to(`company-${companyId}`).emit(`transferTickets-${companyId}`, {
              action: "progress",
              current: processed,
              total: ticketCount,
              jobId
            });

            // Pequena pausa para não sobrecarregar o banco
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Enviar conclusão
          io.to(`company-${companyId}`).emit(`transferTickets-${companyId}`, {
            action: "completed",
            transferred: processed,
            jobId
          });
        } catch (error) {
          console.error(`Error in transfer job ${jobId}:`, error);

          // Enviar erro via WebSocket
          io.to(`company-${companyId}`).emit(`transferTickets-${companyId}`, {
            action: "error",
            message: "Erro na transferência",
            jobId
          });
        }
      }, 0);

      return res.status(200).json({
        requiresProgress: true,
        totalTickets: ticketCount,
        jobId,
        message: "Transferência iniciada em background"
      });
    }
  } catch (error) {
    console.error("Error in transferTickets:", error);
    return res.status(500).json({
      message: "Erro interno do servidor"
    });
  }
};

export const triggerFlow = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { flowId } = req.body;
  const { companyId } = req.user;

  try {
    // Verificar se o ticket existe e está com status "open"
    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        companyId,
        status: "open"
      },
      include: [
        { model: Contact, as: "contact" },
        { model: User, as: "user" },
        { model: Whatsapp, as: "whatsapp" }
      ]
    });

    if (!ticket) {
      return res.status(404).json({
        error: "Ticket não encontrado ou não está em atendimento"
      });
    }

    // Verificar se o usuário tem permissão para disparar fluxo no ticket
    if (ticket.userId !== parseInt(req.user.id)) {
      return res.status(403).json({
        error: "Você não tem permissão para disparar fluxo neste ticket"
      });
    }

    // Verificar se o fluxo existe
    const flow = await FlowBuilderModel.findOne({
      where: {
        id: flowId,
        company_id: companyId
      }
    });

    if (!flow) {
      return res.status(404).json({
        error: "Fluxo não encontrado"
      });
    }

    // Chamar o serviço para disparar o fluxo
    const result = await TriggerFlowService({
      ticketId: ticket.id,
      flowId: flow.id,
      companyId,
      userId: parseInt(req.user.id)
    });

    return res.status(200).json({
      success: true,
      message: "Fluxo disparado com sucesso",
      data: result
    });

  } catch (error) {
    console.error("Erro ao disparar fluxo no ticket:", error);
    return res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
};

/**
 * Verifica se o ticket está dentro da janela de 24h para WhatsApp Oficial
 */
export const checkWhatsAppOfficialWindow = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  try {
    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        companyId
      },
      include: [
        { model: Contact, as: "contact" },
        { model: Whatsapp, as: "whatsapp" }
      ]
    });

    if (!ticket) {
      return res.status(404).json({
        error: "Ticket não encontrado"
      });
    }

    // Verificar se é WhatsApp Oficial
    const isWhatsAppOfficial = ticket.channel === "whatsapp_oficial";

    if (!isWhatsAppOfficial) {
      return res.json({
        needsTemplate: false,
        isWithin24Hours: true,
        isWhatsAppOfficial: false
      });
    }

    // Verificar última interação do cliente
    const lastInteraction = ticket.contact.lastInteractionClient;
    
    let needsTemplate = false;
    let isWithin24Hours = false;

    if (!lastInteraction) {
      // Nunca interagiu - precisa de template
      needsTemplate = true;
      isWithin24Hours = false;
    } else {
      // Calcular diferença em horas
      const now = new Date();
      const diffMs = now.getTime() - new Date(lastInteraction).getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      isWithin24Hours = diffHours < 24;
      needsTemplate = !isWithin24Hours;
    }

    return res.json({
      needsTemplate,
      isWithin24Hours,
      isWhatsAppOfficial,
      lastInteractionClient: lastInteraction,
      hoursElapsed: lastInteraction 
        ? Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60))
        : null
    });

  } catch (error) {
    console.error("Erro ao verificar janela de 24h:", error);
    return res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
};

export const unreadCounts = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id } = req.user;

  const contagens = await CountUnreadTabBadgesService({
    companyId,
    userId: +id
  });

  return res.status(200).json(contagens);
};
