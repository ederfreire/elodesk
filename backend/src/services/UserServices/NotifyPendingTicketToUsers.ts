import { Op } from "sequelize";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { getWbot } from "../../libs/wbot";
import { normalizeJid } from "../../utils";
import getCachedOnWhatsApp from "../../utils/onWhatsAppCache";
import logger from "../../utils/logger";

// Resolve a usable WhatsApp+wbot for sending automatic notifications.
const resolveUserNotificationWbot = async (
  companyId: number,
  preferredId?: number | null
): Promise<{ whatsapp: Whatsapp | null; wbot: any | null }> => {
  const tryWbot = (wpp: Whatsapp | null) => {
    if (!wpp) return null;
    try {
      return getWbot(wpp.id) || null;
    } catch {
      return null;
    }
  };

  if (preferredId) {
    const preferred = await Whatsapp.findOne({
      where: { id: preferredId, companyId }
    });
    if (preferred?.status === "CONNECTED") {
      const wb = tryWbot(preferred);
      if (wb) return { whatsapp: preferred, wbot: wb };
    }
  }

  const connected = await Whatsapp.findAll({
    where: { companyId, status: "CONNECTED" }
  });
  for (const wpp of connected) {
    const wb = tryWbot(wpp);
    if (wb) return { whatsapp: wpp, wbot: wb };
  }

  try {
    const fallback = await GetDefaultWhatsApp(companyId);
    const wb = tryWbot(fallback);
    if (wb) return { whatsapp: fallback, wbot: wb };
  } catch {
    // ignore
  }
  return { whatsapp: null, wbot: null };
};

export type NotificationType = "pending" | "open" | "kanban";

interface NotificationOptions {
  type?: NotificationType;
  extra?: Record<string, string>;
}

// Throttling map: key = `${userId}-${ticketId}-${type}` -> { count, lastSentAt }
const notificationTracker = new Map<
  string,
  { count: number; lastSentAt: number }
>();

const sanitizeNumber = (raw?: string | null): string | null => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
};

// Aceita múltiplos números no campo whatsappNumber, separados por
// vírgula, ponto-e-vírgula, espaço ou quebra de linha.
const parseNumbers = (raw?: string | null): string[] => {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\s\n]+/)
    .map(n => sanitizeNumber(n))
    .filter((n): n is string => !!n);
};

const NotifyPendingTicketToUsers = async (
  ticket: Ticket,
  options: NotificationOptions = {}
): Promise<void> => {
  const type: NotificationType = options.type || "pending";
  try {
    if (!ticket || !ticket.queueId) return;
    if (type === "pending" && ticket.status !== "pending") return;
    if (type === "open" && ticket.status !== "open") return;

    const flagField =
      type === "open"
        ? "notifyOpenTicketWhatsapp"
        : type === "kanban"
          ? "notifyKanbanTicketWhatsapp"
          : "notifyPendingTicketWhatsapp";

    const users = await User.findAll({
      where: {
        companyId: ticket.companyId,
        [flagField]: "enabled",
        whatsappNumber: { [Op.ne]: null }
      },
      include: [
        {
          model: Queue,
          as: "queues",
          where: { id: ticket.queueId },
          required: true,
          through: { attributes: [] }
        }
      ]
    });

    logger.info(
      `[NotifyTicket:${type}] ${users?.length || 0} usuário(s) elegíveis - company=${ticket.companyId}, queue=${ticket.queueId}, flag=${flagField}`
    );
    if (!users || users.length === 0) {
      logger.info(
        `[NotifyTicket:${type}] Nenhum usuário com ${flagField}=enabled vinculado à fila ${ticket.queueId}. Verifique: (1) toggle ligado, (2) número salvo, (3) usuário associado à fila.`
      );
      return;
    }

    const contact = await Contact.findByPk(ticket.contactId);
    const queue = await Queue.findByPk(ticket.queueId);

    const contactName = contact?.name || contact?.number || "Cliente";
    const queueName = queue?.name || "—";

    // i18n: mensagem enviada no idioma configurado no perfil do usuário
    type Dict = {
      titles: Record<NotificationType, string>;
      queue: string;
      contact: string;
      ticket: string;
      footer: string;
    };
    const dictionaries: Record<string, Dict> = {
      pt: {
        titles: {
          pending: "🔔 *Novo ticket pendente*",
          open: "✅ *Ticket em atendimento*",
          kanban: "📋 *Atualização no Kanban*"
        },
        queue: "Fila",
        contact: "Contato",
        ticket: "Ticket",
        footer: "Acesse o sistema para mais detalhes."
      },
      en: {
        titles: {
          pending: "🔔 *New pending ticket*",
          open: "✅ *Ticket in service*",
          kanban: "📋 *Kanban update*"
        },
        queue: "Queue",
        contact: "Contact",
        ticket: "Ticket",
        footer: "Log in to the system for more details."
      },
      es: {
        titles: {
          pending: "🔔 *Nuevo ticket pendiente*",
          open: "✅ *Ticket en atención*",
          kanban: "📋 *Actualización en el Kanban*"
        },
        queue: "Cola",
        contact: "Contacto",
        ticket: "Ticket",
        footer: "Acceda al sistema para más detalles."
      }
    };

    const resolveDict = (lang?: string | null): Dict => {
      const key = String(lang || "pt").toLowerCase().split(/[-_]/)[0];
      if (key === "en") return dictionaries.en;
      if (key === "es") return dictionaries.es;
      return dictionaries.pt;
    };

    const extraLines = Object.entries(options.extra || {})
      .map(([k, v]) => `${k}: *${v}*`)
      .join("\n");

    const buildDefaultBody = (lang?: string | null): string => {
      const t = resolveDict(lang);
      return (
        `${t.titles[type]}\n\n` +
        `${t.queue}: *${queueName}*\n` +
        `${t.contact}: *${contactName}*\n` +
        `${t.ticket}: #${ticket.id}` +
        (extraLines ? `\n${extraLines}` : "") +
        `\n\n${t.footer}`
      );
    };


    const renderTemplate = (template: string, user: User): string => {
      return template
        .replace(/\{\{\s*queue\s*\}\}/gi, queueName)
        .replace(/\{\{\s*fila\s*\}\}/gi, queueName)
        .replace(/\{\{\s*contact\s*\}\}/gi, contactName)
        .replace(/\{\{\s*contato\s*\}\}/gi, contactName)
        .replace(/\{\{\s*ticket\s*\}\}/gi, String(ticket.id))
        .replace(/\{\{\s*ticketId\s*\}\}/gi, String(ticket.id))
        .replace(/\{\{\s*user\s*\}\}/gi, user?.name || "")
        .replace(/\{\{\s*usuario\s*\}\}/gi, user?.name || "")
        .replace(/\{\{\s*usuário\s*\}\}/gi, user?.name || "")
        .replace(/\{\{\s*tipo\s*\}\}/gi, type)
        .replace(/\{\{\s*type\s*\}\}/gi, type);
    };

    for (const user of users) {
      const numbers = parseNumbers(user.whatsappNumber);
      if (!numbers.length) continue;

      // Resolve a working WhatsApp/wbot for this specific user (prefer their choice)
      const { whatsapp, wbot } = await resolveUserNotificationWbot(
        ticket.companyId,
        user.notificationWhatsappId
      );
      if (!whatsapp || !wbot) {
        logger.warn(
          `[NotifyTicket:${type}] Sem conexão WhatsApp disponível para user ${user.id} (preferida=${user.notificationWhatsappId || "—"}).`
        );
        continue;
      }

      // Throttling: max count + interval (compartilhado entre os números do mesmo usuário)
      const trackerKey = `${user.id}-${ticket.id}-${type}`;
      const maxCount = Math.max(1, Number(user.notificationMaxCount) || 1);
      const intervalMs =
        Math.max(0, Number(user.notificationIntervalMinutes) || 0) * 60 * 1000;
      const now = Date.now();
      const tracked = notificationTracker.get(trackerKey);
      if (tracked) {
        if (tracked.count >= maxCount) continue;
        if (intervalMs > 0 && now - tracked.lastSentAt < intervalMs) continue;
      }

      const customTemplate = (user.pendingTicketNotificationMessage || "").trim();
      const body = customTemplate
        ? renderTemplate(customTemplate, user)
        : buildDefaultBody((user as any).language);

      let anySent = false;
      for (const number of numbers) {
        let jid = normalizeJid(`${number}@s.whatsapp.net`);
        try {
          const validation = await getCachedOnWhatsApp(wbot, jid);
          if (validation?.exists && validation.jid) jid = validation.jid;
        } catch (err) {
          logger.warn(
            `[NotifyTicket:${type}] onWhatsApp falhou para ${jid}: ${err.message}`
          );
        }
        try {
          await wbot.sendMessage(jid, { text: body });
          anySent = true;
          logger.info(
            `[NotifyTicket:${type}] Notificação enviada para user ${user.id} (${jid}) - ticket ${ticket.id}`
          );
        } catch (err) {
          logger.error(
            `[NotifyTicket:${type}] Falha ao enviar para user ${user.id} (${jid}): ${err.message}`
          );
        }
      }
      if (anySent) {
        notificationTracker.set(trackerKey, {
          count: (tracked?.count || 0) + 1,
          lastSentAt: now
        });
      }
    }
  } catch (err) {
    logger.error(`[NotifyTicket:${type}] Erro geral: ${err.message}`);
  }
};

// Cleanup tracker every 6h - prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  notificationTracker.forEach((value, key) => {
    if (value.lastSentAt < cutoff) notificationTracker.delete(key);
  });
}, 6 * 60 * 60 * 1000).unref?.();

export default NotifyPendingTicketToUsers;