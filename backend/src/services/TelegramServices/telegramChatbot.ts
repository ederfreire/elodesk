import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import Chatbot from "../../models/Chatbot";
import User from "../../models/User";
import ShowDialogChatBotsServices from "../DialogChatBotsServices/ShowDialogChatBotsServices";
import ShowQueueService from "../QueueService/ShowQueueService";
import ShowChatBotServices from "../ChatBotServices/ShowChatBotServices";
import DeleteDialogChatBotsServices from "../DialogChatBotsServices/DeleteDialogChatBotsServices";
import ShowChatBotByChatbotIdServices from "../ChatBotServices/ShowChatBotByChatbotIdServices";
import CreateDialogChatBotsServices from "../DialogChatBotsServices/CreateDialogChatBotsServices";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import formatBody from "../../helpers/Mustache";
import { CHATBOT_MAIN_MENU_LABEL } from "../../helpers/chatbotMenuLabels";
import {
  sendMessage,
  sendMessageWithInlineKeyboard,
  InlineKeyboardButton
} from "./telegramBotAPI";
import logger from "../../utils/logger";

const isNumeric = (value: string) => /^-?\d+$/.test(value);

const deleteAndCreateDialogStage = async (
  contact: Contact,
  chatbotId: number,
  ticket: Ticket
) => {
  try {
    await DeleteDialogChatBotsServices(contact.id);
    const bots = await ShowChatBotByChatbotIdServices(chatbotId);
    if (!bots) {
      await ticket.update({ isBot: false });
    }
    return await CreateDialogChatBotsServices({
      awaiting: 1,
      contactId: contact.id,
      chatbotId,
      queueId: bots.queueId
    });
  } catch (error) {
    await ticket.update({ isBot: false });
  }
};

/**
 * Converte opções do chatbot em linhas de botões inline do Telegram.
 * Cada opção vira um botão com callback_data = índice (1-based).
 */
const buildInlineKeyboard = (
  options: Chatbot[],
  includeBack: boolean = true
): InlineKeyboardButton[][] => {
  const buttons: InlineKeyboardButton[][] = options.map((option, index) => [
    {
      text: `${index + 1} - ${option.name}`,
      callback_data: `chatbot_${index + 1}`
    }
  ]);

  if (includeBack) {
    buttons.push([
      {
        text: `↩️ ${CHATBOT_MAIN_MENU_LABEL}`,
        callback_data: "chatbot_back"
      }
    ]);
  }

  return buttons;
};

/**
 * Converte filas da conexão em botões inline.
 */
const buildQueueKeyboard = (
  queues: Queue[]
): InlineKeyboardButton[][] => {
  return queues.map((queue, index) => [
    {
      text: `${index + 1} - ${queue.name}`,
      callback_data: `queue_${index + 1}`
    }
  ]);
};

/**
 * Envia diálogo do chatbot com botões inline no Telegram.
 */
const sendTelegramDialog = async (
  choosenQueue: Chatbot,
  contact: Contact,
  ticket: Ticket,
  botToken: string,
  chatId: string | number
) => {
  const showChatBots = await ShowChatBotServices(choosenQueue.id);

  if (showChatBots.options && showChatBots.options.length > 0) {
    const body = `\u200e${formatBody(choosenQueue.greetingMessage, ticket)}`;
    const keyboard = buildInlineKeyboard(showChatBots.options);
    return sendMessageWithInlineKeyboard(botToken, chatId, body, keyboard);
  }

  const body = `\u200e${formatBody(choosenQueue.greetingMessage, ticket)}`;
  return sendMessage(botToken, chatId, body);
};

/**
 * Volta ao menu principal enviando as filas como botões inline.
 */
const backToMainMenu = async (
  whatsappId: number,
  contact: Contact,
  ticket: Ticket,
  botToken: string,
  chatId: string | number
) => {
  await UpdateTicketService({
    ticketData: { queueId: null },
    ticketId: ticket.id,
    companyId: ticket.companyId
  });

  const { queues, greetingMessage } = await ShowWhatsAppService(
    whatsappId,
    ticket.companyId
  );

  const body = formatBody(`\u200e${greetingMessage}`, ticket);
  const keyboard = buildQueueKeyboard(queues);

  await sendMessageWithInlineKeyboard(botToken, chatId, body, keyboard);
  await DeleteDialogChatBotsServices(contact.id);
};

/**
 * Processa a seleção do chatbot no Telegram (via texto ou callback_data).
 */
export const handleTelegramChatbot = async (
  queueId: number,
  wbot: Whatsapp,
  ticket: Ticket,
  contact: Contact,
  selectedOption: string,
  ticketTraking: any
): Promise<any> => {
  if (ticket.status === "open") return;

  const botToken = wbot.token;
  const chatId = contact.number;

  const getStageBot = await ShowDialogChatBotsServices(contact.id);

  // Voltar ao menu principal
  if (selectedOption === "#" || selectedOption === "chatbot_back") {
    return backToMainMenu(wbot.id, contact, ticket, botToken, chatId);
  }

  // Extrair número da seleção (de texto "1" ou callback "chatbot_1" ou "queue_1")
  let optionNumber: string;
  if (selectedOption.startsWith("chatbot_")) {
    optionNumber = selectedOption.replace("chatbot_", "");
  } else if (selectedOption.startsWith("queue_")) {
    optionNumber = selectedOption.replace("queue_", "");
  } else {
    optionNumber = selectedOption;
  }

  if (!getStageBot) {
    // Primeira interação - escolhendo fila
    const queue = await ShowQueueService(queueId, ticket.companyId);
    const choosenQueue = queue.chatbots[+optionNumber - 1];

    if (!choosenQueue?.greetingMessage) {
      await DeleteDialogChatBotsServices(contact.id);
      return;
    }

    if (choosenQueue) {
      if (choosenQueue.isAgent) {
        const getUserByName = await User.findOne({
          where: { name: choosenQueue.name }
        });
        if (getUserByName) {
          await UpdateTicketService({
            ticketData: { userId: getUserByName.id, status: "open" },
            ticketId: ticket.id,
            companyId: ticket.companyId
          });
        }
      }
      await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
      return sendTelegramDialog(choosenQueue, contact, ticket, botToken, chatId);
    }
  }

  if (getStageBot) {
    // Navegando nos sub-menus
    const selected = isNumeric(optionNumber) ? optionNumber : "1";
    const bots = await ShowChatBotServices(getStageBot.chatbotId);
    const choosenQueue = bots.options[+selected - 1]
      ? bots.options[+selected - 1]
      : bots.options[0];

    if (!choosenQueue.greetingMessage) {
      await DeleteDialogChatBotsServices(contact.id);
      return;
    }

    if (choosenQueue) {
      if (choosenQueue.isAgent) {
        const getUserByName = await User.findOne({
          where: { name: choosenQueue.name }
        });
        if (getUserByName) {
          await UpdateTicketService({
            ticketData: { userId: getUserByName.id, status: "open" },
            ticketId: ticket.id,
            companyId: ticket.companyId
          });
        }
      }
      await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
      return sendTelegramDialog(choosenQueue, contact, ticket, botToken, chatId);
    }
  }
};
