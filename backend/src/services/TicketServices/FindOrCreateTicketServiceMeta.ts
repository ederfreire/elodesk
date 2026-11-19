import { subHours } from "date-fns";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import Setting from "../../models/Setting";

interface TicketData {
  status?: string;
  companyId?: number;
  unreadMessages?: number;
}

/**
 * ✅ INDEPENDÊNCIA POR CONEXÃO (WhatsApp Oficial / Meta):
 * Cada whatsappId mantém seu próprio ciclo de tickets.
 * Se o mesmo contato escrever em números diferentes, cada número terá seu ticket
 * separado e o ticket aberto em outra conexão NÃO é fechado nem reaproveitado.
 */
const FindOrCreateTicketServiceMeta = async (
  contact: Contact,
  whatsappId: number,
  unreadMessages: number,
  companyId: number,
  channel: string
): Promise<Ticket> => {
  // 1) Ticket aberto/pendente/fechado NA MESMA CONEXÃO
  let ticket = await Ticket.findOne({
    where: {
      status: {
        [Op.or]: ["open", "pending", "closed"]
      },
      contactId: contact.id,
      companyId,
      channel,
      whatsappId
    },
    order: [["id", "DESC"]]
  });

  if (ticket) {
    await ticket.update({ unreadMessages });
  }

  // 2) Último ticket do contato NA MESMA CONEXÃO (reabertura)
  if (!ticket) {
    ticket = await Ticket.findOne({
      where: {
        contactId: contact.id,
        channel,
        whatsappId
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages,
        companyId,
        channel
      });
      await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId,
        whatsappId: ticket.whatsappId,
        userId: ticket.userId
      });
    }

    const msgIsGroupBlock = await Setting.findOne({
      where: { key: "timeCreateNewTicket" }
    });

    const value = msgIsGroupBlock ? parseInt(msgIsGroupBlock.value, 10) : 7200;
  }

  // 3) Ticket recente (últimas 2h) NA MESMA CONEXÃO
  if (!ticket) {
    ticket = await Ticket.findOne({
      where: {
        updatedAt: {
          [Op.between]: [+subHours(new Date(), 2), +new Date()]
        },
        contactId: contact.id,
        whatsappId
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      await ticket.update({
        status: "pending",
        userId: null,
        unreadMessages,
        companyId,
        channel
      });
      await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId,
        whatsappId: ticket.whatsappId,
        userId: ticket.userId
      });
    }
  }

  // 4) Nenhum ticket na conexão => cria novo (independente do que existir em outras conexões)
  if (!ticket) {
    ticket = await Ticket.create({
      contactId: contact.id,
      status: "pending",
      isGroup: false,
      unreadMessages,
      whatsappId,
      companyId,
      channel,
      isActiveDemand: false
    });

    await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId,
      userId: ticket.userId
    });
  }
  // ❌ REMOVIDO: else { await ticket.update({ whatsappId }); }
  // Esse update sobrescrevia a conexão de um ticket já existente, causando o bug
  // de "fechar/mover o ticket entre conexões" quando o contato falava em outro número.

  ticket = await ShowTicketService(ticket.id, companyId);

  return ticket;
};

export default FindOrCreateTicketServiceMeta;
