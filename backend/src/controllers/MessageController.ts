import { Request, Response } from "express";
import AppError from "../errors/AppError";
import fs from "fs";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import Message from "../models/Message";
import Queue from "../models/Queue";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import { verify } from "jsonwebtoken";
import authConfig from "../config/auth";
import path from "path";
import mime from "mime-types";
import { isNil, isNull } from "lodash";
import { Mutex } from "async-mutex";
import logger from "../utils/logger";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import ReactWhatsAppMessage from "../services/WbotServices/ReactWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import CreateMessageService from "../services/MessageServices/CreateMessageService";

import { sendFacebookMessageMedia } from "../services/FacebookServices/sendFacebookMessageMedia";
import { sendFacebookMessage } from "../services/FacebookServices/sendFacebookMessage";
import SendZApiMessage from "../services/ZApiServices/SendZApiMessage";
import SendZApiMedia from "../services/ZApiServices/SendZApiMedia";
import { sendTelegramMessage } from "../services/TelegramServices/sendTelegramMessage";
import sendTelegramMedia from "../services/TelegramServices/sendTelegramMedia";
import { verifyTelegramMessage } from "../services/TelegramServices/TelegramMessageListener";

import ShowPlanCompanyService from "../services/CompanyService/ShowPlanCompanyService";
import ListMessagesServiceAll from "../services/MessageServices/ListMessagesServiceAll";
import ShowContactService from "../services/ContactServices/ShowContactService";

import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";

import Contact from "../models/Contact";

import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import ListSettingsService from "../services/SettingServices/ListSettingsService";
import ShowMessageService, { GetWhatsAppFromMessage } from "../services/MessageServices/ShowMessageService";
import CompaniesSettings from "../models/CompaniesSettings";
import { verifyMessageFace, verifyMessageMedia } from "../services/FacebookServices/facebookMessageListener";
import EditWhatsAppMessage from "../services/MessageServices/EditWhatsAppMessage";
import SendWhatsAppOficialMessage from "../services/WhatsAppOficial/SendWhatsAppOficialMessage";
import ShowService from "../services/QuickMessageService/ShowService";
import formatBody from "../helpers/Mustache";
import { IMetaMessageTemplateComponents, IMetaMessageTemplate } from "../libs/whatsAppOficial/IWhatsAppOficial.interfaces";
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import TranscribeAudioMessageToText from "../services/MessageServices/TranscribeAudioMessageService";
import { suggestReply, summarizeConversation } from "../services/MessageServices/AiAssistantService";
import buildTemplateBodyToSave from "../helpers/BuildTemplateBodyToSave";
import { convertToCloudApiOpus } from "../utils/AudioUtils";
import {
  SendWacallsText,
  SendWacallsMediaMessage,
  EditWacallsMessage,
  DeleteWacallsMessage,
  SendWacallsReaction
} from "../services/WacallsServices/SendWacallsMessageService";


type IndexQuery = {
  pageNumber: string;
  ticketTrakingId: string;
  selectedQueues?: string;
};

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  companyId: number;
  iat: number;
  exp: number;
}

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
  number?: string;
  isPrivate?: string;
  vCard?: Contact;
};

type MessageTemplateData = {
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
  number?: string;
  templateId: string;
  variables: string[];
  bodyToSave: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { pageNumber, selectedQueues: queueIdsStringified } = req.query as IndexQuery;
  const { companyId, profile } = req.user;
  let queues: number[] = [];

  const user = await User.findByPk(req.user.id, {
    include: [{ model: Queue, as: "queues" }]
  });

  const sanitizeQueueIds = (values: unknown): number[] => {
    if (!Array.isArray(values)) return [];
    return values
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value > 0);
  };

  if (queueIdsStringified) {
    try {
      queues = sanitizeQueueIds(JSON.parse(queueIdsStringified));
    } catch (error) {
      logger.warn(`[messages.index] selectedQueues inválido: ${queueIdsStringified}`);
      queues = [];
    }
  } else {
    queues = sanitizeQueueIds((user?.queues || []).map(queue => queue.id));
  }

  const { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId,
    companyId,
    queues,
    user
  });

  if (["whatsapp", "whatsapp_oficial"].includes(ticket.channel) && ticket.whatsappId) {
    SetTicketMessagesAsRead(ticket);
  }

  return res.json({ count, messages, ticket, hasMore });
};

export function obterNomeEExtensaoDoArquivo(url: string): string {
  try {
    let filename: string;
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      filename = pathname.split('/').pop() || '';
    } else {
      filename = url.split('/').pop()?.split('\\').pop() || '';
    }
    
    const parts = filename.split('.');
    
    if (parts.length < 2) {
      return filename;
    }

    const nomeDoArquivo = parts[0];
    const extensao = parts[1];

    return `${nomeDoArquivo}.${extensao}`;
  } catch (error) {
    logger.error(`[obterNomeEExtensaoDoArquivo] Erro ao processar: ${url} - ${error}`);
    const filename = url.split('/').pop()?.split('\\').pop();
    return filename || 'arquivo';
  }
}

const isAudioFile = (media: Express.Multer.File): boolean => {
  logger.debug(`[isAudioFile] Verificando: ${media.originalname} (mime: ${media.mimetype}, field: ${media.fieldname})`);

  if (media.fieldname === 'audio') {
    return true;
  }

  if (media.mimetype && media.mimetype.startsWith('audio/')) {
    return true;
  }

  if (media.originalname) {
    const audioExtensions = ['.mp3', '.ogg', '.wav', '.webm', '.m4a', '.aac', '.opus'];
    const extension = path.extname(media.originalname).toLowerCase();
    
    if (audioExtensions.includes(extension)) {
      return true;
    }
  }

  if (media.originalname && 
      (media.originalname.includes('audio_') || 
       media.originalname.includes('áudio') ||
       media.originalname.includes('voice'))) {
    return true;
  }

  return false;
};

const stripAgentSignature = (value: any): any => {
  if (Array.isArray(value)) return value.map(stripAgentSignature);
  if (typeof value !== "string") return value;
  return value.replace(/^\*[^\n*]{1,80}:\*\n/, "");
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg, vCard, isPrivate = "false" }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];
  const { companyId } = req.user;
  const currentUserId = (req.user && (req.user as any).id) ? Number((req.user as any).id) : null;

  const ticket = await ShowTicketService(ticketId, companyId);

  if (!ticket.whatsappId) {
    throw new AppError("ERR_TICKET_NO_LINKED_CONNECTION", 400);
  }

  if (ticket.channel === "whatsapp_oficial" && isPrivate === "false") {
    await ticket.reload({
      include: [{ model: Contact, as: "contact" }]
    });
    
    const lastInteraction = ticket.contact.lastInteractionClient;
    
    logger.info(`[STORE] Validando janela 24h - Ticket ${ticketId} - lastInteraction: ${lastInteraction}, contactId: ${ticket.contact.id}`);
    
    if (!lastInteraction) {
      throw new AppError("Janela de 24h expirada. Envie um template primeiro para iniciar a conversa.", 400);
    }
    
    const now = new Date();
    const diffMs = now.getTime() - new Date(lastInteraction).getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    logger.info(`[STORE] Janela 24h - Diferença: ${diffHours.toFixed(2)} horas`);
    
    if (diffHours >= 24) {
      throw new AppError("Janela de 24h expirada. Envie um template primeiro para retomar a conversa.", 400);
    }
  }

  SetTicketMessagesAsRead(ticket);

  // Check if this is a Z-API connection
  const whatsappConn = await Whatsapp.findByPk(ticket.whatsappId);
  const isZApi = whatsappConn && whatsappConn.zapiInstanceId && whatsappConn.zapiToken && whatsappConn.zapiClientToken;
  const signedBody = isPrivate === "false" && whatsappConn?.allowSignature === false
    ? stripAgentSignature(body)
    : body;

  // Substitui as variáveis ({{name}}, {{protocol}}, {{queue}}...) também nas
  // mensagens enviadas pelo atendente — é por aqui que passa a "resposta
  // rápida". Antes o Mustache só rodava em mensagem automática (saudação,
  // chatbot, campanha), então a resposta rápida saía com o {{name}} cru pro
  // cliente. Envolvido em try/catch: um texto com chave solta ("{{") faz o
  // Mustache lançar, e uma mensagem do atendente NUNCA deve deixar de ser
  // enviada por causa disso — nesse caso segue o texto original.
  const applyVars = (value: any): any => {
    if (typeof value !== "string" || !value.includes("{{")) return value;
    try {
      return formatBody(value, ticket);
    } catch (err: any) {
      logger.warn(`[STORE] Falha ao aplicar variáveis na mensagem: ${err?.message}`);
      return value;
    }
  };

  const outboundBody = Array.isArray(signedBody)
    ? signedBody.map(applyVars)
    : applyVars(signedBody);

  if (isZApi && isPrivate === "false") {
    try {
      if (medias) {
        await Promise.all(
          medias.map(async (media: Express.Multer.File, index) => {
            await SendZApiMedia({
              media,
              ticket,
              body: Array.isArray(outboundBody) ? outboundBody[index] : outboundBody
            });
          })
        );
      } else {
        await SendZApiMessage({ body: outboundBody, ticket, quotedMsg, vCard });
      }
      return res.send();
    } catch (error) {
      logger.error(`[STORE-ZAPI] Erro: ${error.message}`);
      return res.status(400).json({ error: error.message });
    }
  }

  try {
    if (medias) {
      await Promise.all(
        medias.map(async (media: Express.Multer.File, index) => {
          logger.debug(`[STORE] Processando mídia ${index + 1}: ${media.originalname} (mime: ${media.mimetype}, size: ${media.size})`);

          if (ticket.channel === "wacalls" && isPrivate === "false") {
            await SendWacallsMediaMessage({
              ticket,
              media,
              body: Array.isArray(outboundBody) ? outboundBody[index] : outboundBody,
              quotedMsg
            });
            return;
          }

          if (ticket.channel === "whatsapp") {

            await SendWhatsAppMedia({ 
              media, 
              ticket, 
              body: Array.isArray(outboundBody) ? outboundBody[index] : outboundBody, 
              isPrivate: isPrivate === "true", 
              isForwarded: false 
            });
          }

          if (ticket.channel == 'whatsapp_oficial') {
            let mediaToSend = media;
            if (isAudioFile(media)) {
              // Meta WhatsApp Cloud API só aceita audio/ogg(opus), audio/mpeg, audio/mp4, audio/aac, audio/amr.
              // Áudios gravados pelo navegador (webm/opus) precisam ser convertidos para ogg/opus.
              const lower = String(media.mimetype || "").toLowerCase();
              const ext = path.extname(media.originalname || "").toLowerCase();
              const alreadyOk =
                lower === "audio/ogg" || lower === "audio/mpeg" || lower === "audio/mp3" ||
                lower === "audio/mp4" || lower === "audio/aac" || lower === "audio/amr" ||
                [".ogg", ".opus", ".mp3", ".m4a", ".aac", ".amr"].includes(ext);
              if (!alreadyOk) {
                try {
                  const outDir = path.dirname(media.path);
                  const convertedPath = await convertToCloudApiOpus(media.path, outDir);
                  mediaToSend = {
                    ...media,
                    path: convertedPath,
                    filename: path.basename(convertedPath),
                    originalname: path.basename(convertedPath),
                    mimetype: "audio/ogg; codecs=opus"
                  } as Express.Multer.File;
                  logger.info(`[STORE-OFICIAL] Áudio convertido para ogg/opus: ${convertedPath}`);
                } catch (convErr: any) {
                  logger.error(`[STORE-OFICIAL] Falha ao converter áudio: ${convErr?.message || convErr}`);
                }
              }
            }
            await SendWhatsAppOficialMessage({
              media: mediaToSend,
              body: Array.isArray(outboundBody) ? outboundBody[index] : outboundBody,
              ticket,
              type: isAudioFile(media) ? 'audio' : null,
              quotedMsg
            })
          }

          if (["facebook", "instagram"].includes(ticket.channel)) {
            try {
              const sentMedia = await sendFacebookMessageMedia({
                media,
                ticket,
                body: Array.isArray(outboundBody) ? outboundBody[index] : outboundBody
              });

              if (ticket.channel === "facebook") {
                await verifyMessageMedia(sentMedia, ticket, ticket.contact, true);
              }
            } catch (error) {
              logger.error(`[STORE] Erro ao enviar mídia Facebook/Instagram: ${error}`);
            }
          }

          if (ticket.channel === "telegram") {
            try {
              await sendTelegramMedia({ media, ticket, body: Array.isArray(outboundBody) ? outboundBody[index] : outboundBody });
            } catch (error) {
              logger.error(`[STORE] Erro ao enviar mídia Telegram: ${error}`);
            }
          }

          if (ticket.channel === "webchat") {
            try {
              const { saveWebchatUploadFile, saveWebchatMessage } = require("../services/WebchatServices/WebchatHelpers");
              const fs = require("fs");
              const buf = fs.readFileSync(media.path);
              const saved = saveWebchatUploadFile(ticket.companyId, buf, media.originalname, media.mimetype);
              await saveWebchatMessage({
                ticket,
                contact: ticket.contact,
                body: Array.isArray(outboundBody) ? outboundBody[index] : (outboundBody || ""),
                fromMe: true,
                mediaUrl: saved.url,
                mediaType: saved.type
              });
            } catch (error) {
              logger.error(`[STORE] Erro ao enviar mídia Webchat: ${error}`);
            }
          }
        })
      );
    } else {
      if (ticket.channel === "wacalls" && isPrivate === "false") {
        await SendWacallsText({ ticket, body: outboundBody, quotedMsg });
      } else if (ticket.channel === "whatsapp" && isPrivate === "false") {
        await SendWhatsAppMessage({ body: outboundBody, ticket, quotedMsg, vCard });

      } else if (ticket.channel == 'whatsapp_oficial' && isPrivate === "false") {
        await SendWhatsAppOficialMessage({
          body: outboundBody, ticket, quotedMsg, type: !isNil(vCard) ? 'contacts' : 'text', media: null, vCard
        })
      } else if (ticket.channel === "webchat" && isPrivate === "false") {
        const { saveWebchatMessage } = require("../services/WebchatServices/WebchatHelpers");
        await saveWebchatMessage({
          ticket,
          contact: ticket.contact,
          body: outboundBody as any,
          fromMe: true
        });
      } else if (isPrivate === "true") {
        const messageData = {
          wid: `PVT${ticket.updatedAt.toString().replace(' ', '')}`,
          ticketId: ticket.id,
          contactId: undefined,
          body,
          fromMe: true,
          mediaType: !isNil(vCard) ? 'contactMessage' : 'extendedTextMessage',
          read: true,
          quotedMsgId: null,
          ack: 2,
          remoteJid: ticket.contact?.remoteJid,
          participant: null,
          dataJson: null,
          ticketTrakingId: null,
          isPrivate: isPrivate === "true"
        };

        await CreateMessageService({ messageData, companyId: ticket.companyId });

      } else if (["facebook", "instagram"].includes(ticket.channel) && isPrivate === "false") {
        const sendResult = await sendFacebookMessage({ body: outboundBody, ticket, quotedMsg });

        if (ticket.channel === "facebook") {
          const bodyToSave = sendResult?.processedBody || outboundBody;
          await verifyMessageFace({}, bodyToSave, ticket, ticket.contact, true);
        }
      } else if (ticket.channel === "telegram" && isPrivate === "false") {
        const sentMsg = await sendTelegramMessage({ body: outboundBody, ticket, quotedMsg });
        await verifyTelegramMessage(sentMsg, outboundBody, ticket, ticket.contact, true);
      }
    }

    // ── Reserva do atendimento ao responder (API Oficial) ──────────────────
    //
    // O envio de TEMPLATE já reservava o ticket para quem disparou. Uma
    // resposta de texto ou mídia, não: o atendimento seguia "pending",
    // visível e pegável por qualquer outro atendente da fila. Dois atendentes
    // acabavam respondendo a mesma pessoa.
    //
    // Mesmas regras do storeTemplate: nota interna (isPrivate) não reserva
    // nada, e a atualização só acontece se algo realmente mudar — senão toda
    // mensagem enviada geraria um UPDATE e um evento de socket à toa.
    if (ticket.channel === "whatsapp_oficial" && isPrivate === "false" && currentUserId) {
      try {
        if (Number(ticket.userId) !== currentUserId || ticket.status !== "open") {
          await ticket.update({
            userId: currentUserId,
            status: ticket.isGroup ? "group" : "open",
            isBot: false,
            useIntegration: false,
            integrationId: null,
            promptId: null,
            flowWebhook: false,
            lastFlowId: null,
            hashFlowId: null,
            flowStopped: null
          });

          // Sem o evento, a reserva ficava só no banco: o card continuava em
          // "Aguardando" na tela de todo mundo até alguém dar F5.
          const reloadedTicket = await ShowTicketService(ticket.id, companyId);
          getIO().of(String(companyId)).emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket: reloadedTicket
          });
          logger.info(
            `[STORE] Ticket ${ticket.id} reservado para o atendente ${currentUserId} após resposta`
          );
        }
      } catch (assignErr: any) {
        // Nunca derruba o envio: a mensagem já foi entregue ao cliente.
        logger.warn(`[STORE] Falha ao atribuir ticket ${ticket.id} ao atendente: ${assignErr?.message}`);
      }
    }

    return res.send();
  } catch (error) {
    logger.error(`[STORE] Erro no envio de mensagem: ${error}`);
    return res.status(400).json({ error: error.message });
  }
};

export const forwardMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {

  const { quotedMsg, signMessage, messageId, contactId } = req.body;
  const { id: userId, companyId } = req.user;
  const requestUser = await User.findByPk(userId);

  if (!messageId || !contactId) {
    return res.status(200).send("MessageId or ContactId not found");
  }
  const message = await ShowMessageService(messageId);
  const contact = await ShowContactService(contactId, companyId);

  if (!message) {
    return res.status(404).send("Message not found");
  }
  if (!contact) {
    return res.status(404).send("Contact not found");
  }

  const settings = await CompaniesSettings.findOne({
    where: { companyId }
  }
  )

  const whatsAppConnectionId = await GetWhatsAppFromMessage(message);
  if (!whatsAppConnectionId) {
    return res.status(404).send('Whatsapp from message not found');
  }

  const ticket = await ShowTicketService(message.ticketId, message.companyId);

  const mutex = new Mutex();

  const createTicket = await mutex.runExclusive(async () => {
    const result = await FindOrCreateTicketService(
      contact,
      ticket?.whatsapp,
      0,
      ticket.companyId,
      ticket.queueId,
      requestUser.id,
      contact.isGroup ? contact : null,
      ticket.channel,
      null,
      true,
      settings,
      false,
      false
    );
    return result;
  });

  let ticketData;

  if (isNil(createTicket?.queueId)) {
    ticketData = {
      status: createTicket.isGroup ? "group" : "open",
      userId: requestUser.id,
      queueId: ticket.queueId
    }
  } else {
    ticketData = {
      status: createTicket.isGroup ? "group" : "open",
      userId: requestUser.id
    }
  }

  await UpdateTicketService({
    ticketData,
    ticketId: createTicket.id,
    companyId: createTicket.companyId
  });

  let body = message.body;
  // "chat" é o mediaType que o WhatsApp Plus usa pra mensagem de TEXTO
  // (ver HandleWacallsIncoming: ev.type "text" -> "chat", e
  // SendWacallsMessageService, que grava "chat" no envio). Faltava nesta
  // lista, então encaminhar um texto do WhatsApp Plus caía no ramo de MÍDIA
  // logo abaixo e tentava ler `message.mediaUrl`, que é nulo numa mensagem
  // de texto — daí o erro. Só acontecia nesse canal: no Baileys o texto vem
  // como "conversation"/"extendedTextMessage", que já estavam previstos.
  if (message.mediaType === 'conversation'
    || message.mediaType === 'chat'
    || message.mediaType === 'extendedTextMessage'
    || message.mediaType === 'text'
    || message.mediaType === 'location'
    || message.mediaType === 'contactMessage'
    || message.mediaType === 'interactive') {
    if (ticket.channel === "whatsapp") {
      await SendWhatsAppMessage({ body, ticket: createTicket, quotedMsg, isForwarded: message.fromMe ? false : true });
    }
    if (ticket.channel === "whatsapp_oficial") {
      await SendWhatsAppOficialMessage({ body: `_Mensagem encaminhada_:\n ${body}`, ticket: createTicket, quotedMsg, type: 'text', media: null });
    }
    // WhatsApp Plus (wacalls) não tinha tratamento nenhum aqui: o ticket de
    // destino era criado e atualizado, mas nada era enviado de fato — o
    // encaminhamento simplesmente não acontecia, sem erro visível. Mesmo
    // problema valia pra mídia (bloco abaixo).
    if (ticket.channel === "wacalls") {
      await SendWacallsText({ ticket: createTicket, body, quotedMsg });
    }
  } else {

    const mediaUrl = message.mediaUrl.replace(`:${process.env.PORT}`, '');
    const fileName = obterNomeEExtensaoDoArquivo(mediaUrl);

    if (body === fileName) {
      body = "";
    }

    const publicFolder = path.join(__dirname, '..', '..', '..', 'backend', 'public');

    const filePath = path.join(publicFolder, `company${createTicket.companyId}`, fileName)

    // message.mediaType guarda a CATEGORIA da mídia ("image", "audio",
    // "video", "document"), não um mimetype real. Passar isso como
    // `mimetype` fazia o destino receber um tipo inválido — o WhatsApp Plus
    // usa esse campo pra decidir como enviar, e o navegador usa pra decidir
    // a extensão no download (era a causa do arquivo baixar com extensão
    // errada). Deduz o mimetype de verdade a partir da extensão do arquivo.
    const guessedMime =
      (mime.lookup(fileName) as string) ||
      (message.mediaType && String(message.mediaType).includes("/")
        ? String(message.mediaType)
        : "application/octet-stream");

    // Trabalha sobre uma CÓPIA, nunca sobre o arquivo da mensagem original.
    //
    // Os serviços de envio tratam a mídia recebida como um upload
    // descartável: o de áudio converte pra OGG/Opus e APAGA o arquivo de
    // origem (normalizeWacallsAudio), e moveToPublic pode mover/renomear.
    // Isso é correto pra um upload novo, mas aqui a "origem" é o arquivo da
    // mensagem que já está no histórico — encaminhar um áudio destruía a
    // mídia da mensagem original, e a conversão em cima de um caminho que
    // some no meio é o que gerava o erro. Copiar antes isola o encaminhamento
    // por completo.
    let forwardPath = filePath;
    try {
      if (fs.existsSync(filePath)) {
        const tmpDir = path.join(publicFolder, `company${createTicket.companyId}`, "tmp-forward");
        fs.mkdirSync(tmpDir, { recursive: true });

        // Autolimpeza: no caminho normal o serviço de envio MOVE este
        // arquivo pra pasta final, então nada fica pra trás. Mas se o envio
        // falhar antes disso (rede, sessão caída), a cópia ficaria presa
        // aqui pra sempre. Remove o que tiver mais de 1 hora antes de criar
        // a próxima — barato e se conserta sozinho, sem depender de rotina
        // externa.
        try {
          const limite = Date.now() - 60 * 60 * 1000;
          for (const f of fs.readdirSync(tmpDir)) {
            const p = path.join(tmpDir, f);
            try {
              if (fs.statSync(p).mtimeMs < limite) fs.unlinkSync(p);
            } catch { /* ignora arquivo em uso */ }
          }
        } catch { /* pasta recém-criada ou sem permissão — segue */ }

        forwardPath = path.join(tmpDir, `${Date.now()}-${fileName}`);
        fs.copyFileSync(filePath, forwardPath);
      } else {
        logger.warn(`[FORWARD] Arquivo de mídia não encontrado: ${filePath}`);
      }
    } catch (err: any) {
      logger.warn(`[FORWARD] Falha ao copiar mídia para encaminhamento: ${err?.message}`);
      forwardPath = filePath;
    }

    const mediaSrc = {
      fieldname: 'medias',
      originalname: fileName,
      encoding: '7bit',
      mimetype: guessedMime,
      filename: fileName,
      path: forwardPath
    } as Express.Multer.File

    if (ticket.channel === "whatsapp") {
      await SendWhatsAppMedia({ media: mediaSrc, ticket: createTicket, body, isForwarded: message.fromMe ? false : true });
    }
    if (ticket.channel === "whatsapp_oficial") {
      await SendWhatsAppOficialMessage({ body: `_Mensagem encaminhada_:\n ${body}`, ticket: createTicket, quotedMsg, type: null, media: mediaSrc });
    }
    if (ticket.channel === "wacalls") {
      await SendWacallsMediaMessage({ ticket: createTicket, media: mediaSrc, body, quotedMsg });
    }
  }

  return res.send();
}

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;
  const { companyId } = req.user;

  // wacalls: rota separada — o helper padrão trata só Baileys.
  const existing = await Message.findOne({ where: { id: messageId, companyId }, include: [{ model: require("../models/Ticket").default, as: "ticket", include: ["contact", "whatsapp"] }] });
  if (existing && (existing as any).ticket?.channel === "wacalls") {
    const updated = await DeleteWacallsMessage(existing, (existing as any).ticket);
    getIO().of(String(companyId)).emit(`company-${companyId}-appMessage`, { action: "update", message: updated });
    return res.send();
  }

  const message = await DeleteWhatsAppMessage(messageId, companyId);
  const io = getIO();


  if (message.isPrivate) {
    await Message.destroy({
      where: {
        id: message.id
      }
    });
    io.of(String(companyId))
      .emit(`company-${companyId}-appMessage`, {
        action: "delete",
        message
      });
  }

  io.of(String(companyId))
    .emit(`company-${companyId}-appMessage`, {
      action: "update",
      message
    });

  return res.send();
};

export const allMe = async (req: Request, res: Response): Promise<Response> => {

  const dateStart: any = req.query.dateStart;
  const dateEnd: any = req.query.dateEnd;
  const fromMe: any = req.query.fromMe;

  const { companyId } = req.user;

  const { count } = await ListMessagesServiceAll({
    companyId,
    fromMe,
    dateStart,
    dateEnd
  });

  return res.json({ count });
};

export const send = async (req: Request, res: Response): Promise<Response> => {
  const messageData: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  try {

    const authHeader = req.headers.authorization;
    const [, token] = authHeader.split(" ");

    const whatsapp = await Whatsapp.findOne({ where: { token } });
    if (!whatsapp) {
      return res.status(401).json({ error: "Token inválido ou WhatsApp não encontrado" });
    }
    const companyId = whatsapp.companyId;
    const company = await ShowPlanCompanyService(companyId);
    const sendMessageWithExternalApi = company?.plan?.useExternalApi

    if (sendMessageWithExternalApi) {

      if (!whatsapp) {
        throw new Error("Não foi possível realizar a operação");
      }

      if (messageData.number === undefined) {
        throw new Error("O número é obrigatório");
      }

      const number = messageData.number;
      const body = messageData.body;

      if (medias) {
        await Promise.all(
          medias.map(async (media: Express.Multer.File) => {
            req.app.get("queues").messageQueue.add(
              "SendMessage",
              {
                whatsappId: whatsapp.id,
                data: {
                  number,
                  body: media.originalname.replace('/', '-'),
                  mediaPath: media.path
                }
              },
              { removeOnComplete: true, attempts: 3 }
            );
          })
        );
      } else {
        req.app.get("queues").messageQueue.add(
          "SendMessage",
          {
            whatsappId: whatsapp.id,
            data: {
              number,
              body
            }
          },
          { removeOnComplete: true, attempts: 3 }
        );
      }
      return res.send({ mensagem: "Mensagem enviada!" });
    }
    return res.status(400).json({ error: 'Essa empresa não tem permissão para usar a API Externa. Entre em contato com o Suporte para verificar nossos planos!' });

  } catch (err: any) {
    logger.error(`[SEND] Erro ao enviar mensagem: ${err.message || err}`);
    if (Object.keys(err).length === 0) {
      throw new AppError(
        "Não foi possível enviar a mensagem, tente novamente em alguns instantes"
      );
    } else {
      throw new AppError(err.message);
    }
  }
};

export const edit = async (req: Request, res: Response): Promise<Response> => {
  const { messageId } = req.params;
  const { companyId } = req.user;
  const { body }: MessageData = req.body;

  const existing = await Message.findOne({ where: { id: messageId, companyId }, include: [{ model: require("../models/Ticket").default, as: "ticket", include: ["contact", "whatsapp"] }] });
  if (existing && (existing as any).ticket?.channel === "wacalls") {
    const updated = await EditWacallsMessage({ message: existing, ticket: (existing as any).ticket, body });
    getIO().of(String(companyId)).emit(`company-${companyId}-appMessage`, { action: "update", message: updated });
    return res.send();
  }

  const { ticket, message } = await EditWhatsAppMessage({ messageId, body });


  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-appMessage`, {
      action: "update",
      message
    });

  io.of(String(companyId))
    .emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket
    });
  return res.send();
}

export const storeTemplate = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const { quotedMsg, templateId, variables, bodyToSave }: MessageTemplateData = req.body;
  const medias = req.files as Express.Multer.File[];
  const { companyId } = req.user;

  const ticket = await ShowTicketService(ticketId, companyId);

  const template = await ShowService(templateId, companyId);

  if (!template) {
    throw new Error("Template not found");
  }
  let templateData: IMetaMessageTemplate = {
    name: template.shortcode,
    language: {
      code: template.language
    }
  }
  let buttonsToSave = []
  if (Object.keys(variables).length > 0) {
    templateData = {
      name: template.shortcode,
      language: {
        code: template.language
      },
    };

    if (Array.isArray(template.components) && template.components.length > 0) {
      template.components.forEach((component, index) => {
        const componentType = component.type.toLowerCase() as "header" | "body" | "footer" | "button";
        if (variables[componentType] && Object.keys(variables[componentType]).length > 0) {
          let newComponent

          if (componentType.replace("buttons", "button") === "button") {
            const buttons = JSON.parse(component.buttons)
            buttons.forEach((button, index) => {
              const subButton = Object.values(variables[componentType])
              subButton.forEach((sub, indexSub) => {
                if ((sub as any).buttonIndex === index) {
                  const buttonType = button.type;
                  newComponent =
                  {
                    type: componentType.replace("buttons", "button"),
                    sub_type: buttonType,
                    index: index,
                    parameters: []
                  };
                }
              })
            })
          }
          else {
            newComponent = {
              type: componentType,
              parameters: []
            };
          }

          if (newComponent) {
            Object.keys(variables[componentType]).forEach(key => {
              if (componentType.replace("buttons", "button") === "button") {
                if ((newComponent as any)?.sub_type === "COPY_CODE") {
                  newComponent.parameters.push({
                    type: "coupon_code",
                    coupon_code: variables[componentType][key].value
                  })

                } else {
                  newComponent.parameters.push({
                    type: "text",
                    text: variables[componentType][key].value
                  })
                }

              }
              else {
                if (template.components[index].format === 'IMAGE') {
                  newComponent.parameters.push({
                    type: "image",
                    image: {
                      link: variables[componentType][key].value
                    }
                  })
                }
                else {
                  const variableValue = variables[componentType][key].value;
                  newComponent.parameters.push({
                    type: "text",
                    text: variableValue
                  });
                }
              }
            });
          }
          if (!Array.isArray(templateData.components)) {
            templateData.components = [];
          }
          templateData.components.push(newComponent as IMetaMessageTemplateComponents);
        }
      });
    }
  }

  if (template.components.length > 0) {
    for (const component of template.components) {
      if (component.type === 'BUTTONS') {
        buttonsToSave.push(component.buttons)
      }
    }
  }
  logger.debug(`[STORE_TEMPLATE] templateData: ${JSON.stringify(templateData)}`);
  // ✅ Monta o body que será salvo na Message e renderizado pelo
  //    componente <Template /> do frontend, contendo (na ordem):
  //    - URL da imagem do header (se houver) -> renderiza <img>
  //    - Texto do body do template já com {{1}}, {{2}}... substituídos
  //    - "||||" + JSON dos botões
  const renderedBody = buildTemplateBodyToSave(
    template.components as any,
    templateData.components as any,
    bodyToSave
  );
  // Mantém compatibilidade: se houver bodyToSave vindo do front e a
  // renderização não produziu nada útil, usa o formato antigo.
  const newBodyToSave = renderedBody && renderedBody !== "||||[]"
    ? renderedBody
    : bodyToSave.concat('||||', JSON.stringify(buttonsToSave))
  if (["whatsapp_oficial"].includes(ticket.channel) && ticket.whatsappId) {
    SetTicketMessagesAsRead(ticket);
  }

  try {

    if (ticket.channel == 'whatsapp_oficial') {
      await SendWhatsAppOficialMessage({
        body: newBodyToSave, ticket, quotedMsg, type: 'template', media: null, template: templateData
      })

      // ✅ Ao enviar template pela API Oficial, o ticket passa a ser
      // atendimento ativo do usuário que disparou o template.
      // Isso garante que a resposta do cliente caia SOMENTE para esse
      // atendente e não retorne para a fila "Aguardando" (visível a todos).
      //
      // POR QUE ISSO PARECIA NÃO FUNCIONAR
      //
      // A reserva já era gravada no banco, mas NINGUÉM era avisado: um
      // ticket.update() direto no model não emite evento de socket. O
      // resultado é que a conversa continuava aparecendo em "Aguardando" para
      // todos os atendentes, e na tela de quem enviou o template ela não subia
      // para "Atendendo" — só depois de um F5. Na prática, "abrir e mandar o
      // template não reserva o ticket".
      //
      // Agora, depois de gravar, emitimos os MESMOS dois eventos que o
      // UpdateTicketService emite (ver UpdateTicketService.ts:1246-1262):
      // "delete" tira o card da lista de origem e "update" o entrega já
      // atribuído. A tela reage na hora, sem recarregar.
      try {
        const currentUserId = (req.user && (req.user as any).id) ? Number((req.user as any).id) : null;

        // Não rouba conversa que já está com OUTRO atendente. Reservar é para
        // quem iniciou; se a conversa já tem dono, quem manda o template está
        // ajudando num atendimento alheio e a atribuição deve continuar como
        // está — transferir é uma decisão consciente, feita pela tela de
        // transferência.
        const donoAtual = ticket.userId ? Number(ticket.userId) : null;
        const podeReservar =
          !!currentUserId && (donoAtual === null || donoAtual === currentUserId);

        if (!currentUserId) {
          logger.warn(`[STORE_TEMPLATE] Sem usuário na requisição — ticket ${ticket.id} não foi reservado`);
        } else if (!podeReservar) {
          logger.info(
            `[STORE_TEMPLATE] Ticket ${ticket.id} já está com o atendente ${donoAtual} — atribuição preservada`
          );
        } else {
          const statusAnterior = ticket.status;

          await ticket.update({
            userId: currentUserId,
            status: "open",
            isBot: false,
            useIntegration: false,
            integrationId: null,
            promptId: null,
            flowWebhook: false,
            lastFlowId: null,
            hashFlowId: null,
            flowStopped: null
          });

          // Recarrega com as associações que a lista de tickets do frontend
          // espera. Sem contact/queue/user o card chega incompleto e some da
          // tela em vez de aparecer atribuído.
          const ticketAtualizado = await ShowTicketService(ticket.id, companyId);

          const io = getIO();

          // Tira o card da lista antiga (Aguardando) de todo mundo.
          if (statusAnterior !== ticketAtualizado.status) {
            io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
              action: "delete",
              ticketId: ticket.id
            });
          }

          // Entrega o card já atribuído a quem enviou o template.
          io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket: ticketAtualizado
          });

          logger.info(
            `[STORE_TEMPLATE] Ticket ${ticket.id} reservado para o atendente ${currentUserId} após envio de template (status ${statusAnterior} -> open)`
          );
        }
      } catch (assignErr: any) {
        logger.warn(`[STORE_TEMPLATE] Falha ao atribuir ticket ${ticket.id} ao atendente: ${assignErr?.message}`);
      }

      await ticket.reload({
        include: [{ model: Contact, as: "contact" }]
      });
      await ticket.contact.update({
        lastInteractionClient: new Date()
      });
      logger.info(`[STORE_TEMPLATE] Template enviado - Janela de 24h aberta para o contato ${ticket.contact.id}`);
    }

    return res.send(200);
  } catch (error) {
    logger.error(`[STORE_TEMPLATE] Erro ao enviar template: ${error.message}`);
    return res.status(400).json({ error: error.message });
  }
};

export const sendMessageFlow = async (
  whatsappId: number,
  body: any,
  req: Request,
  files?: Express.Multer.File[]
): Promise<String> => {
  const messageData = body;
  const medias = files;

  try {
    const whatsapp = await Whatsapp.findByPk(whatsappId);

    if (!whatsapp) {
      throw new Error("Não foi possível realizar a operação");
    }

    if (messageData.number === undefined) {
      throw new Error("O número é obrigatório");
    }

    const numberToTest = messageData.number;
    const body = messageData.body;

    const companyId = messageData.companyId;

    const CheckValidNumber: any = await CheckContactNumber(numberToTest, companyId);
    const number = CheckValidNumber.jid.split("@")[0];

    if (medias) {
      await Promise.all(
        medias.map(async (media: Express.Multer.File) => {
          await req.app.get("queues").messageQueue.add(
            "SendMessage",
            {
              whatsappId,
              data: {
                number,
                body: media.originalname,
                mediaPath: media.path
              }
            },
            { removeOnComplete: true, attempts: 3 }
          );
        })
      );
    } else {
      req.app.get("queues").messageQueue.add(
        "SendMessage",
        {
          whatsappId,
          data: {
            number,
            body
          }
        },

        { removeOnComplete: false, attempts: 3 }
      );
    }

    return "Mensagem enviada";
  } catch (err: any) {
    if (Object.keys(err).length === 0) {
      throw new AppError(
        "Não foi possível enviar a mensagem, tente novamente em alguns instantes"
      );
    } else {
      throw new AppError(err.message);
    }
  }
};

export const transcribeAudioMessage = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { wid } = req.body;

  const transcribedText = await TranscribeAudioMessageToText(wid, companyId.toString());

  return res.send(transcribedText);
};

export const storeInteractive = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;
  const {
    interactiveType,
    bodyText,
    footerText,
    headerText,
    headerImage,
    buttons,
    listButtonText,
    sections,
    latitude,
    longitude,
    locationName,
    locationAddress,
    urlText,
    url,
    callText,
    callNumber,
    pixKey,
    pixName,
    pixCity,
    pixAmount,
    pixCopyPaste,
    pixButtonText,
    pixIncludeQrCode,
    pixDocumentUrl,
    pixDocumentName,
    pixTotal,
    pollQuestion,
    pollOptions,
    offerTitle,
    offerPrice,
    offerDescription,
    offerImageUrl,
    carouselCards,
    cobrancaNumber,
    cobrancaDescription,
    cobrancaQuantity,
    cobrancaAmount,
    cobrancaMessage,
    cobrancaPaymentUrl,
    cobrancaButtonText,
    cobrancaPdfPath,
  } = req.body;

  const ticket = await ShowTicketService(ticketId, companyId);

  if (!ticket.whatsappId) {
    throw new AppError("ERR_TICKET_NO_LINKED_CONNECTION", 400);
  }

  SetTicketMessagesAsRead(ticket);

  try {
    const SendWhatsAppInteractive = (await import("../services/WbotServices/SendWhatsAppInteractive")).default;

    const result = await SendWhatsAppInteractive({
      ticket,
      interactiveType,
      bodyText: bodyText || "",
      footerText,
      headerText,
      headerImage,
      buttons,
      listButtonText,
      sections,
      latitude,
      longitude,
      locationName,
      locationAddress,
      urlText,
      url,
      callText,
      callNumber,
      pixKey,
      pixName,
      pixCity,
      pixAmount,
      pixCopyPaste,
      pixButtonText,
      pixIncludeQrCode,
      pixDocumentUrl,
      pixDocumentName,
      pixTotal,
      pollQuestion,
      pollOptions,
      offerTitle,
      offerPrice,
      offerDescription,
      offerImageUrl,
      carouselCards,
      cobrancaNumber,
      cobrancaDescription,
      cobrancaQuantity: cobrancaQuantity ? parseInt(cobrancaQuantity) : undefined,
      cobrancaAmount: cobrancaAmount ? parseFloat(cobrancaAmount) : undefined,
      cobrancaMessage,
      cobrancaPaymentUrl,
      cobrancaButtonText,
      cobrancaPdfPath,
    });

    return res.json({ message: "Mensagem interativa enviada com sucesso", result });
  } catch (error) {
    logger.error(`[storeInteractive] Erro: ${error?.message}`);
    return res.status(400).json({ error: error?.message || "Erro ao enviar mensagem interativa" });
  }
};

export const reactToMessage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    const message = await Message.findByPk(messageId, {
      include: [
        {
          model: require("../models/Ticket").default,
          as: "ticket",
          include: [
            { model: Whatsapp, as: "whatsapp" },
            { model: require("../models/Contact").default, as: "contact" }
          ]
        }
      ]
    });

    if (!message) {
      throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
    }

    const ticket = message.ticket;

    if (ticket.channel === "wacalls") {
      const reactionMessage = await SendWacallsReaction({ message, ticket, emoji: emoji || "" });
      return res.json({ success: true, emoji, message: reactionMessage });
    }

    if (ticket.channel !== "telegram") {
      // Canais Baileys (whatsapp) agora reagem de verdade no aparelho.
      if (!ticket.channel || ticket.channel === "whatsapp") {
        await ReactWhatsAppMessage({ message, ticket, emoji: emoji || "" });
        return res.json({ success: true, emoji });
      }
      throw new AppError(
        "Reações não são suportadas neste canal de atendimento.",
        400
      );
    }

    // Extrair o message_id do Telegram a partir do wid (formato: tg-{message_id})
    const tgMessageId = message.wid?.replace("tg-", "");
    if (!tgMessageId || isNaN(Number(tgMessageId))) {
      throw new AppError("ERR_INVALID_TELEGRAM_MESSAGE_ID", 400);
    }

    const botToken = ticket.whatsapp?.token;
    if (!botToken) {
      throw new AppError("ERR_TELEGRAM_BOT_TOKEN_NOT_FOUND", 400);
    }

    const chatId = ticket.contact?.number;
    if (!chatId) {
      throw new AppError("ERR_NO_CONTACT_NUMBER", 400);
    }

    const { setMessageReaction } = require("../services/TelegramServices/telegramBotAPI");
    await setMessageReaction(botToken, chatId, Number(tgMessageId), emoji || undefined);

    return res.json({ success: true, emoji });
  } catch (err: any) {
    logger.error(`[reactToMessage] Erro: ${err.message}`);
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || "Erro ao enviar reação" });
  }
};

export const aiSuggestReply = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { userMessage } = req.body;
    const { companyId } = req.user;

    const suggestion = await suggestReply({ ticketId, companyId, userMessage });
    return res.json({ suggestion });
  } catch (err: any) {
    logger.error(`[aiSuggestReply] Erro: ${err.message}`);
    return res.status(500).json({ error: err.message || "Erro ao gerar sugestão" });
  }
};

export const aiSummarize = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { ticketId } = req.params;
    const { companyId } = req.user;

    const summary = await summarizeConversation({ ticketId, companyId });
    return res.json({ summary });
  } catch (err: any) {
    logger.error(`[aiSummarize] Erro: ${err.message}`);
    return res.status(500).json({ error: err.message || "Erro ao gerar resumo" });
  }
};
