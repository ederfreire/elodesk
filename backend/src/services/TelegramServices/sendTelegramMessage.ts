import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import { sendMessage } from "./telegramBotAPI";
import formatBody from "../../helpers/Mustache";
import ShowTicketService from "../TicketServices/ShowTicketService";

interface Request {
  body: string;
  ticket: Ticket;
  quotedMsg?: any;
}

interface RequestWithoutTicket {
  body: string;
  number: string;
  whatsapp: Whatsapp;
}

const sendTelegramMessage = async ({ body, ticket, quotedMsg }: Request): Promise<any> => {
  try {
    const ticketWithRelations = await ShowTicketService(ticket.id, ticket.companyId);
    const { number } = ticketWithRelations.contact;
    const botToken = ticketWithRelations.whatsapp.token;

    if (!botToken) {
      throw new AppError("ERR_TELEGRAM_BOT_TOKEN_NOT_FOUND");
    }

    const processedBody = formatBody(body, ticketWithRelations);

    const sentMessage = await sendMessage(botToken, number, processedBody);

    await ticket.update({ lastMessage: processedBody, fromMe: true });

    return sentMessage;
  } catch (err: any) {
    throw new AppError("ERR_SENDING_TELEGRAM_MSG");
  }
};

const sendTelegramMessageWithoutTicket = async ({ body, number, whatsapp }: RequestWithoutTicket): Promise<any> => {
  const botToken = whatsapp.token;

  if (!botToken) {
    throw new AppError("ERR_TELEGRAM_BOT_TOKEN_NOT_FOUND");
  }

  try {
    const sentMessage = await sendMessage(botToken, number, body);
    return sentMessage;
  } catch (err: any) {
    throw new AppError("ERR_SENDING_TELEGRAM_MSG");
  }
};

export { sendTelegramMessage, sendTelegramMessageWithoutTicket };
