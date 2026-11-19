import LogTicket from "../../models/LogTicket";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";

interface Request {
  ticketId: string | number;
  companyId: string | number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ShowLogTicketService = async ({
  ticketId,
  companyId
}: Request): Promise<LogTicket[]> => {
  let numericId: number | null = null;

  if (typeof ticketId === "number") {
    numericId = ticketId;
  } else if (/^\d+$/.test(String(ticketId))) {
    numericId = Number(ticketId);
  } else if (UUID_RE.test(String(ticketId))) {
    const ticket = await Ticket.findOne({
      where: { uuid: String(ticketId), companyId: Number(companyId) },
      attributes: ["id"]
    });
    if (!ticket) return [];
    numericId = ticket.id;
  } else {
    return [];
  }

  const logs = await LogTicket.findAll({
    where: { ticketId: numericId },
    include: [
      { model: User, as: "user", attributes: ["id", "name"] },
      { model: Queue, as: "queue", attributes: ["id", "name"] }
    ],
    order: [["createdAt", "DESC"]]
  });

  return logs;
};

export default ShowLogTicketService;
