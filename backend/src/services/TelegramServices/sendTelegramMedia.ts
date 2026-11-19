import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import { sendPhoto, sendDocument, sendVideo, sendAudio, sendVoice, sendSticker, sendAnimation } from "./telegramBotAPI";
import ShowTicketService from "../TicketServices/ShowTicketService";

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
}

const sendTelegramMedia = async ({ media, ticket, body }: Request): Promise<any> => {
  try {
    const ticketWithRelations = await ShowTicketService(ticket.id, ticket.companyId);
    const { number } = ticketWithRelations.contact;
    const botToken = ticketWithRelations.whatsapp.token;

    if (!botToken) {
      throw new AppError("ERR_TELEGRAM_BOT_TOKEN_NOT_FOUND");
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
    const mediaUrl = `${backendUrl}/public/${media.filename}`;
    const mimeType = media.mimetype;
    const caption = body || undefined;

    let sentMessage: any;

    if (mimeType.startsWith("image/gif") || media.originalname?.endsWith(".gif")) {
      sentMessage = await sendAnimation(botToken, number, mediaUrl, caption);
    } else if (mimeType.startsWith("image/webp") || media.originalname?.endsWith(".webp")) {
      sentMessage = await sendSticker(botToken, number, mediaUrl);
    } else if (mimeType.startsWith("image/")) {
      sentMessage = await sendPhoto(botToken, number, mediaUrl, caption);
    } else if (mimeType.startsWith("video/")) {
      sentMessage = await sendVideo(botToken, number, mediaUrl, caption);
    } else if (mimeType.startsWith("audio/") && mimeType.includes("ogg")) {
      sentMessage = await sendVoice(botToken, number, mediaUrl);
    } else if (mimeType.startsWith("audio/")) {
      sentMessage = await sendAudio(botToken, number, mediaUrl, caption);
    } else {
      sentMessage = await sendDocument(botToken, number, mediaUrl, caption);
    }

    await ticket.update({ lastMessage: caption || media.originalname, fromMe: true });

    return sentMessage;
  } catch (err: any) {
    throw new AppError("ERR_SENDING_TELEGRAM_MEDIA");
  }
};

export default sendTelegramMedia;
