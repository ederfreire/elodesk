import logger from "../../utils/logger";
import { Op } from "sequelize";
import { writeFileSync } from "fs";
import fs from "fs";
import axios from "axios";
import { join } from "path";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import Chatbot from "../../models/Chatbot";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import { getFile, answerCallbackQuery, editMessageReplyMarkup, sendMessageWithInlineKeyboard, getUserProfilePhoto } from "./telegramBotAPI";
import { sendMessage } from "./telegramBotAPI";
import formatBody from "../../helpers/Mustache";
import CompaniesSettings from "../../models/CompaniesSettings";
import { Mutex } from "async-mutex";
import { handleMessageIntegration, handleRating, verifyRating } from "../WbotServices/wbotMessageListener";
import TicketTag from "../../models/TicketTag";
import Tag from "../../models/Tag";
import ListSettingsService from "../SettingServices/ListSettingsService";
import { handleTelegramChatbot } from "./telegramChatbot";
import ShowTicketService from "../TicketServices/ShowTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";

const verifyContact = async (
  telegramContact: any,
  whatsapp: Whatsapp,
  companyId: number
): Promise<Contact> => {
  let profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
  try {
    if (whatsapp.token) {
      const photoUrl = await getUserProfilePhoto(whatsapp.token, telegramContact.id);
      if (photoUrl && !photoUrl.includes("nopicture")) {
        profilePicUrl = photoUrl;
      }
    }
  } catch (err) {
    logger.warn(`[TELEGRAM] Não foi possível obter foto de perfil para ${telegramContact.id}`);
  }

  const contactData = {
    name: telegramContact.first_name + (telegramContact.last_name ? ` ${telegramContact.last_name}` : ""),
    number: String(telegramContact.id),
    profilePicUrl,
    isGroup: false,
    companyId,
    channel: "telegram",
    whatsappId: whatsapp.id
  };

  const contact = await CreateOrUpdateContactService(contactData);

  if (profilePicUrl && !profilePicUrl.includes("nopicture") && contact.profilePicUrl !== profilePicUrl) {
    await contact.update({ profilePicUrl });
    await contact.reload();
  }

  return contact;
};

export const verifyTelegramMessage = async (
  msg: any,
  body: string,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
): Promise<void> => {
  const wid = `tg-${msg.message_id}`;

  // Evitar duplicação
  const existingMessage = await Message.findOne({
    where: { wid, companyId: ticket.companyId }
  });
  if (existingMessage) return;

  const messageData = {
    wid,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : contact.id,
    body,
    fromMe,
    read: fromMe,
    quotedMsgId: null,
    ack: 3,
    dataJson: JSON.stringify(msg),
    channel: "telegram"
  };

  await CreateMessageService({ messageData, companyId: ticket.companyId });

  // Verificar Floups
  if (!fromMe && contact?.id) {
    try {
      const FloupService = (await import('../../plugins/floup/service')).default;
      await FloupService.verificarECancelarFloupsAoReceberMensagem(
        ticket.id,
        contact.id,
        ticket.companyId,
        body || ''
      );
    } catch (floupError) {
      logger.warn(`[FLOUP] Erro ao verificar condições de parada (Telegram):`, floupError);
    }
  }
};

export const verifyTelegramMedia = async (
  msg: any,
  ticket: Ticket,
  contact: Contact,
  whatsapp: Whatsapp,
  fromMe: boolean = false
): Promise<void> => {
  try {
    let fileId: string | null = null;
    let mediaType = "document";
    let caption = msg.caption || "";

    if (msg.photo && msg.photo.length > 0) {
      fileId = msg.photo[msg.photo.length - 1].file_id;
      mediaType = "image";
    } else if (msg.animation) {
      // GIFs são enviados como "animation" pelo Telegram
      fileId = msg.animation.file_id;
      mediaType = "video";
    } else if (msg.video) {
      fileId = msg.video.file_id;
      mediaType = "video";
    } else if (msg.audio) {
      fileId = msg.audio.file_id;
      mediaType = "audio";
    } else if (msg.voice) {
      fileId = msg.voice.file_id;
      mediaType = "audio";
    } else if (msg.video_note) {
      fileId = msg.video_note.file_id;
      mediaType = "video";
    } else if (msg.document) {
      fileId = msg.document.file_id;
      mediaType = "document";
    } else if (msg.sticker) {
      fileId = msg.sticker.file_id;
      // Stickers animados (.tgs) e video stickers (.webm)
      if (msg.sticker.is_video) {
        mediaType = "video";
      } else if (msg.sticker.is_animated) {
        // Stickers animados .tgs - salvamos como documento pois não são renderizáveis diretamente
        mediaType = "image";
      } else {
        mediaType = "image";
      }
      caption = msg.sticker.emoji || "🎭 Sticker";
    }

    if (!fileId) return;

    const botToken = whatsapp.token;
    const fileUrl = await getFile(botToken, fileId);

    const { data } = await axios.get(fileUrl, { responseType: "arraybuffer" });

    // eslint-disable-next-line no-eval
    const { fileTypeFromBuffer } = await (eval('import("file-type")') as Promise<typeof import("file-type")>);
    const type = await fileTypeFromBuffer(data);

    const ext = type?.ext || "bin";
    const fileName = `${new Date().getTime()}.${ext}`;

    const folder = `public/company${ticket.companyId}`;
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
      fs.chmodSync(folder, 0o777);
    }

    writeFileSync(join(__dirname, "..", "..", "..", folder, fileName), data, "base64");

    const wid = `tg-${msg.message_id}`;

    const messageData = {
      wid,
      ticketId: ticket.id,
      contactId: fromMe ? undefined : contact.id,
      body: caption || fileName,
      fromMe,
      mediaType,
      mediaUrl: fileName,
      read: fromMe,
      quotedMsgId: null,
      ack: 3,
      dataJson: JSON.stringify(msg),
      channel: "telegram"
    };

    await CreateMessageService({ messageData, companyId: ticket.companyId });
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao processar mídia: ${error.message}`);
  }
};

const hasMedia = (msg: any): boolean => {
  return !!(msg.photo || msg.video || msg.audio || msg.voice || msg.document || msg.sticker || msg.animation || msg.video_note);
};

const hasLocation = (msg: any): boolean => {
  return !!(msg.location || msg.venue);
};

const hasContact = (msg: any): boolean => {
  return !!msg.contact;
};

/**
 * Processa uma mensagem de localização recebida
 */
const verifyTelegramLocation = async (
  msg: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
): Promise<void> => {
  try {
    const location = msg.venue || msg.location;
    const latitude = location.latitude;
    const longitude = location.longitude;

    // Gerar imagem estática do mapa via OpenStreetMap
    const mapImage = `https://staticmap.liedman.net/img.php?z=15&center=${latitude},${longitude}&size=300x200&markers=${latitude},${longitude}`;
    const mapLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

    let description = `📍 ${latitude}, ${longitude}`;
    if (msg.venue) {
      description = `📍 ${msg.venue.title || "Local"}\\n${msg.venue.address || ""}`;
    }

    // Formato compatível com LocationPreview: image|link|description
    const bodyText = `${mapImage}|${mapLink}|${description}`;

    const wid = `tg-${msg.message_id}`;

    const existingMessage = await Message.findOne({
      where: { wid, companyId: ticket.companyId }
    });
    if (existingMessage) return;

    const messageData = {
      wid,
      ticketId: ticket.id,
      contactId: fromMe ? undefined : contact.id,
      body: bodyText,
      fromMe,
      mediaType: "locationMessage",
      read: fromMe,
      quotedMsgId: null,
      ack: 3,
      dataJson: JSON.stringify(msg),
      channel: "telegram"
    };

    await CreateMessageService({ messageData, companyId: ticket.companyId });
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao processar localização: ${error.message}`);
  }
};

/**
 * Processa uma mensagem de contato recebida
 */
const verifyTelegramContact = async (
  msg: any,
  ticket: Ticket,
  contact: Contact,
  fromMe: boolean = false
): Promise<void> => {
  try {
    const tgContact = msg.contact;
    const name = `${tgContact.first_name || ""}${tgContact.last_name ? ` ${tgContact.last_name}` : ""}`.trim();
    const phone = tgContact.phone_number || "";

    const bodyText = `👤 Contato: ${name}\n📞 ${phone}`;

    const wid = `tg-${msg.message_id}`;

    const existingMessage = await Message.findOne({
      where: { wid, companyId: ticket.companyId }
    });
    if (existingMessage) return;

    const messageData = {
      wid,
      ticketId: ticket.id,
      contactId: fromMe ? undefined : contact.id,
      body: bodyText,
      fromMe,
      read: fromMe,
      quotedMsgId: null,
      ack: 3,
      dataJson: JSON.stringify(msg),
      channel: "telegram"
    };

    await CreateMessageService({ messageData, companyId: ticket.companyId });
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao processar contato: ${error.message}`);
  }
};

/**
 * Busca a sessão completa com filas e chatbots
 */
const getSessionWithQueues = async (whatsapp: Whatsapp) => {
  return Whatsapp.findOne({
    where: { id: whatsapp.id },
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"],
        include: [
          {
            model: Chatbot,
            as: "chatbots",
            attributes: ["id", "name", "greetingMessage", "isAgent"]
          }
        ]
      }
    ],
    order: [
      ["queues", "id", "ASC"],
      ["queues", "chatbots", "id", "ASC"]
    ]
  });
};

export const handleTelegramMessage = async (
  whatsapp: Whatsapp,
  update: any,
  companyId: number
): Promise<void> => {
  try {
    const msg = update.message || update.edited_message;
    if (!msg) return;

    const telegramContact = msg.from;
    if (!telegramContact) return;

    if (telegramContact.is_bot) return;

    const fromMe = false;
    const bodyMessage = msg.text || msg.caption || "";

    const contact = await verifyContact(telegramContact, whatsapp, companyId);

    const unreadCount = 1;

    const getSession = await getSessionWithQueues(whatsapp);

    if (!getSession) {
      logger.error(`[TELEGRAM] Sessão não encontrada para conexão ${whatsapp.id}`);
      return;
    }

    const settings = await CompaniesSettings.findOne({
      where: { companyId }
    });

    const mutex = new Mutex();
    const ticket = await mutex.runExclusive(async () => {
      const createTicket = await FindOrCreateTicketService(
        contact,
        getSession,
        unreadCount,
        companyId,
        0,
        null,
        null,
        "telegram",
        null,
        false,
        settings
      );
      return createTicket;
    });

    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId: getSession?.id,
      userId: ticket.userId
    });

    // Ignorar mensagens do próprio bot
    if (
      (getSession.farewellMessage &&
        formatBody(getSession.farewellMessage, ticket) === bodyMessage) ||
      (getSession.ratingMessage &&
        formatBody(getSession.ratingMessage, ticket) === bodyMessage)
    ) {
      return;
    }

    await ticket.update({ lastMessage: bodyMessage || "📎 Mídia" });

    // Processar mídia, localização, contato ou texto
    if (hasLocation(msg)) {
      await verifyTelegramLocation(msg, ticket, contact, fromMe);
    } else if (hasContact(msg)) {
      await verifyTelegramContact(msg, ticket, contact, fromMe);
    } else if (hasMedia(msg)) {
      await verifyTelegramMedia(msg, ticket, contact, whatsapp, fromMe);
    } else {
      await verifyTelegramMessage(msg, bodyMessage, ticket, contact, fromMe);
    }

    // Avaliação NPS
    if (ticket.status === "nps" && ticketTraking !== null && verifyRating(ticketTraking)) {
      if (!isNaN(parseFloat(bodyMessage))) {
        handleRating(parseFloat(bodyMessage), ticket, ticketTraking);
        return;
      }
    }

    // Chatbot / Filas - usando handler com botões inline
    if (
      !fromMe &&
      !ticket.userId &&
      ticket.status !== "open" &&
      !ticket.isGroup
    ) {
      const queues = getSession.queues || [];

      // Auto-assign quando há apenas 1 fila sem chatbot (mesmo comportamento do WhatsApp)
      let chatbot = false;
      if (queues.length === 1) {
        chatbot = queues[0]?.chatbots?.length > 1;
      }

      if (queues.length === 1 && !chatbot) {
        // Fila única sem chatbot: atribuir automaticamente
        const sendGreetingMessageOneQueues = settings?.sendGreetingMessageOneQueues === "enabled" || false;

        if (getSession.greetingMessage && getSession.greetingMessage.length > 1 && sendGreetingMessageOneQueues) {
          const body = formatBody(`${getSession.greetingMessage}`, ticket);
          const { sendMessage: sendTgMessage } = require("./telegramBotAPI");
          await sendTgMessage(getSession.token, contact.number, body);
        }

        await UpdateTicketService({
          ticketData: {
            queueId: queues[0].id,
            status: ticket.status === "lgpd" ? "pending" : ticket.status
          },
          ticketId: ticket.id,
          companyId
        });
      } else if (queues.length > 0) {
        await handleTelegramChatbot(
          getSession.queues.length,
          getSession,
          ticket,
          contact,
          bodyMessage,
          ticketTraking
        );
      }
    }
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao processar mensagem: ${error.message}`);
    logger.error(error.stack);
  }
};

/**
 * Processa callback_query (clique em botão inline do Telegram)
 */
export const handleTelegramCallbackQuery = async (
  whatsapp: Whatsapp,
  callbackQuery: any,
  companyId: number
): Promise<void> => {
  try {
    const { id: callbackQueryId, from, message, data: callbackData } = callbackQuery;

    if (!from || !callbackData) return;

    // Responder ao callback para remover o "loading" do botão
    await answerCallbackQuery(whatsapp.token, callbackQueryId);

    // Remover botões inline da mensagem clicada (evitar re-clique)
    if (message?.message_id && message?.chat?.id) {
      try {
        await editMessageReplyMarkup(whatsapp.token, message.chat.id, message.message_id);
      } catch (err) {
        // Pode falhar se a mensagem for muito antiga, ignorar
      }
    }

    const telegramContact = from;
    if (telegramContact.is_bot) return;

    const contact = await verifyContact(telegramContact, whatsapp, companyId);

    const getSession = await getSessionWithQueues(whatsapp);

    if (!getSession) {
      logger.error(`[TELEGRAM] Sessão não encontrada para conexão ${whatsapp.id}`);
      return;
    }

    const settings = await CompaniesSettings.findOne({
      where: { companyId }
    });

    const mutex = new Mutex();
    const ticket = await mutex.runExclusive(async () => {
      const createTicket = await FindOrCreateTicketService(
        contact,
        getSession,
        0,
        companyId,
        0,
        null,
        null,
        "telegram",
        null,
        false,
        settings
      );
      return createTicket;
    });

    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId: getSession?.id,
      userId: ticket.userId
    });

    // Extrair texto legível do callback para registrar como mensagem
    let displayText = callbackData;
    if (callbackData.startsWith("chatbot_") && callbackData !== "chatbot_back") {
      const num = callbackData.replace("chatbot_", "");
      displayText = `Opção ${num}`;
    } else if (callbackData.startsWith("queue_")) {
      const num = callbackData.replace("queue_", "");
      displayText = `Fila ${num}`;
    } else if (callbackData === "chatbot_back") {
      displayText = "↩️ Voltar para o menu principal";
    }

    // Registrar o clique como mensagem no ticket
    const fakeMsg = {
      message_id: `cb-${callbackQueryId}`,
      from: telegramContact,
      chat: message?.chat,
      date: Math.floor(Date.now() / 1000),
      text: displayText
    };

    await ticket.update({ lastMessage: displayText });
    await verifyTelegramMessage(fakeMsg, displayText, ticket, contact, false);

    // Processar no chatbot
    if (
      !ticket.userId &&
      ticket.status !== "open" &&
      !ticket.isGroup
    ) {
      if (getSession.queues?.length > 0) {
        await handleTelegramChatbot(
          getSession.queues.length,
          getSession,
          ticket,
          contact,
          callbackData,
          ticketTraking
        );
      }
    }
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao processar callback_query: ${error.message}`);
    logger.error(error.stack);
  }
};

/**
 * Processa message_reaction (reação a uma mensagem)
 */
export const handleTelegramReaction = async (
  whatsapp: Whatsapp,
  reaction: any,
  companyId: number
): Promise<void> => {
  try {
    const { user, chat, message_id, new_reaction } = reaction;

    if (!user || user.is_bot) return;

    const contact = await verifyContact(user, whatsapp, companyId);

    const settings = await CompaniesSettings.findOne({
      where: { companyId }
    });

    const getSession = await getSessionWithQueues(whatsapp);
    if (!getSession) return;

    const mutex = new Mutex();
    const ticket = await mutex.runExclusive(async () => {
      return FindOrCreateTicketService(
        contact,
        getSession,
        0,
        companyId,
        0,
        null,
        null,
        "telegram",
        null,
        false,
        settings
      );
    });

    // Buscar a mensagem original que recebeu a reação
    const originalWid = `tg-${message_id}`;
    const originalMessage = await Message.findOne({
      where: { wid: originalWid, companyId }
    });

    const emoji = new_reaction && new_reaction.length > 0
      ? new_reaction.map((r: any) => r.emoji).join("")
      : "❌"; // Reação removida

    if (!emoji || emoji === "❌") {
      logger.info(`[TELEGRAM] Reação removida na mensagem ${message_id}`);
      return;
    }

    const wid = `tg-react-${message_id}-${Date.now()}`;

    const messageData = {
      wid,
      ticketId: ticket.id,
      contactId: contact.id,
      body: emoji,
      fromMe: false,
      mediaType: "reactionMessage",
      read: false,
      quotedMsgId: originalMessage?.id || null,
      ack: 3,
      dataJson: JSON.stringify(reaction),
      channel: "telegram"
    };

    await CreateMessageService({ messageData, companyId });

    await ticket.update({ lastMessage: `${contact.name} reagiu ${emoji}` });

    logger.info(`[TELEGRAM] Reação ${emoji} processada na mensagem ${message_id}`);
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao processar reação: ${error.message}`);
    logger.error(error.stack);
  }
};
