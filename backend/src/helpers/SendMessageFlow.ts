import Whatsapp from "../models/Whatsapp";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import GetWhatsappWbot from "./GetWhatsappWbot";

import { getMessageOptions } from "../services/WbotServices/SendWhatsAppMedia";
import { getJidOf } from "../services/WbotServices/getJidOf";
import SendWhatsAppOficialMessage from "../services/WhatsAppOficial/SendWhatsAppOficialMessage";
import { SendWacallsText } from "../services/WacallsServices/SendWacallsMessageService";
import formatBody from "./Mustache";
import logger from "../utils/logger";

export type MessageData = {
  number: number | string;
  body: string;
  mediaPath?: string;
};

const normalizeNumber = (n: number | string): string =>
  String(n).replace(/\D/g, "");

export const SendMessageFlow = async (
  whatsapp: Whatsapp,
  messageData: MessageData,
  isFlow: boolean = false,
  isRecord: boolean = false
): Promise<any> => {
  // ✅ ROTEAR PARA API OFICIAL quando a conexão for whatsapp_oficial
  if (whatsapp.channel === "whatsapp_oficial") {
    try {
      const numericNumber = normalizeNumber(messageData.number);
      const contact = await Contact.findOne({
        where: { number: numericNumber, companyId: whatsapp.companyId }
      });
      if (!contact) {
        throw new Error(
          `[SendMessageFlow/Oficial] Contato não encontrado number=${messageData.number}`
        );
      }
      const ticket = await Ticket.findOne({
        where: {
          contactId: contact.id,
          whatsappId: whatsapp.id,
          companyId: whatsapp.companyId
        },
        order: [["updatedAt", "DESC"]],
        include: [{ model: Whatsapp, as: "whatsapp" }]
      });
      if (!ticket) {
        throw new Error(
          `[SendMessageFlow/Oficial] Ticket não encontrado para number=${messageData.number}`
        );
      }
      const body = formatBody(`${messageData.body || ""}`, ticket);
      return await SendWhatsAppOficialMessage({
        body,
        ticket,
        type: "text"
      } as any);
    } catch (err: any) {
      logger.error(`[SendMessageFlow/Oficial] erro: ${err?.message || err}`);
      throw new Error(err);
    }
  }

  // ✅ ROTEAR PARA WACALLS quando a conexão for o canal wacalls (WhatsApp
  // Plus - Voz + Msg). Sem isso caía direto no branch Baileys abaixo, que
  // chama GetWhatsappWbot — não existe sessão Baileys pra uma conexão
  // wacalls, então o node "Enviar mensagem" do FlowBuilder (n8nSendMessage,
  // ver ActionsWebhookService.ts) lançava erro pra todo ticket wacalls.
  // Espelha o branch equivalente já existente em helpers/SendMessage.ts.
  if (whatsapp.channel === "wacalls") {
    try {
      const numericNumber = normalizeNumber(messageData.number);
      const contact = await Contact.findOne({
        where: { number: numericNumber, companyId: whatsapp.companyId }
      });
      if (!contact) {
        throw new Error(
          `[SendMessageFlow/Wacalls] Contato não encontrado number=${messageData.number}`
        );
      }
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
      if (!ticket) {
        throw new Error(
          `[SendMessageFlow/Wacalls] Ticket não encontrado para number=${messageData.number}`
        );
      }
      const body = formatBody(`${messageData.body || ""}`, ticket);
      return await SendWacallsText({ ticket, body });
    } catch (err: any) {
      logger.error(`[SendMessageFlow/Wacalls] erro: ${err?.message || err}`);
      throw new Error(err);
    }
  }

  try {
    const wbot = await GetWhatsappWbot(whatsapp);
    const chatId = `${messageData.number}@s.whatsapp.net`;

    let message;

    const templateButtons = [
      { index: 1, urlButton: { displayText: '⭐ Star Baileys on GitHub!', url: 'https://github.com/adiwajshing/Baileys' } },
      { index: 2, callButton: { displayText: 'Call me!+1 (234) 5678-901' } },
      { index: 3, quickReplyButton: { displayText: 'This is a reply, just like normal buttons!', id: 'id-like-buttons-message' } },
    ]

    const body = `\u200e${messageData.body}`;

    //@ts-ignore
    message = await wbot.sendMessage(getJidOf(chatId), { text: body, templateButtons: templateButtons });


    return message;
  } catch (err: any) {
    throw new Error(err);
  }
};
