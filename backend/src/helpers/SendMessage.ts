import Whatsapp from "../models/Whatsapp";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import GetWhatsappWbot from "./GetWhatsappWbot";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import formatBody from "../helpers/Mustache";

import { getMessageOptions } from "../services/WbotServices/SendWhatsAppMedia";
import { getJidOf } from "../services/WbotServices/getJidOf";
import SendWhatsAppOficialMessage from "../services/WhatsAppOficial/SendWhatsAppOficialMessage";
import { SendWacallsText, SendWacallsMediaMessage } from "../services/WacallsServices/SendWacallsMessageService";
import logger from "../utils/logger";

export type MessageData = {
  number: number | string;
  body: string;
  mediaPath?: string;
  companyId?: number;
  mediaName?: string;
};

const normalizeNumber = (n: number | string): string =>
  String(n).replace(/\D/g, "");

// Nome ficou de quando só existia pro branch "whatsapp_oficial" — hoje é
// reaproveitado pelo branch wacalls também (mesma busca: contato pelo
// número + ticket mais recente dessa conexão). Inclui `contact` além de
// `whatsapp` porque SendWacallsText/SendWacallsMediaMessage precisam de
// ticket.contact (remoteJid pra resolver o JID certo, contactId pra
// gravar a mensagem vinculada ao contato certo).
const findOficialTicket = async (
  whatsapp: Whatsapp,
  number: number | string
): Promise<Ticket | null> => {
  const numericNumber = normalizeNumber(number);
  const contact = await Contact.findOne({
    where: { number: numericNumber, companyId: whatsapp.companyId }
  });
  if (!contact) return null;
  const ticket = await Ticket.findOne({
    where: {
      contactId: contact.id,
      whatsappId: whatsapp.id,
      companyId: whatsapp.companyId
    },
    order: [["updatedAt", "DESC"]],
    include: [
      { model: Whatsapp, as: "whatsapp" },
      { model: Contact, as: "contact" }
    ]
  });
  return ticket;
};

export const SendMessage = async (
  whatsapp: Whatsapp,
  messageData: MessageData,
  isGroup: boolean = false
): Promise<any> => {
  // ✅ ROTEAR PARA API OFICIAL quando a conexão for whatsapp_oficial
  if (whatsapp.channel === "whatsapp_oficial") {
    try {
      const ticket = await findOficialTicket(whatsapp, messageData.number);
      if (!ticket) {
        throw new Error(
          `[SendMessage/Oficial] Nenhum ticket encontrado para number=${messageData.number}, whatsappId=${whatsapp.id}`
        );
      }
      const body = formatBody(`${messageData.body || ""}`, ticket);

      if (messageData.mediaPath) {
        const fakeMedia: any = {
          path: messageData.mediaPath,
          originalname: messageData.mediaName || "file",
          mimetype: "application/octet-stream"
        };
        return await SendWhatsAppOficialMessage({
          body,
          ticket,
          type: null,
          media: fakeMedia
        } as any);
      }

      return await SendWhatsAppOficialMessage({
        body,
        ticket,
        type: "text"
      } as any);
    } catch (err: any) {
      logger.error(`[SendMessage/Oficial] erro: ${err?.message || err}`);
      throw new Error(err);
    }
  }

  // ✅ ROTEAR PARA WACALLS quando a conexão for o canal wacalls (WhatsApp
  // Plus - Voz + Msg). Sem isso caía direto no branch Baileys abaixo, que
  // chama GetWhatsappWbot — não existe sessão Baileys pra uma conexão
  // wacalls, então toda chamada por aqui (nós de flow que usam o helper
  // SendMessage genérico) falhava silenciosamente/lançava erro.
  if (whatsapp.channel === "wacalls") {
    try {
      const ticket = await findOficialTicket(whatsapp, messageData.number);
      if (!ticket) {
        throw new Error(
          `[SendMessage/Wacalls] Nenhum ticket encontrado para number=${messageData.number}, whatsappId=${whatsapp.id}`
        );
      }
      const body = formatBody(`${messageData.body || ""}`, ticket);

      if (messageData.mediaPath) {
        const mimetype = (mime.lookup(messageData.mediaPath) || "application/octet-stream") as string;
        const fakeMedia: any = {
          fieldname: "file",
          originalname: messageData.mediaName || path.basename(messageData.mediaPath),
          encoding: "7bit",
          mimetype,
          size: fs.statSync(messageData.mediaPath).size,
          destination: path.dirname(messageData.mediaPath),
          filename: path.basename(messageData.mediaPath),
          path: messageData.mediaPath
        };
        return await SendWacallsMediaMessage({ ticket, media: fakeMedia, body });
      }

      return await SendWacallsText({ ticket, body });
    } catch (err: any) {
      logger.error(`[SendMessage/Wacalls] erro: ${err?.message || err}`);
      throw new Error(err);
    }
  }

  try {
    const wbot = await GetWhatsappWbot(whatsapp);
    const chatId = `${messageData.number}@${!!isGroup ? "g.us" : "s.whatsapp.net"}`;
    const companyId = messageData?.companyId
      ? messageData.companyId.toString()
      : null;

    let message;

    if (messageData.mediaPath) {
      const options = await getMessageOptions(
        messageData.mediaName,
        messageData.mediaPath,
        companyId,
        messageData.body
      );
      if (options) {
        message = await wbot.sendMessage(getJidOf(chatId), {
          ...options
        });
      }
    } else {
      const body = formatBody(`${messageData.body}`);
      message = await wbot.sendMessage(getJidOf(chatId), { text: body });
    }

    return message;
  } catch (err: any) {
    throw new Error(err);
  }
};
