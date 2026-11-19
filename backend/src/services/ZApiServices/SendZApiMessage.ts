import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { sendZApiText, sendZApiContact, isZApiSessionExpiredError } from "./ZApiService";
import logger from "../../utils/logger";
import Contact from "../../models/Contact";

interface SendZApiMessageData {
  body: string;
  ticket: Ticket;
  quotedMsg?: any;
  vCard?: Contact;
}

const SendZApiMessage = async ({
  body,
  ticket,
  quotedMsg,
  vCard
}: SendZApiMessageData): Promise<void> => {
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

  let response;

  try {
    if (vCard) {
      response = await sendZApiContact(config, phone, vCard.name, vCard.number);
    } else {
      response = await sendZApiText(config, phone, body);
    }
  } catch (error: any) {
    if (isZApiSessionExpiredError(error)) {
      await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
      logger.warn(`[Z-API] Sessão expirada ao enviar mensagem na conexão ${whatsapp.id}.`);
      throw new Error("Sessão Z-API expirada. Gere um novo QR Code e reconecte a instância.");
    }

    logger.error(`[Z-API] Erro ao enviar mensagem: ${error.message}`);
    throw error;
  }

  const messageId = response?.messageId || `zapi_${Date.now()}`;

  const messageData = {
    wid: messageId,
    ticketId: ticket.id,
    contactId: undefined,
    body,
    fromMe: true,
    mediaType: vCard ? "contactMessage" : "extendedTextMessage",
    read: true,
    quotedMsgId: quotedMsg?.id || null,
    ack: 2,
    remoteJid: `${phone}@s.whatsapp.net`,
    participant: null,
    dataJson: JSON.stringify(response),
    ticketTrakingId: null,
    isPrivate: false
  };

  await CreateMessageService({ messageData, companyId: ticket.companyId });
};

export default SendZApiMessage;
