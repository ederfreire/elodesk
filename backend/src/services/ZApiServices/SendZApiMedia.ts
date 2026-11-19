import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import CreateMessageService from "../MessageServices/CreateMessageService";
import {
  sendZApiImage,
  sendZApiVideo,
  sendZApiAudio,
  sendZApiDocument,
  buildPublicMediaUrl,
  isZApiSessionExpiredError
} from "./ZApiService";
import logger from "../../utils/logger";
import path from "path";

interface SendZApiMediaData {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
}

const SendZApiMedia = async ({
  media,
  ticket,
  body
}: SendZApiMediaData): Promise<void> => {
  const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);

  if (!whatsapp || !whatsapp.zapiInstanceId || !whatsapp.zapiToken || !whatsapp.zapiClientToken) {
    throw new Error("Conexão Z-API não configurada corretamente.");
  }

  const config = {
    zapiInstanceId: whatsapp.zapiInstanceId,
    zapiToken: whatsapp.zapiToken,
    zapiClientToken: whatsapp.zapiClientToken
  };

  const phone = ticket.contact?.number || ticket.contact?.remoteJid?.replace("@s.whatsapp.net", "");

  if (!phone) {
    throw new Error("Número do contato não encontrado.");
  }

  const mediaPath = `company${ticket.companyId}/${media.filename}`;
  const mediaUrl = buildPublicMediaUrl(mediaPath);
  const mimetype = media.mimetype || "";
  const fileName = media.originalname || media.filename;

  let response;
  let mediaType = "document";

  try {
    if (mimetype.startsWith("image/")) {
      mediaType = "imageMessage";
      response = await sendZApiImage(config, phone, mediaUrl, body || "");
    } else if (mimetype.startsWith("video/")) {
      mediaType = "videoMessage";
      response = await sendZApiVideo(config, phone, mediaUrl, body || "");
    } else if (mimetype.startsWith("audio/")) {
      mediaType = "audioMessage";
      response = await sendZApiAudio(config, phone, mediaUrl);
    } else {
      mediaType = "documentMessage";
      response = await sendZApiDocument(config, phone, mediaUrl, fileName);
    }
  } catch (error: any) {
    if (isZApiSessionExpiredError(error)) {
      await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
      logger.warn(`[Z-API] Sessão expirada ao enviar mídia na conexão ${whatsapp.id}.`);
      throw new Error("Sessão Z-API expirada. Gere um novo QR Code e reconecte a instância.");
    }

    logger.error(`[Z-API] Erro ao enviar mídia: ${error.message}`);
    throw error;
  }

  const messageId = response?.messageId || `zapi_media_${Date.now()}`;

  const messageData = {
    wid: messageId,
    ticketId: ticket.id,
    contactId: undefined,
    body: body || fileName,
    fromMe: true,
    mediaType,
    mediaUrl: `company${ticket.companyId}/${media.filename}`,
    read: true,
    quotedMsgId: null,
    ack: 2,
    remoteJid: `${phone}@s.whatsapp.net`,
    participant: null,
    dataJson: JSON.stringify(response),
    ticketTrakingId: null,
    isPrivate: false
  };

  await CreateMessageService({ messageData, companyId: ticket.companyId });
};

export default SendZApiMedia;
