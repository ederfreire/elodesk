import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { getIO } from "../../libs/socket";
import CreateMessageService from "../MessageServices/CreateMessageService";

export const DEFAULT_WEBCHAT_CONFIG = {
  title: "Atendimento",
  subtitle: "Olá! Como podemos ajudar?",
  primaryColor: "#4E93FF",
  logoUrl: "",
  welcomeMessage: "Olá! Em que podemos ajudar?",
  farewellMessage: "Atendimento encerrado. Obrigado pelo contato! Clique abaixo para iniciar uma nova conversa.",
  requireForm: false,
  formFields: ["name"],
  allowedOrigins: [] as string[]
};

export const getWhatsappByWebchatToken = async (
  token: string
): Promise<Whatsapp | null> => {
  if (!token) return null;
  return Whatsapp.findOne({ where: { webchatToken: token } });
};

export const getOrCreateWebchatContact = async (
  whatsapp: Whatsapp,
  sessionId: string,
  data: { name?: string; email?: string; phone?: string }
): Promise<Contact> => {
  const number = `webchat:${sessionId}`;
  let contact = await Contact.findOne({
    where: { number, companyId: whatsapp.companyId }
  });
  const name =
    (data.name && data.name.trim()) ||
    (data.email && data.email.trim()) ||
    (data.phone && data.phone.trim()) ||
    `Visitante ${sessionId.slice(0, 6)}`;

  if (!contact) {
    contact = await Contact.create({
      name,
      number,
      email: (data.email || "").trim(),
      channel: "webchat",
      isGroup: false,
      companyId: whatsapp.companyId
    } as any);
  } else if (data.name || data.email) {
    await contact.update({
      name: data.name?.trim() || contact.name,
      email: data.email?.trim() || contact.email
    });
  }
  return contact;
};

export const getOrCreateWebchatTicket = async (
  whatsapp: Whatsapp,
  contact: Contact
): Promise<Ticket> => {
  let ticket = await Ticket.findOne({
    where: {
      contactId: contact.id,
      companyId: whatsapp.companyId,
      status: ["open", "pending"]
    },
    order: [["updatedAt", "DESC"]]
  });
  if (!ticket) {
    ticket = await Ticket.create({
      contactId: contact.id,
      status: "pending",
      isGroup: false,
      channel: "webchat",
      whatsappId: whatsapp.id,
      companyId: whatsapp.companyId,
      queueId: (whatsapp as any).sendIdQueue || null,
      promptId: (whatsapp as any).promptId || null,
      uuid: uuidv4()
    } as any);
  }
  return ticket;
};

export const saveWebchatMessage = async ({
  ticket,
  contact,
  body,
  fromMe,
  mediaUrl,
  mediaType
}: {
  ticket: Ticket;
  contact: Contact;
  body: string;
  fromMe: boolean;
  mediaUrl?: string;
  mediaType?: string;
}): Promise<Message> => {
  const wid = `WCH${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const messageData: any = {
    wid,
    ticketId: ticket.id,
    contactId: fromMe ? undefined : contact.id,
    body: body || "",
    fromMe,
    read: fromMe ? true : false,
    mediaType: mediaType || "chat",
    mediaUrl: mediaUrl || undefined,
    ack: fromMe ? 1 : 0,
    channel: "webchat"
  };
  const message = await CreateMessageService({
    messageData,
    companyId: ticket.companyId
  });

  await ticket.update({
    lastMessage: body || (mediaType && `[${mediaType}]`) || "",
    unreadMessages: fromMe ? 0 : (ticket.unreadMessages || 0) + 1
  });

  try {
    const io = getIO();
    io.of(String(ticket.companyId)).emit(
      `webchat-${ticket.companyId}-${ticket.id}`,
      { action: "create", message }
    );
  } catch (e) {
    // socket pode não estar pronto
  }
  return message;
};

export const saveWebchatUploadFile = (
  companyId: number,
  fileBuffer: Buffer,
  originalName: string,
  mimetype: string
): { url: string; filePath: string; type: string } => {
  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  const folder = path.resolve(publicFolder, `company${companyId}`, "webchat");
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    fs.chmodSync(folder, 0o777);
  }
  const ext = path.extname(originalName) || "";
  const safeName = `wch_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}${ext}`;
  const filePath = path.resolve(folder, safeName);
  fs.writeFileSync(filePath, fileBuffer);
  // Caminho relativo armazenado no DB (getter de Message prefixa BACKEND_URL/public/companyX/)
  const relativePath = `webchat/${safeName}`;
  const backendUrl = process.env.BACKEND_URL || "";
  const proxyPort = process.env.PROXY_PORT ? `:${process.env.PROXY_PORT}` : "";
  const url = `${backendUrl}${proxyPort}/public/company${companyId}/${relativePath}`;
  let type = "chat";
  if (mimetype?.startsWith("image/")) type = "image";
  else if (mimetype?.startsWith("audio/")) type = "audio";
  else if (mimetype?.startsWith("video/")) type = "video";
  else type = "application";
  return { url, filePath, type, relativePath } as any;
};

export const generateWebchatToken = (): string => uuidv4();