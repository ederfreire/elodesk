import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import LogTicket from "../../models/LogTicket";
import TicketTraking from "../../models/TicketTraking";
import AppError from "../../errors/AppError";

interface Request {
  ticketId: string | number;
  companyId: string | number;
}

interface TimelineEntry {
  type: string;
  userId: number | null;
  userName: string | null;
  queueId: number | null;
  queueName: string | null;
  createdAt: Date;
}

interface ReportResponse {
  ticket: {
    id: number;
    uuid: string;
    status: string;
    closingSubject: string | null;
    closingSummary: string | null;
    motivoFinalizacao: string | null;
    createdAt: Date;
    updatedAt: Date;
    contact: { id: number; name: string; number: string } | null;
    user: { id: number; name: string } | null;
    queue: { id: number; name: string } | null;
    whatsapp: { id: number; name: string } | null;
  };
  durationMs: number | null;
  startedAt: Date | null;
  closedAt: Date | null;
  agents: { id: number; name: string }[];
  queues: { id: number; name: string }[];
  timeline: TimelineEntry[];
}

const ShowTicketReportService = async ({
  ticketId,
  companyId
}: Request): Promise<ReportResponse> => {
  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId },
    include: [
      { model: Contact, as: "contact", attributes: ["id", "name", "number"] },
      { model: User, as: "user", attributes: ["id", "name"] },
      { model: Queue, as: "queue", attributes: ["id", "name"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name"] }
    ]
  });

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  const logs = await LogTicket.findAll({
    where: { ticketId },
    include: [
      { model: User, as: "user", attributes: ["id", "name"] },
      { model: Queue, as: "queue", attributes: ["id", "name"] }
    ],
    order: [["createdAt", "ASC"]]
  });

  const traking = await TicketTraking.findOne({
    where: { ticketId, companyId },
    order: [["createdAt", "DESC"]]
  });

  const timeline: TimelineEntry[] = logs.map(log => ({
    type: log.type,
    userId: log.user?.id ?? null,
    userName: log.user?.name ?? null,
    queueId: log.queue?.id ?? null,
    queueName: log.queue?.name ?? null,
    createdAt: log.createdAt
  }));

  // Distinct agents that handled the ticket
  const agentsMap = new Map<number, string>();
  logs.forEach(log => {
    if (log.user?.id) agentsMap.set(log.user.id, log.user.name);
  });
  if (ticket.user?.id) agentsMap.set(ticket.user.id, ticket.user.name);
  const agents = Array.from(agentsMap, ([id, name]) => ({ id, name }));

  // Distinct queues the ticket passed through
  const queuesMap = new Map<number, string>();
  logs.forEach(log => {
    if (log.queue?.id) queuesMap.set(log.queue.id, log.queue.name);
  });
  if (ticket.queue?.id) queuesMap.set(ticket.queue.id, ticket.queue.name);
  const queues = Array.from(queuesMap, ([id, name]) => ({ id, name }));

  const startedAt =
    traking?.startedAt || traking?.createdAt || ticket.createdAt || null;
  const closedAt =
    traking?.finishedAt ||
    traking?.closedAt ||
    (ticket.status === "closed" ? ticket.updatedAt : null);

  let durationMs: number | null = null;
  if (startedAt && closedAt) {
    durationMs = new Date(closedAt).getTime() - new Date(startedAt).getTime();
    if (durationMs < 0) durationMs = null;
  }

  return {
    ticket: {
      id: ticket.id,
      uuid: ticket.uuid,
      status: ticket.status,
      closingSubject: ticket.closingSubject ?? null,
      closingSummary: ticket.closingSummary ?? null,
      motivoFinalizacao: ticket.motivoFinalizacao ?? null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      contact: ticket.contact
        ? {
            id: ticket.contact.id,
            name: ticket.contact.name,
            number: ticket.contact.number
          }
        : null,
      user: ticket.user ? { id: ticket.user.id, name: ticket.user.name } : null,
      queue: ticket.queue
        ? { id: ticket.queue.id, name: ticket.queue.name }
        : null,
      whatsapp: ticket.whatsapp
        ? { id: ticket.whatsapp.id, name: ticket.whatsapp.name }
        : null
    },
    durationMs,
    startedAt,
    closedAt,
    agents,
    queues,
    timeline
  };
};

export default ShowTicketReportService;
