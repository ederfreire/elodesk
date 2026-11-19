import { WASocket } from "@whiskeysockets/baileys";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import logger from "../../utils/logger";
import { getJidOf } from "./getJidOf";

interface Request {
  message: Message;
  ticket: Ticket;
  emoji: string;
}

// Envia a reação de verdade para o WhatsApp (Baileys). Antes disso a reação era
// apenas gravada no banco/UI, então o contato nunca via o emoji no aparelho.
const ReactWhatsAppMessage = async ({
  message,
  ticket,
  emoji
}: Request): Promise<void> => {
  if (message.isPrivate) return;

  let key: any = null;
  try {
    if (message.dataJson) {
      const parsed = JSON.parse(message.dataJson);
      key = parsed?.key || parsed?.message?.key || null;
    }
  } catch (err) {
    key = null;
  }

  const remoteJid = message.remoteJid || ticket.contact?.remoteJid || null;

  if (!key || !key.id) {
    // Reconstrói a key mínima quando dataJson não tem (mensagens antigas/API).
    if (!remoteJid || !message.wid) {
      throw new AppError(
        "Não foi possível reagir: esta mensagem é antiga e não tem os dados necessários no WhatsApp.",
        400
      );
    }
    key = {
      remoteJid,
      id: message.wid,
      fromMe: message.fromMe,
      ...(ticket.isGroup && !message.fromMe && message.participant
        ? { participant: message.participant }
        : {})
    };
  }

  if (!key.remoteJid && remoteJid) {
    key.remoteJid = remoteJid;
  }

  try {
    const wbot = await GetTicketWbot(ticket);
    await (wbot as WASocket).sendMessage(getJidOf(key.remoteJid), {
      react: {
        // String vazia remove a reação, é o protocolo do WhatsApp.
        text: emoji || "",
        key
      }
    });
  } catch (err: any) {
    logger.error(`[ReactWhatsAppMessage] ${err?.message || err}`);
    throw new AppError(
      "Não foi possível enviar a reação para o WhatsApp. Verifique se a conexão está ativa e tente novamente.",
      400
    );
  }
};

export default ReactWhatsAppMessage;
