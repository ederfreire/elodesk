import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import AppError from "../errors/AppError";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import {
  DEFAULT_WEBCHAT_CONFIG,
  getOrCreateWebchatContact,
  getOrCreateWebchatTicket,
  getWhatsappByWebchatToken,
  saveWebchatMessage,
  saveWebchatUploadFile
} from "../services/WebchatServices/WebchatHelpers";
import { respondToWebchatVisitor } from "../services/WebchatServices/WebchatAiResponder";

export const config = async (req: Request, res: Response): Promise<Response> => {
  const { token } = req.params;
  const whatsapp = await getWhatsappByWebchatToken(token);
  if (!whatsapp) throw new AppError("Webchat não encontrado", 404);
  const cfg = { ...DEFAULT_WEBCHAT_CONFIG, ...(whatsapp.webchatConfig || {}) };
  return res.json({ token, name: whatsapp.name, config: cfg });
};

export const session = async (req: Request, res: Response): Promise<Response> => {
  const { token } = req.params;
  const { sessionId: incoming, name, email, phone } = req.body || {};
  const whatsapp = await getWhatsappByWebchatToken(token);
  if (!whatsapp) throw new AppError("Webchat não encontrado", 404);
  const sessionId = incoming || uuidv4();
  const contact = await getOrCreateWebchatContact(whatsapp, sessionId, {
    name,
    email,
    phone
  });
  const ticket = await getOrCreateWebchatTicket(whatsapp, contact);
  return res.json({
    sessionId,
    ticketId: ticket.id,
    contactId: contact.id,
    companyId: whatsapp.companyId
  });
};

export const history = async (req: Request, res: Response): Promise<Response> => {
  const { token } = req.params;
  const { sessionId } = req.query as { sessionId?: string };
  if (!sessionId) throw new AppError("sessionId obrigatório", 400);
  const whatsapp = await getWhatsappByWebchatToken(token);
  if (!whatsapp) throw new AppError("Webchat não encontrado", 404);
  const contact = await getOrCreateWebchatContact(whatsapp, sessionId, {});

  // Buscamos o ticket mais recente (independente do status) para detectar fechamento
  const latestTicket = await Ticket.findOne({
    where: { contactId: contact.id, companyId: whatsapp.companyId },
    order: [["updatedAt", "DESC"]]
  });

  if (!latestTicket) {
    return res.json({ ticketId: null, messages: [], closed: false });
  }

  const messages = await Message.findAll({
    where: { ticketId: latestTicket.id, isPrivate: false },
    order: [["createdAt", "ASC"]],
    limit: 200
  });

  const isClosed = latestTicket.status === "closed";
  const userCfg: any = whatsapp.webchatConfig || {};
  // Only return a farewell message when explicitly configured by the user.
  // If empty, the frontend renders a translated default in the user's language.
  const farewellMessage = isClosed
    ? userCfg.farewellMessage || (whatsapp as any).farewellMessage || ""
    : null;

  return res.json({
    ticketId: latestTicket.id,
    messages,
    closed: isClosed,
    farewellMessage
  });
};

export const sendMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { token } = req.params;
  const { sessionId, body } = req.body || {};
  if (!sessionId) throw new AppError("sessionId obrigatório", 400);
  const whatsapp = await getWhatsappByWebchatToken(token);
  if (!whatsapp) throw new AppError("Webchat não encontrado", 404);
  const contact = await getOrCreateWebchatContact(whatsapp, sessionId, {});
  const ticket = await getOrCreateWebchatTicket(whatsapp, contact);
  const message = await saveWebchatMessage({
    ticket,
    contact,
    body: body || "",
    fromMe: false
  });
  // Dispara resposta automática do AI Agent (fire-and-forget; o debounce interno trata rajadas)
  respondToWebchatVisitor(ticket, contact).catch(() => {});
  return res.json({ ok: true, messageId: message.id, ticketId: ticket.id });
};

export const sendMedia = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { token } = req.params;
  const { sessionId, body } = req.body || {};
  const file = (req as any).file;
  if (!sessionId) throw new AppError("sessionId obrigatório", 400);
  if (!file) throw new AppError("Arquivo obrigatório", 400);
  if (file.size > 20 * 1024 * 1024) throw new AppError("Arquivo > 20MB", 400);
  const whatsapp = await getWhatsappByWebchatToken(token);
  if (!whatsapp) throw new AppError("Webchat não encontrado", 404);
  const contact = await getOrCreateWebchatContact(whatsapp, sessionId, {});
  const ticket = await getOrCreateWebchatTicket(whatsapp, contact);
  const saved: any = saveWebchatUploadFile(
    whatsapp.companyId,
    file.buffer,
    file.originalname,
    file.mimetype
  );
  const message = await saveWebchatMessage({
    ticket,
    contact,
    body: body || "",
    fromMe: false,
    // Persistimos o caminho relativo; o getter do model retorna a URL absoluta
    mediaUrl: saved.relativePath || saved.url,
    mediaType: saved.type
  });
  respondToWebchatVisitor(ticket, contact).catch(() => {});
  return res.json({ ok: true, messageId: message.id, mediaUrl: saved.url });
};

export const ack = async (req: Request, res: Response): Promise<Response> => {
  const { token } = req.params;
  const { sessionId } = req.body || {};
  const whatsapp = await getWhatsappByWebchatToken(token);
  if (!whatsapp) throw new AppError("Webchat não encontrado", 404);
  const contact = await getOrCreateWebchatContact(whatsapp, sessionId, {});
  const ticket = await Ticket.findOne({
    where: { contactId: contact.id, companyId: whatsapp.companyId }
  });
  if (ticket) {
    await Message.update(
      { ack: 3, read: true },
      { where: { ticketId: ticket.id, fromMe: true } }
    );
    await ticket.update({ unreadMessages: 0 });
  }
  return res.json({ ok: true });
};