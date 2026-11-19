import Ticket from "../models/Ticket";
import Message from "../models/Message";
import Contact from "../models/Contact";
import logger from "../utils/logger";
import { resolverEtapasInatividade, proximaEtapa } from "./InactivityCadence";

// Map<ticketId, { timer, attempts }>
const pending: Map<number, { timer: NodeJS.Timeout; attempts: number }> = new Map();

export const cancelInactivityReminder = (ticketId: number): void => {
  const cur = pending.get(ticketId);
  if (cur) {
    clearTimeout(cur.timer);
    pending.delete(ticketId);
  }
};

export const scheduleInactivityReminder = (
  wbot: any,
  ticket: Ticket,
  contact: Contact,
  prompt: any
): void => {
  try {
    // Etapas da cadência: cada uma com seu tempo e seu texto. Sem etapas
    // configuradas, a função devolve a configuração antiga repetida N vezes,
    // então o comportamento de quem já usava fica idêntico.
    const etapas = resolverEtapasInatividade(prompt);
    if (etapas.length === 0) return;
    const maxReminders = etapas.length;

    const prev = pending.get(ticket.id);
    const attempts = prev ? prev.attempts : 0;
    if (prev) clearTimeout(prev.timer);

    const etapaAtual = proximaEtapa(etapas, attempts);
    if (!etapaAtual) {
      pending.delete(ticket.id);
      return;
    }

    const remoteJid = (ticket as any).contact?.number
      ? `${(ticket as any).contact.number}@${(ticket as any).isGroup ? "g.us" : "s.whatsapp.net"}`
      : null;
    if (!remoteJid) return;

    const fireReminder = async () => {
      try {
        // Verifica se ainda não houve resposta do cliente após o último envio do agente
        const last = await Message.findOne({
          where: { ticketId: ticket.id },
          order: [["createdAt", "DESC"]]
        });
        if (!last || !last.fromMe) {
          pending.delete(ticket.id);
          return;
        }
        // Ticket ainda aberto?
        const fresh = await Ticket.findByPk(ticket.id);
        if (!fresh || fresh.status !== "open" && fresh.status !== "pending") {
          pending.delete(ticket.id);
          return;
        }
        // Releitura: o texto é o da etapa correspondente ao lembrete atual.
        const cur0 = pending.get(ticket.id);
        const enviados = cur0 ? cur0.attempts : attempts;
        const etapa = proximaEtapa(etapas, enviados);
        if (!etapa) {
          pending.delete(ticket.id);
          return;
        }
        const message = etapa.message;

        const sent = await wbot.sendMessage(remoteJid, { text: `\u200e ${message}` });
        try {
          if (sent && (sent as any).key?.id) {
            await Message.create({
              id: (sent as any).key.id,
              ticketId: ticket.id,
              contactId: contact.id,
              body: message,
              fromMe: true,
              mediaType: "extendedTextMessage",
              read: true,
              ack: 1
            } as any);
          }
        } catch (e) { /* noop */ }
        const cur = pending.get(ticket.id);
        const newAttempts = (cur ? cur.attempts : attempts) + 1;
        logger.info(`[InactivityReminder] Ticket ${ticket.id}: lembrete ${newAttempts}/${maxReminders} enviado`);
        if (newAttempts >= maxReminders) {
          // Atingiu o limite — encerra ciclo
          pending.delete(ticket.id);
          logger.info(`[InactivityReminder] Ticket ${ticket.id}: limite de ${maxReminders} lembrete(s) atingido`);
          return;
        }
        // Reagenda próximo lembrete preservando o contador
        // O próximo lembrete usa o tempo da PRÓXIMA etapa — é isto que
        // permite "15 min, depois 2 h" em vez de sempre o mesmo intervalo.
        const proxima = proximaEtapa(etapas, newAttempts);
        if (!proxima) {
          pending.delete(ticket.id);
          return;
        }
        const nextTimer = setTimeout(fireReminder, proxima.minutes * 60 * 1000);
        pending.set(ticket.id, { timer: nextTimer, attempts: newAttempts });
      } catch (err: any) {
        logger.error(`[InactivityReminder] Falha ticket ${ticket.id}: ${err?.message}`);
        pending.delete(ticket.id);
      }
    };

    const timer = setTimeout(fireReminder, etapaAtual.minutes * 60 * 1000);

    pending.set(ticket.id, { timer, attempts });
  } catch (err: any) {
    logger.error(`[InactivityReminder] Erro ao agendar: ${err?.message}`);
  }
};