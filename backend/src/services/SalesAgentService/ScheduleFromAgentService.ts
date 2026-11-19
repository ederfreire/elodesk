import SalesAgent from "../../models/SalesAgent";
import SalesAgentLead from "../../models/SalesAgentLead";
import Contact from "../../models/Contact";
import CreateCalendarEventService from "../GoogleCalendarService/CreateCalendarEventService";
import ShowTicketService from "../TicketServices/ShowTicketService";
import logger from "../../utils/logger";
import AppError from "../../errors/AppError";

/**
 * Cria o evento na agenda a partir de um horário escolhido pelo cliente.
 *
 * A ORDEM IMPORTA
 * O evento é criado PRIMEIRO, e só depois o lead é atualizado. Gravar o
 * agendamento antes e falhar na criação deixaria o sistema afirmando que
 * existe uma reunião que ninguém tem na agenda — o pior desfecho possível,
 * porque o cliente aparece e não há nada marcado.
 *
 * NÃO EXISTE AGENDAMENTO SEM CONFIRMAÇÃO DO GOOGLE
 * Se a API não devolver um eventId, a função lança. O chamador nunca deve
 * dizer ao cliente que está marcado sem essa confirmação.
 */

interface Params {
  ticketId: number;
  companyId: number;
  /** ISO 8601 do início, vindo de ListAvailableSlotsService. */
  startISO: string;
  /** Texto livre para o corpo do evento. */
  observacao?: string;
}

const ScheduleFromAgentService = async ({
  ticketId,
  companyId,
  startISO,
  observacao
}: Params) => {
  const agente = await SalesAgent.findOne({
    where: { companyId, active: true },
    order: [["id", "ASC"]]
  });

  if (!agente) throw new AppError("ERR_SALES_AGENT_NOT_FOUND", 404);
  if (!agente.schedulingEnabled) throw new AppError("ERR_SCHEDULING_DISABLED", 400);

  const ticket = await ShowTicketService(ticketId, companyId);
  if (!ticket) throw new AppError("ERR_NO_TICKET_FOUND", 404);

  const contato = await Contact.findByPk(ticket.contactId);
  const nome = contato?.name || "Cliente";

  const lead = await SalesAgentLead.findOne({ where: { ticketId } });

  const partes = [
    `Contato: ${nome}`,
    contato?.number ? `WhatsApp: ${contato.number}` : null,
    lead?.product ? `Interesse: ${lead.product}` : null,
    lead?.value ? `Valor indicado: ${lead.value}` : null,
    lead?.paymentMethod ? `Pagamento: ${lead.paymentMethod}` : null,
    observacao || null,
    `Atendimento #${ticketId}`
  ].filter(Boolean);

  const evento = await CreateCalendarEventService({
    companyId,
    summary: `${nome} — ${lead?.product || "Atendimento comercial"}`,
    description: partes.join("\n"),
    startISO,
    durationMinutes: Number(agente.eventDurationMinutes) || 30,
    calendarId: agente.googleCalendarId || undefined,
    withMeet: !!agente.createMeetLink,
    // O contato veio pelo WhatsApp; e-mail raramente existe. Sem convidado,
    // mandar convite não faria nada além de gerar erro na API.
    sendInvites: false
  });

  if (!evento?.eventId) {
    throw new AppError("ERR_CALENDAR_EVENT_FAILED", 400);
  }

  if (lead) {
    await lead.update({
      scheduledAt: new Date(startISO),
      meetLink: evento.hangoutLink || null
    });
  }

  logger.info(
    `[SalesAgent] Agendamento criado para o ticket ${ticketId} em ${startISO}` +
      (evento.hangoutLink ? " com Meet" : "")
  );

  return {
    eventId: evento.eventId,
    start: startISO,
    meetLink: evento.hangoutLink || null,
    htmlLink: evento.htmlLink || null
  };
};

export default ScheduleFromAgentService;
