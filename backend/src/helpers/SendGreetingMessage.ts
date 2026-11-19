/**
 * Serviço unificado para enviar saudação da conexão e/ou fila
 * Suporta Baileys, API Oficial e Z-API
 * 
 * IMPORTANTE: Este helper é usado apenas para criação manual de ticket
 * e para Z-API. O Baileys usa seu próprio verifyQueue com wbot direto.
 */
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import Queue from "../models/Queue";
import formatBody from "./Mustache";
import { buildChatbotExitOnlyText } from "./chatbotMenuLabels";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import SendWhatsAppOficialMessage from "../services/WhatsAppOficial/SendWhatsAppOficialMessage";
import { sendZApiText } from "../services/ZApiServices/ZApiService";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import logger from "../utils/logger";

type ChannelType = "baileys" | "whatsapp_oficial" | "zapi";

const detectChannel = (whatsapp: Whatsapp): ChannelType => {
  if (whatsapp.channel === "whatsapp_oficial") return "whatsapp_oficial";
  if (whatsapp.zapiInstanceId) return "zapi";
  return "baileys";
};

/**
 * Envia texto pelo canal correto COM persistência da mensagem.
 */
const sendTextByChannel = async (
  channel: ChannelType,
  body: string,
  ticket: Ticket,
  whatsapp: Whatsapp
): Promise<void> => {
  switch (channel) {
    case "baileys":
      await SendWhatsAppMessage({ body, ticket });
      break;

    case "whatsapp_oficial":
      await SendWhatsAppOficialMessage({
        body,
        ticket,
        type: "text",
        media: null,
        vCard: null
      });
      break;

    case "zapi": {
      const phone =
        ticket.contact?.number ||
        ticket.contact?.remoteJid?.replace("@s.whatsapp.net", "");

      if (!phone) {
        logger.warn("[SendGreeting][Z-API] Número do contato não encontrado");
        return;
      }

      const config = {
        zapiInstanceId: whatsapp.zapiInstanceId,
        zapiToken: whatsapp.zapiToken,
        zapiClientToken: whatsapp.zapiClientToken
      };

      const response = await sendZApiText(config, phone, body);
      const messageId = response?.messageId || `zapi_greeting_${Date.now()}`;

      await CreateMessageService({
        messageData: {
          wid: messageId,
          ticketId: ticket.id,
          body,
          fromMe: true,
          mediaType: "extendedTextMessage",
          read: true,
          ack: 2,
          isPrivate: false
        },
        companyId: ticket.companyId
      });
      break;
    }
  }
};

/**
 * Envia a saudação da conexão (greetingMessage) pelo canal correto.
 */
export const sendConnectionGreeting = async (
  ticket: Ticket,
  whatsapp: Whatsapp,
  extra?: Record<string, any>
): Promise<void> => {
  try {
    if (!whatsapp.greetingMessage || whatsapp.greetingMessage.trim().length === 0) {
      return;
    }
    const channel = detectChannel(whatsapp);
    const body = formatBody(`\u200e${whatsapp.greetingMessage}`, ticket, extra);
    await sendTextByChannel(channel, body, ticket, whatsapp);
  } catch (err) {
    logger.error(`[SendGreeting] Erro ao enviar saudação da conexão: ${err}`);
  }
};

/**
 * Envia a saudação da fila (queue.greetingMessage) pelo canal correto.
 */
export const sendQueueGreeting = async (
  ticket: Ticket,
  whatsapp: Whatsapp,
  queueId: number
): Promise<void> => {
  try {
    const queue = await Queue.findByPk(queueId);
    if (!queue?.greetingMessage || queue.greetingMessage.trim().length === 0) {
      return;
    }
    const channel = detectChannel(whatsapp);
    const body = formatBody(`\u200e${queue.greetingMessage}`, ticket, { queue: queue.name });
    await sendTextByChannel(channel, body, ticket, whatsapp);
  } catch (err) {
    logger.error(`[SendGreeting] Erro ao enviar saudação da fila: ${err}`);
  }
};

/**
 * Envia a saudação da conexão + menu de filas pelo canal correto.
 */
export const sendGreetingWithQueueMenu = async (
  ticket: Ticket,
  whatsapp: Whatsapp,
  queues: Queue[]
): Promise<void> => {
  try {
    const greetingMessage = whatsapp.greetingMessage || "";
    let options = "";
    queues.forEach((queue, index) => {
      options += `*[ ${index + 1} ]* - ${queue.name}\n`;
    });
    options = buildChatbotExitOnlyText(options);

    const body = formatBody(`\u200e${greetingMessage}\n\n${options}`, ticket);
    const channel = detectChannel(whatsapp);
    await sendTextByChannel(channel, body, ticket, whatsapp);
  } catch (err) {
    logger.error(`[SendGreeting] Erro ao enviar menu de filas: ${err}`);
  }
};

export { detectChannel, sendTextByChannel };
