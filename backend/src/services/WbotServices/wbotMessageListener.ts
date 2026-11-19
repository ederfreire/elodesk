import path, { join } from "path";
import { readFile } from "fs";
import fs from "fs";
import { promises as fsp } from "fs";
import { convertToMp3Sibling } from "../../utils/AudioUtils";
import * as Sentry from "@sentry/node";
import { isNil, isNull } from "lodash";
import { REDIS_URI_MSG_CONN } from "../../config/redis";

import {
  downloadMediaMessage,
  extractMessageContent,
  getContentType,
  GroupMetadata,
  jidNormalizedUser,
  delay,
  MediaType,
  MessageUpsertType,
  proto,
  WAMessage,
  WAMessageStubType,
  WAMessageUpdate,
  WASocket
} from "@whiskeysockets/baileys";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { Mutex } from "async-mutex";
import { getIO } from "../../libs/socket";
import CreateMessageService from "../MessageServices/CreateMessageService";
import logger from "../../utils/logger";

// Logs de depuração ([FLOW-DEBUG], [CAMPANHAS], etc.) ficam silenciados por
// padrão para reduzir o consumo de I/O e memória. Defina DEBUG_FLOW=true para
// habilitá-los novamente em ambiente de troubleshooting.
const FLOW_DEBUG_ENABLED =
  String(process.env.DEBUG_FLOW || "").toLowerCase() === "true";
const flowDebug = (...args: any[]): void => {
  if (FLOW_DEBUG_ENABLED) console.log(...args);
};
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import { debounce } from "../../helpers/Debounce";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import formatBody from "../../helpers/Mustache";
import {
  buildChatbotBackAndExitText,
  buildChatbotExitOnlyText
} from "../../helpers/chatbotMenuLabels";
import TicketTraking from "../../models/TicketTraking";
import UserRating from "../../models/UserRating";
import SendWhatsAppMessage from "./SendWhatsAppMessage";
import { SendMessage } from "../../helpers/SendMessage";
import { sendFacebookMessage } from "../FacebookServices/sendFacebookMessage";
import { sendTelegramMessage } from "../TelegramServices/sendTelegramMessage";
import moment from "moment";
import Queue from "../../models/Queue";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import VerifyCurrentSchedule from "../CompanyService/VerifyCurrentSchedule";
import PromptCoversNow from "../../helpers/PromptCoversNow";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import { Op } from "sequelize";
import { campaignQueue, parseToMilliseconds, randomValue } from "../../queues";
import User from "../../models/User";
import { sayChatbot } from "./ChatBotListener";
import MarkDeleteWhatsAppMessage from "./MarkDeleteWhatsAppMessage";
import ListUserQueueServices from "../UserQueueServices/ListUserQueueServices";
import cacheLayer from "../../libs/cache";
import { addLogs } from "../../helpers/addLogs";
import SendWhatsAppMedia, { getMessageOptions } from "./SendWhatsAppMedia";

import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import { createDialogflowSessionWithModel } from "../QueueIntegrationServices/CreateSessionDialogflow";
import { queryDialogFlow } from "../QueueIntegrationServices/QueryDialogflow";
import CompaniesSettings from "../../models/CompaniesSettings";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";
import Whatsapp from "../../models/Whatsapp";
import QueueIntegrations from "../../models/QueueIntegrations";
import ShowFileService from "../FileServices/ShowService";

import OpenAI from "openai";
import ffmpeg from "fluent-ffmpeg";
import {
  SpeechConfig,
  SpeechSynthesizer,
  AudioConfig
} from "microsoft-cognitiveservices-speech-sdk";
import typebotListener from "../TypebotServices/typebotListener";
import Tag from "../../models/Tag";
import TicketTag from "../../models/TicketTag";
import pino from "pino";
import BullQueues from "../../libs/queue";
import { Transform } from "stream";
// import { msgDB } from "../../libs/wbot";
import { title } from "process";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import HandleFlowExitKeyword from "../FlowBuilderService/HandleFlowExitKeyword";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";
import { FlowDefaultModel } from "../../models/FlowDefault";
import { ActionsWebhookService } from "../WebhookService/ActionsWebhookService";
import { resolveFlowEntryNodeId } from "../WebhookService/resolveFlowEntryNodeId";

import { WebhookModel } from "../../models/Webhook";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import ContactTag from "../../models/ContactTag";
import ShowContactService from "../ContactServices/ShowContactService";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import { getContactMessage as getContactMessageHandler } from "./messageContactHandler";

import { ENABLE_LID_DEBUG } from "../../config/debug";
import { normalizeJid } from "../../utils";
import { resolvePN, addLidPnMapping, extractMappingsFromContacts } from "../../utils/LidPnCache";
import { handleOpenAiFlow, isWithinWorkingHours } from "../IntegrationsServices/OpenAiService";
import { upsertLead } from "../LeadServices/UpsertLeadService";
import trackTokenUsage from "../../helpers/TrackTokenUsage";
import ShowPromptService from "../PromptServices/ShowPromptService";
import PromptKnowledgeBase from "../../models/PromptKnowledgeBase";
import PromptModel from "../../models/Prompt";
import { getJidOf } from "./getJidOf";
import { verifyContact } from "./verifyContact";
import ApplyQueueAiAgent from "../../helpers/ApplyQueueAiAgent";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import SendWhatsAppOficialMessage from "../WhatsAppOficial/SendWhatsAppOficialMessage";
import { buildAiAgentGreetingFromPromptLanguages } from "../../helpers/AiAgentGreeting";
// import { verifyContact } from "./verifyContact";
import os from "os";
import request from "request";
import axios from "axios";
import https from "https";
import { Session, getInMemoryStore } from "../../libs/wbot";
import { getGroupMetadataCache, groupMetadataCache, updateGroupMetadataCache } from "../../utils/RedisGroupCache";
import { SimpleObjectCache } from "../../utils/SimpleObjectCache";

// ✅ Cache de CompaniesSettings por companyId (TTL 5 min) — agora usando SimpleObjectCache
export const _settingsCache = new SimpleObjectCache<any>(300); // 5 min TTL
const settingsCache = _settingsCache;

const getCachedCompanySettings = async (companyId: number) => {
  return settingsCache.getOrFetch(
    `settings:${companyId}`,
    async () => CompaniesSettings.findOne({ where: { companyId } }) as any,
    300
  );
};

// ✅ Usa o binário ffmpeg/ffprobe resolvido e VERIFICADO (ffmpeg-static etc.),
// evitando o "/usr/bin/ffmpeg ENOENT" quando o binário do SO não existe.
import { FFMPEG_BIN, FFPROBE_BIN } from "../../utils/ffmpegPath";
import writeMediaDeduped from "../../helpers/DedupeMedia";
import { obterClienteIA, janelaDeHistorico, executarComControle } from "../../helpers/ControleDeIA";
try {
  ffmpeg.setFfmpegPath(FFMPEG_BIN);
  ffmpeg.setFfprobePath(FFPROBE_BIN);
} catch {}

// Rate limiter para processamento de mensagens
let msgCounter = 0;
let msgCounterResetTimer: ReturnType<typeof setInterval> | null = null;

const ensureMsgCounterTimer = () => {
  if (!msgCounterResetTimer) {
    msgCounterResetTimer = setInterval(() => {
      msgCounter = 0;
    }, 5000);
  }
};

// Limpar timer ao descarregar módulo (evita acúmulo em hot-reload)
const cleanupMsgTimer = () => {
  if (msgCounterResetTimer) {
    clearInterval(msgCounterResetTimer);
    msgCounterResetTimer = null;
  }
};
process.once('SIGTERM', cleanupMsgTimer);
process.once('SIGINT', cleanupMsgTimer);

// Iniciar timer
ensureMsgCounterTimer();

interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

export interface IExtendedMessageKey {
  remoteJid?: string | null;
  fromMe?: boolean | null;
  id?: string | null;
  participant?: string | null;
  sender_lid?: string;
  participant_lid?: string;
  sender_pn?: string;
  participant_pn?: string;
  peer_recipient_pn?: string;
}

export interface IMe {
  name: string;
  id: string;
  lid?: string;
  senderPn?: string;
  notify?: string;
  verifiedName?: string;
}

const lidUpdateMutex = new Mutex();

// ✅ Mutex separados por contato para criação de tickets (evita race conditions)
// Inspirado no Ticketz: usar mutex por contactId ao invés de criar um novo por mensagem
const ticketMutexMap = new Map<string, Mutex>();
const MUTEX_CLEANUP_INTERVAL = 10 * 60 * 1000; // Limpar a cada 10 min
const mutexLastUsed = new Map<string, number>();

const getTicketMutex = (contactId: string | number): Mutex => {
  const key = String(contactId);
  mutexLastUsed.set(key, Date.now());
  if (!ticketMutexMap.has(key)) {
    ticketMutexMap.set(key, new Mutex());
  }
  return ticketMutexMap.get(key)!;
};

// Limpeza periódica de mutexes não utilizados
setInterval(() => {
  const now = Date.now();
  for (const [key, lastUsed] of mutexLastUsed) {
    if (now - lastUsed > MUTEX_CLEANUP_INTERVAL) {
      const mutex = ticketMutexMap.get(key);
      if (mutex && !mutex.isLocked()) {
        ticketMutexMap.delete(key);
        mutexLastUsed.delete(key);
      }
    }
  }
}, MUTEX_CLEANUP_INTERVAL).unref();

interface SessionOpenAi extends OpenAI {
  id?: number;
}
const sessionsOpenAi: SessionOpenAi[] = [];

// Adicionar depois das interfaces existentes:
interface PhraseCondition {
  text: string;
  type: "exact" | "partial";
}

interface CampaignPhrase {
  id: number;
  flowId: number;
  phrase: PhraseCondition[];
  whatsappId: number;
  status: boolean;
  companyId: number;
}



// Removido promisify(writeFile); usando fs.promises.writeFile

function removeFile(directory) {
  fs.unlink(directory, error => {
    if (error) throw error;
  });
}

const getTimestampMessage = (msgTimestamp: any) => {
  return msgTimestamp * 1;
};

const multVecardGet = function (param: any) {
  let output = " ";

  let name = param
    .split("\n")[2]
    .replace(";;;", "\n")
    .replace("N:", "")
    .replace(";", "")
    .replace(";", " ")
    .replace(";;", " ")
    .replace("\n", "");
  let inicio = param.split("\n")[4].indexOf("=");
  let fim = param.split("\n")[4].indexOf(":");
  let contact = param
    .split("\n")[4]
    .substring(inicio + 1, fim)
    .replace(";", "");
  let contactSemWhats = param.split("\n")[4].replace("item1.TEL:", "");
  if (contact != "item1.TEL") {
    output = output + name + ": 📞" + contact + "" + "\n";
  } else output = output + name + ": 📞" + contactSemWhats + "" + "\n";
  return output;
};

const contactsArrayMessageGet = (msg: any) => {
  let contactsArray = msg.message?.contactsArrayMessage?.contacts;
  let vcardMulti = contactsArray.map(function (item, indice) {
    return item.vcard;
  });

  let bodymessage = ``;
  vcardMulti.forEach(function (vcard, indice) {
    bodymessage += vcard + "\n\n" + "";
  });

  let contacts = bodymessage.split("BEGIN:");

  contacts.shift();
  let finalContacts = "";
  for (let contact of contacts) {
    finalContacts = finalContacts + multVecardGet(contact);
  }

  return finalContacts;
};

const getTypeMessage = (msg: proto.IWebMessageInfo): string => {
  const message = (msg.message as any) || {};
  const nestedMessage =
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.ephemeralMessage?.message?.viewOnceMessage?.message ||
    message.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
    {};

  if (message?.extendedTextMessage?.contextInfo?.externalAdReply) {
    return "adMetaPreview"; // Adicionado para tratar mensagens de anúncios;
  }

  if (message?.viewOnceMessageV2) {
    return "viewOnceMessageV2";
  }

  if (message?.templateButtonReplyMessage || nestedMessage?.templateButtonReplyMessage) {
    return "templateButtonReplyMessage";
  }

  // ✅ Suporte a resposta de botões interativos (nativeFlowMessage)
  if (message?.interactiveResponseMessage || nestedMessage?.interactiveResponseMessage) {
    return "interactiveResponseMessage";
  }

  if (message?.buttonsResponseMessage || nestedMessage?.buttonsResponseMessage) {
    return "buttonsResponseMessage";
  }

  if (message?.listResponseMessage || nestedMessage?.listResponseMessage) {
    return "listResponseMessage";
  }

  const msgType = getContentType(msg.message);
  return msgType as string;
};
const getAd = (msg: any): string => {
  if (
    msg.key.fromMe &&
    msg.message?.listResponseMessage?.contextInfo?.externalAdReply
  ) {
    let bodyMessage = `*${msg.message?.listResponseMessage?.contextInfo?.externalAdReply?.title}*`;

    bodyMessage += `\n\n${msg.message?.listResponseMessage?.contextInfo?.externalAdReply?.body}`;

    return bodyMessage;
  }
};

const getBodyButton = (msg: any): string => {
  try {
    if (
      msg?.messageType === "buttonsMessage" ||
      msg?.message?.buttonsMessage?.contentText
    ) {
      let bodyMessage = `[BUTTON]\n\n*${msg?.message?.buttonsMessage?.contentText}*\n\n`;
      // eslint-disable-next-line no-restricted-syntax
      for (const button of msg.message?.buttonsMessage?.buttons) {
        bodyMessage += `*${button.buttonId}* - ${button.buttonText.displayText}\n`;
      }

      return bodyMessage;
    }
    if (
      msg?.messageType === "listMessage" ||
      msg?.message?.listMessage?.description
    ) {
      let bodyMessage = `[LIST]\n\n*${msg?.message?.listMessage?.description}*\n\n`;
      // eslint-disable-next-line no-restricted-syntax
      for (const button of msg.message?.listMessage?.sections[0]?.rows) {
        bodyMessage += `${button.title}\n`;
      }

      return bodyMessage;
    }
  } catch (error) {
    logger.error(error);
  }
};

const msgLocation = (image, latitude, longitude) => {
  if (image) {
    var b64 = Buffer.from(image).toString("base64");

    let data = `data:image/png;base64, ${b64} | https://maps.google.com/maps?q=${latitude}%2C${longitude}&z=17&hl=pt-BR|${latitude}, ${longitude} `;
    return data;
  }
};

// ✅ Descrição amigável para mídias no card do atendimento
const getMediaDescription = (msgType: string): string => {
  const descriptions: Record<string, string> = {
    imageMessage: "📷 Imagem",
    videoMessage: "🎥 Vídeo",
    audioMessage: "🎵 Áudio",
    documentMessage: "📄 Documento",
    documentWithCaptionMessage: "📄 Documento",
    stickerMessage: "🏷️ Figurinha",
    locationMessage: "📍 Localização",
    liveLocationMessage: "📍 Localização ao vivo",
    contactMessage: "👤 Contato",
    contactsArrayMessage: "👥 Contatos",
    viewOnceMessageV2: "📷 Visualização única",
  };
  return descriptions[msgType] || "";
};

export const getBodyMessage = (msg: proto.IWebMessageInfo): string | null => {
  try {
    let type = getTypeMessage(msg);

    // type undefined silenciado

    const types = {
      conversation: msg.message?.conversation,
      imageMessage: msg.message?.imageMessage?.caption,
      videoMessage: msg.message?.videoMessage?.caption,
      extendedTextMessage: msg?.message?.extendedTextMessage?.text,
      buttonsResponseMessage:
        msg.message?.buttonsResponseMessage?.selectedDisplayText,
      listResponseMessage:
        msg.message?.listResponseMessage?.title ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
      templateButtonReplyMessage:
        msg.message?.templateButtonReplyMessage?.selectedId,
      messageContextInfo:
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.title,
      buttonsMessage:
        getBodyButton(msg) || msg.message?.listResponseMessage?.title,
      stickerMessage: "sticker",
      contactMessage: msg.message?.contactMessage?.vcard,
      contactsArrayMessage:
        msg.message?.contactsArrayMessage?.contacts &&
        contactsArrayMessageGet(msg),
      //locationMessage: `Latitude: ${msg.message.locationMessage?.degreesLatitude} - Longitude: ${msg.message.locationMessage?.degreesLongitude}`,
      locationMessage: msgLocation(
        msg.message?.locationMessage?.jpegThumbnail,
        msg.message?.locationMessage?.degreesLatitude,
        msg.message?.locationMessage?.degreesLongitude
      ),
      liveLocationMessage: `Latitude: ${msg.message?.liveLocationMessage?.degreesLatitude} - Longitude: ${msg.message?.liveLocationMessage?.degreesLongitude}`,
      documentMessage: msg.message?.documentMessage?.caption,
      audioMessage: "Audio",
      listMessage:
        getBodyButton(msg) || msg.message?.listResponseMessage?.title,
      viewOnceMessage: getBodyButton(msg) || (() => {
        try {
          const vom = msg.message?.viewOnceMessage?.message;
          if (vom?.interactiveMessage?.body?.text) return vom.interactiveMessage.body.text;
          if (vom?.imageMessage?.caption) return vom.imageMessage.caption;
          if (vom?.videoMessage?.caption) return vom.videoMessage.caption;
          return null;
        } catch { return null; }
      })(),
      reactionMessage: msg.message?.reactionMessage?.text || "reaction",
      senderKeyDistributionMessage:
        msg?.message?.senderKeyDistributionMessage
          ?.axolotlSenderKeyDistributionMessage,
      documentWithCaptionMessage:
        msg.message?.documentWithCaptionMessage?.message?.documentMessage
          ?.caption,
      viewOnceMessageV2:
        msg.message?.viewOnceMessageV2?.message?.imageMessage?.caption,
      adMetaPreview: msgAdMetaPreview(
        msg.message?.extendedTextMessage?.contextInfo?.externalAdReply?.thumbnail,
        msg.message?.extendedTextMessage?.contextInfo?.externalAdReply?.title,
        msg.message?.extendedTextMessage?.contextInfo?.externalAdReply?.body,
        msg.message?.extendedTextMessage?.contextInfo?.externalAdReply?.sourceUrl,
        msg.message?.extendedTextMessage?.text
      ),
      editedMessage:
        msg?.message?.protocolMessage?.editedMessage?.conversation ||
        msg?.message?.editedMessage?.message?.protocolMessage?.editedMessage
          ?.conversation,
      ephemeralMessage:
        msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text,
      imageWhitCaptionMessage:
        msg?.message?.ephemeralMessage?.message?.imageMessage,
      highlyStructuredMessage: msg.message?.highlyStructuredMessage,
      protocolMessage:
        msg?.message?.protocolMessage?.editedMessage?.conversation,
      advertising:
        getAd(msg) ||
        msg.message?.listResponseMessage?.contextInfo?.externalAdReply?.title,
      // ✅ Suporte a resposta de botões interativos (nativeFlowMessage)
      interactiveResponseMessage: (() => {
        try {
          const irm = (msg.message as any)?.interactiveResponseMessage;
          if (irm?.nativeFlowResponseMessage?.paramsJson) {
            const params = JSON.parse(irm.nativeFlowResponseMessage.paramsJson);
            // Preferir o texto exibido (rótulo do botão) ao invés do id numérico
            return (
              params?.display_text ||
              params?.title ||
              params?.selectedDisplayText ||
              irm?.body?.text ||
              params?.id ||
              ""
            );
          }
          return irm?.body?.text || "";
        } catch { return ""; }
      })(),
      pollUpdateMessage: "Voto em enquete",
      pollCreationMessage: msg.message?.pollCreationMessage?.name || "📊 Enquete",
    };

    const objKey = Object.keys(types).find(key => key === type);

    if (!objKey) {
      logger.warn(
        `#### Nao achou o type 152: ${type} ${JSON.stringify(msg.message)}`
      );
      Sentry.setExtra("Mensagem", { BodyMsg: msg.message, msg, type });
      Sentry.captureException(
        new Error("Novo Tipo de Mensagem em getTypeMessage")
      );
    }
    return types[type];
  } catch (error) {
    Sentry.setExtra("Error getTypeMessage", { msg, BodyMsg: msg?.message });
    Sentry.captureException(error);
  }
};

const msgAdMetaPreview = (image, title, body, sourceUrl, messageUser) => {
  if (image) {
    var b64 = Buffer.from(image).toString("base64");
    let data = `data:image/png;base64, ${b64} | ${sourceUrl} | ${title} | ${body} | ${messageUser}`;
    return data;
  }
};

export const getQuotedMessage = (msg: proto.IWebMessageInfo) => {
  const body = extractMessageContent(msg.message)[
    Object.keys(msg?.message).values().next().value
  ];

  if (!body?.contextInfo?.quotedMessage) return;
  const quoted = extractMessageContent(
    body?.contextInfo?.quotedMessage[
    Object.keys(body?.contextInfo?.quotedMessage).values().next().value
    ]
  );

  return quoted;
};

export const getQuotedMessageId = (msg: proto.IWebMessageInfo) => {
  const body = extractMessageContent(msg.message)[
    Object.keys(msg?.message).values().next().value
  ];
  let reaction = msg?.message?.reactionMessage
    ? msg?.message?.reactionMessage?.key?.id
    : "";

  return reaction ? reaction : body?.contextInfo?.stanzaId;
};

const getMeSocket = (wbot: Session): IMe => {
  return {
    id: jidNormalizedUser((wbot as WASocket).user.id),
    name: (wbot as WASocket).user.name
  };
};

const getSenderMessage = (
  msg: proto.IWebMessageInfo,
  wbot: Session
): string => {
  const me = getMeSocket(wbot);
  if (msg.key.fromMe) return me.id;

  const key: IExtendedMessageKey = msg.key;
  const senderId =
    key.participant_pn || msg.participant || key.participant || key.remoteJid || undefined;

  return senderId && jidNormalizedUser(senderId);
};

const normalizeContactIdentifier = (msg: proto.IWebMessageInfo): string => {
  const key: IExtendedMessageKey = msg.key;
  return normalizeJid(key.sender_lid || msg.key.remoteJid);
};

const getContactMessage = async (msg: proto.IWebMessageInfo, wbot: Session): Promise<IMe> => {
  return getContactMessageHandler(msg, wbot);
};

function findCaption(obj) {
  if (typeof obj !== "object" || obj === null) {
    return null;
  }

  for (const key in obj) {
    if (key === "caption" || key === "text" || key === "conversation") {
      return obj[key];
    }

    const result = findCaption(obj[key]);
    if (result) {
      return result;
    }
  }

  return null;
}

const allowedMimeTypes = [
  "text/plain",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/postscript",
  "application/x-zip-compressed",
  "application/zip",
  "application/octet-stream",
  "application/x-mtx",
  "application/x-aud",
  "application/x-rul",
  "application/x-exp",
  "application/x-plt",
  "application/x-mdl",
  "image/vnd.adobe.photoshop",
  "application/x-photoshop",
  "image/x-photoshop",
  "application/vnd.corel-draw",
  "application/illustrator",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.ms-word.document.macroEnabled.12",
  "application/x-msdownload",
  "application/x-executable",
  "application/x-ret"
];

const downloadMedia = async (
  msg: proto.IWebMessageInfo,
  isImported: Date = null,
  wbot: Session
) => {
  const mineType =
    msg.message?.imageMessage ||
    msg.message?.audioMessage ||
    msg.message?.videoMessage ||
    msg.message?.stickerMessage ||
    msg.message?.ephemeralMessage?.message?.stickerMessage ||
    msg.message?.documentMessage ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
    msg.message?.ephemeralMessage?.message?.audioMessage ||
    msg.message?.ephemeralMessage?.message?.documentMessage ||
    msg.message?.ephemeralMessage?.message?.videoMessage ||
    msg.message?.ephemeralMessage?.message?.imageMessage ||
    msg.message?.viewOnceMessage?.message?.imageMessage ||
    msg.message?.viewOnceMessage?.message?.videoMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.imageMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.videoMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.audioMessage ||
    msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
      ?.documentMessage ||
    msg.message?.templateMessage?.hydratedTemplate?.imageMessage ||
    msg.message?.templateMessage?.hydratedTemplate?.documentMessage ||
    msg.message?.templateMessage?.hydratedTemplate?.videoMessage ||
    msg.message?.templateMessage?.hydratedFourRowTemplate?.imageMessage ||
    msg.message?.templateMessage?.hydratedFourRowTemplate?.documentMessage ||
    msg.message?.templateMessage?.hydratedFourRowTemplate?.videoMessage ||
    msg.message?.templateMessage?.fourRowTemplate?.imageMessage ||
    msg.message?.templateMessage?.fourRowTemplate?.documentMessage ||
    msg.message?.templateMessage?.fourRowTemplate?.videoMessage ||
    msg.message?.interactiveMessage?.header?.imageMessage ||
    msg.message?.interactiveMessage?.header?.documentMessage ||
    msg.message?.interactiveMessage?.header?.videoMessage;

  let filename =
    msg.message?.documentMessage?.fileName ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage
      ?.fileName ||
    msg.message?.extendedTextMessage?.text ||
    "";

  if (!filename && msg.message?.documentMessage?.title) {
    filename = msg.message.documentMessage.title;
  }

  // Se for um documento e tiver extensão, verifica se é permitido
  // ✅ CORRIGIDO: Para mensagens do bot (fromMe=true), ser mais permissivo
  if (msg.message?.documentMessage && filename) {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    
    // Se não tem extensão no filename, tentar usar mimetype do documento
    if (!ext && msg.message.documentMessage.mimetype) {
      const mimeType = msg.message.documentMessage.mimetype;
      // Se o mimetype é válido (está na lista permitida), permitir
      const isValidMimeType = allowedMimeTypes.includes(mimeType);
      if (isValidMimeType) {
        // Permitir se mimetype é válido, mesmo sem extensão no filename
        // O filename será gerado depois baseado no mimetype
      } else if (msg.key.fromMe) {
        // ✅ Para mensagens do bot, ser mais permissivo
        // Se foi enviado pelo bot, provavelmente é válido
        logger.info(`[DOWNLOAD MEDIA] Mensagem do bot sem extensão válida, mas permitindo (mimetype: ${mimeType})`);
      } else {
        throw new Error("Invalid file type");
      }
    } else if (ext) {
      const isAllowedExt = [
        "mtx",
        "aud",
        "rul",
        "exp",
        "zip",
        "plt",
        "mdl",
        "pdf",
        "psd",
        "cdr",
        "ai",
        "xls",
        "xlsx",
        "xlsm",
        "doc",
        "docx",
        "docm",
        "txt",
        // Novos formatos
        "odt",
        "ods",
        "odp",
        "odg",
        "xml",
        "ofx",
        "rtf",
        "csv",
        "html",
        "json",
        "rar",
        "7z",
        "tar",
        "gz",
        "bz2",
        "msg",
        "key",
        "numbers",
        "pages",
        "ppt",
        "pptx",
        // Executáveis e arquivos compactados
        "exe",
        // Imagens como documento
        "png",
        "jpg",
        "jpeg",
        "gif",
        "bmp",
        "webp",
        "dwg",
        "pfx",
        "p12",
        "ret"
      ].includes(ext);

      if (!isAllowedExt) {
        // ✅ Para mensagens do bot, verificar mimetype antes de rejeitar
        if (msg.key.fromMe && msg.message.documentMessage.mimetype) {
          const mimeType = msg.message.documentMessage.mimetype;
          const isValidMimeType = allowedMimeTypes.includes(mimeType);
          if (isValidMimeType) {
            logger.info(`[DOWNLOAD MEDIA] Mensagem do bot com extensão não permitida (${ext}), mas mimetype válido (${mimeType}) - permitindo`);
          } else {
            throw new Error("Invalid file type");
          }
        } else {
          throw new Error("Invalid file type");
        }
      }
    }
  }

  if (!filename) {
    const mimeToExt = {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "docx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "xlsx",
      "application/vnd.ms-excel": "xls",
      "application/msword": "doc",
      "application/pdf": "pdf",
      "text/plain": "txt",
      "image/vnd.adobe.photoshop": "psd",
      "application/x-photoshop": "psd",
      "application/photoshop": "psd",
      "application/psd": "psd",
      "image/psd": "psd",
      "application/vnd.oasis.opendocument.text": "odt",
      "application/vnd.oasis.opendocument.spreadsheet": "ods",
      "application/vnd.oasis.opendocument.presentation": "odp",
      "application/vnd.oasis.opendocument.graphics": "odg",
      "application/xml": "xml",
      "text/xml": "xml",
      "application/ofx": "ofx",
      "application/vnd.ms-powerpoint": "ppt",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "pptx",
      "application/rtf": "rtf",
      "text/csv": "csv",
      "text/html": "html",
      "application/json": "json",
      "application/zip": "zip",
      "application/x-rar-compressed": "rar",
      "application/x-7z-compressed": "7z",
      "application/x-tar": "tar",
      "application/gzip": "gz",
      "application/x-bzip2": "bz2",
      "application/vnd.ms-outlook": "msg",
      "application/vnd.apple.keynote": "key",
      "application/vnd.apple.numbers": "numbers",
      "application/vnd.apple.pages": "pages",
      "application/x-msdownload": "exe",
      "application/x-executable": "exe",
      "application/acad": "dwg",
      "image/vnd.dwg": "dwg",
      "application/dwg": "dwg",
      "application/x-dwg": "dwg",
      "image/x-dwg": "dwg",
      "application/x-pkcs12": "pfx",
      "application/pkcs-12": "pfx",
      "application/pkcs12": "pfx",
      "application/x-pkcs-12": "pfx",
      "application/pfx": "pfx"
    };

    const ext =
      mimeToExt[mineType.mimetype] ||
      mineType.mimetype.split("/")[1].split(";")[0];
    const shortId = String(new Date().getTime()).slice(-4);
    filename = `file_${shortId}.${ext}`;
  } else {
    const ext = filename.split(".").pop();
    const name = filename
      .split(".")
      .slice(0, -1)
      .join(".")
      .replace(/\s/g, "_")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const sanitizedName = `${name.trim()}.${ext}`;
    const folder = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "public",
      `company${msg.key.remoteJid?.split("@")[0]}`
    );

    if (fs.existsSync(path.join(folder, sanitizedName))) {
      let counter = 1;
      let newName = `${name.trim()}_${counter}.${ext}`;

      while (fs.existsSync(path.join(folder, newName)) && counter < 100) {
        counter++;
        newName = `${name.trim()}_${counter}.${ext}`;
      }

      filename = newName;
    } else {
      filename = sanitizedName;
    }
  }

  if (msg.message?.stickerMessage) {
    const urlAnt = "https://web.whatsapp.net";
    const directPath = msg.message?.stickerMessage?.directPath;
    const newUrl = "https://mmg.whatsapp.net";
    const final = newUrl + directPath;
    if (msg.message?.stickerMessage?.url?.includes(urlAnt)) {
      msg.message.stickerMessage.url = msg.message?.stickerMessage.url.replace(
        urlAnt,
        final
      );
    }
  }

  let buffer;
  try {
    buffer = await downloadMediaMessage(
      msg as any,
      "buffer",
      {},
      {
        logger,
        reuploadRequest: wbot.updateMediaMessage
      }
    );
  } catch (err) {
    if (isImported) {
      flowDebug(
        "Falha ao fazer o download de uma mensagem importada, provavelmente a mensagem já não esta mais disponível"
      );
    } else {
      console.error("Erro ao baixar mídia:", err);
    }
  }

  const media = {
    data: buffer,
    mimetype: mineType.mimetype,
    filename
  };

  return media;
};

const checkLIDStatus = async (wbot: Session): Promise<boolean> => {
  try {
    const isLIDEnabled = wbot.user?.lid;
    return !!isLIDEnabled;
  } catch (error) {
    return false;
  }
};

const verifyQuotedMessage = async (
  msg: proto.IWebMessageInfo
): Promise<Message | null> => {
  if (!msg) return null;
  const quoted = getQuotedMessageId(msg);

  if (!quoted) return null;

  const quotedMsg = await Message.findOne({
    where: { wid: quoted }
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};

export const verifyMediaMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking,
  isForwarded: boolean = false,
  isPrivate: boolean = false,
  wbot: Session
): Promise<Message> => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const companyId = ticket.companyId;

  try {
    // ✅ CORRIGIDO: Para mensagens do bot (fromMe=true), tratar erro de download de forma mais elegante
    let media;
    try {
      media = await downloadMedia(msg, ticket?.imported, wbot);
    } catch (downloadError: any) {
      // Se for mensagem do bot e erro de tipo de arquivo, tentar continuar sem download
      if (msg.key.fromMe && downloadError.message === "Invalid file type") {
        logger.warn(`[VERIFY MEDIA] Erro ao baixar mídia do bot (tipo inválido), mas continuando processamento: ${downloadError.message}`);
        // Para mensagens do bot, podemos criar a mensagem sem baixar a mídia novamente
        // já que ela foi enviada pelo próprio sistema
        media = null;
      } else {
        // Re-lançar erro se não for do bot ou se for outro tipo de erro
        throw downloadError;
      }
    }

    if (!media && ticket.imported) {
      const body =
        "*System:* \nFalha no download da mídia verifique no dispositivo";
      const messageData = {
        //mensagem de texto
        wid: msg.key.id,
        ticketId: ticket.id,
        contactId: msg.key.fromMe ? undefined : ticket.contactId,
        body,
        reactionMessage: msg.message?.reactionMessage,
        fromMe: msg.key.fromMe,
        mediaType: getTypeMessage(msg),
        read: msg.key.fromMe,
        quotedMsgId: quotedMsg?.id || msg.message?.reactionMessage?.key?.id,
        ack: msg.status,
        companyId: companyId,
        remoteJid: msg.key.remoteJid,
        participant: msg.key.participant,
        timestamp: getTimestampMessage(msg.messageTimestamp),
        createdAt: new Date(
          Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
        ).toISOString(),
        dataJson: JSON.stringify(msg),
        ticketImported: ticket.imported,
        isForwarded,
        isPrivate
      };

      await ticket.update({
        lastMessage: body || getMediaDescription(getTypeMessage(msg))
      });
      logger.error(Error("ERR_WAPP_DOWNLOAD_MEDIA"));
      return CreateMessageService({ messageData, companyId: companyId });
    }

    // ✅ CORRIGIDO: Para mensagens do bot sem mídia baixada, criar mensagem usando dados do msg
    if (!media) {
      // Se for mensagem do bot e não conseguiu baixar mídia, criar mensagem usando dados do documento
      if (msg.key.fromMe && msg.message?.documentMessage) {
        const docMessage = msg.message.documentMessage;
        let filename = docMessage.fileName || docMessage.title || "documento";
        
        // ✅ CORRIGIDO: Extrair apenas o nome do arquivo do caminho completo
        // Remove caminho completo e mantém apenas o nome do arquivo
        if (filename.includes("/") || filename.includes("\\")) {
          // Suporta tanto / quanto \ como separadores
          const pathParts = filename.split("/").pop()?.split("\\").pop();
          filename = pathParts || filename;
        }
        
        const mimetype = docMessage.mimetype || "application/octet-stream";
        
        logger.info(`[VERIFY MEDIA] Criando mensagem do bot sem download de mídia - filename: ${filename}, mimetype: ${mimetype}`);
        
        const body = getBodyMessage(msg) || filename;
        
        const messageData = {
          wid: msg.key.id,
          ticketId: ticket.id,
          contactId: undefined, // Mensagem do bot não tem contactId
          body: body,
          fromMe: true,
          read: true,
          mediaUrl: filename,
          mediaType: getMediaTypeFromMimeType(mimetype),
          quotedMsgId: quotedMsg?.id,
          ack: Number(String(msg.status).replace("PENDING", "2").replace("NaN", "1")) || 2,
          remoteJid: msg.key.remoteJid,
          participant: msg.key.participant,
          dataJson: JSON.stringify(msg),
          ticketTrakingId: ticketTraking?.id,
          createdAt: new Date(
            Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
          ).toISOString(),
          ticketImported: ticket.imported,
          isForwarded,
          isPrivate
        };

        await ticket.update({
          lastMessage: body || getMediaDescription(getTypeMessage(msg)) || filename
        });

        return CreateMessageService({
          messageData,
          companyId: companyId
        });
      }
      
      throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
    }

    // if (!media.filename || media.mimetype === "audio/mp4") {
    //   const ext = media.mimetype === "audio/mp4" ? "m4a" : media.mimetype.split("/")[1].split(";")[0];
    //   media.filename = `${new Date().getTime()}.${ext}`;
    // } else {
    //   // ext = tudo depois do ultimo .
    //   const ext = media.filename.split(".").pop();
    //   // name = tudo antes do ultimo .
    //   const name = media.filename.split(".").slice(0, -1).join(".").replace(/\s/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    //   media.filename = `${name.trim()}_${new Date().getTime()}.${ext}`;
    // }
    if (!media.filename) {
      const ext = media.mimetype.split("/")[1].split(";")[0];
      media.filename = `${new Date().getTime()}.${ext}`;
    } else {
      // Preserva o nome original do arquivo, apenas sanitizando caracteres especiais
      const ext = media.filename.split(".").pop();
      const name = media.filename
        .split(".")
        .slice(0, -1)
        .join(".")
        .replace(/\s/g, "_")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      // Verifica se já existe um arquivo com o mesmo nome
      const folder = path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "public",
        `company${companyId}`
      );
      const sanitizedName = `${name.trim()}.${ext}`;

      if (fs.existsSync(path.join(folder, sanitizedName))) {
        // Se já existe um arquivo com o mesmo nome, adiciona timestamp
        media.filename = `${name.trim()}_${new Date().getTime()}.${ext}`;
      } else {
        // Se não existe, mantém o nome original sanitizado
        media.filename = sanitizedName;
      }
    }

    try {
      const folder = path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "public",
        `company${companyId}`
      );

      // const folder = `public/company${companyId}`; // Correção adicionada por Altemir 16-08-2023
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true }); // Correção adicionada por Altemir 16-08-2023
        fs.chmodSync(folder, 0o777);
      }

      // Dedup por conteúdo: o mesmo vídeo/áudio recebido N vezes passa a
      // ocupar espaço UMA vez (hardlink), mantendo um nome por mensagem.
      await writeMediaDeduped(folder, media.filename, Buffer.from(media.data))
        .then(() => {
          if (media.mimetype.includes("audio")) {
            const inputFile = path.join(folder, media.filename);
            if (!inputFile.endsWith(".mpeg") && !inputFile.endsWith(".ogg")) {
              // Trate outros formatos de arquivo conforme necessário
              //console.error("Formato de arquivo não suportado:", inputFile);
              return;
            }

            // ✅ Antes gerava o .mp3 irmão com um ffmpeg().toFormat("mp3") cru,
            // sem escrever o cabeçalho Xing/LAME nem fixar sample rate/canal —
            // o Safari/iOS (que É pra quem esse .mp3 existe, ver getAudioSource
            // em AudioModalCustom) depende desse cabeçalho pra calcular a
            // duração de um MP3 VBR; sem ele o áudio toca normalmente mas a
            // duração mostrada fica "0:00" ou errada (era exatamente o "áudio
            // no iPhone sai zerado" relatado). convertToMp3Sibling já resolve
            // isso pro lado de ENVIO (SendWhatsAppMedia.ts) — reaproveitamos
            // aqui pro lado de RECEBIMENTO, que nunca tinha sido corrigido.
            return convertToMp3Sibling(inputFile)
              .then(() => {})
              .catch((err: any) => {
                logger.warn(`[verifyMediaMessage] falha ao gerar mp3 irmão do áudio recebido: ${err?.message}`);
              });
          }
        });
      // .then(() => {
      //   //console.log("Conversão concluída!");
      //   // Aqui você pode fazer o que desejar com o arquivo MP3 convertido.
      // })
    } catch (err) {
      Sentry.setExtra("Erro media", {
        companyId: companyId,
        ticket,
        contact,
        media,
        quotedMsg
      });
      Sentry.captureException(err);
      logger.error(err);
    }

    const body = getBodyMessage(msg);

    // ✅ CORRIGIDO: Extrair apenas o nome do arquivo do caminho completo
    let mediaFilename = media.filename;
    if (mediaFilename && (mediaFilename.includes("/") || mediaFilename.includes("\\"))) {
      // Suporta tanto / quanto \ como separadores
      const pathParts = mediaFilename.split("/").pop()?.split("\\").pop();
      mediaFilename = pathParts || mediaFilename;
    }

    const messageData = {
      wid: msg.key.id,
      ticketId: ticket.id,
      contactId: msg.key.fromMe ? undefined : contact.id,
      body: body || mediaFilename,
      fromMe: msg.key.fromMe,
      read: msg.key.fromMe,
      mediaUrl: mediaFilename,
      mediaType: getMediaTypeFromMimeType(media.mimetype),
      quotedMsgId: quotedMsg?.id,
      ack:
        Number(
          String(msg.status).replace("PENDING", "2").replace("NaN", "1")
        ) || 2,
      remoteJid: msg.key.remoteJid,
      participant: msg.key.participant,
      dataJson: JSON.stringify(msg),
      ticketTrakingId: ticketTraking?.id,
      createdAt: new Date(
        Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
      ).toISOString(),
      ticketImported: ticket.imported,
      isForwarded,
      isPrivate
    };

    await ticket.update({
      lastMessage: body || getMediaDescription(getTypeMessage(msg)) || mediaFilename
    });

    const newMessage = await CreateMessageService({
      messageData,
      companyId: companyId
    });

    if (!msg.key.fromMe && ticket.status === "closed") {
      await ticket.update({ status: ticket.isGroup ? "group" : "pending" });
      await ticket.reload({
        attributes: [
          "id",
          "uuid",
          "queueId",
          "isGroup",
          "channel",
          "status",
          "contactId",
          "useIntegration",
          "lastMessage",
          "updatedAt",
          "unreadMessages",
          "companyId",
          "whatsappId",
          "imported",
          "lgpdAcceptedAt",
          "amountUsedBotQueues",
          "useIntegration",
          "integrationId",
          "userId",
          "amountUsedBotQueuesNPS",
          "lgpdSendMessageAt",
          "isBot"
        ],
        include: [
          { model: Queue, as: "queue" },
          { model: User, as: "user" },
          { model: Contact, as: "contact" },
          { model: Whatsapp, as: "whatsapp" }
        ]
      });

      io.of(String(companyId))
        // .to("closed")
        .emit(`company-${companyId}-ticket`, {
          action: "delete",
          ticket,
          ticketId: ticket.id
        });
      io.of(String(companyId))
        // .to(ticket.status)
        //   .to(ticket.id.toString())
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket,
          ticketId: ticket.id
        });
    }

    return newMessage;
  } catch (error) {
    logger.warn("Erro ao baixar media: ", JSON.stringify(msg));
  }
};

export const verifyMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  ticketTraking?: TicketTraking,
  isPrivate?: boolean,
  isForwarded: boolean = false
) => {
  const io = getIO();
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = getBodyMessage(msg);
  const companyId = ticket.companyId;

  const messageData = {
    wid: msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body,
    fromMe: msg.key.fromMe,
    mediaType: getTypeMessage(msg),
    read: msg.key.fromMe,
    quotedMsgId: quotedMsg?.id,
    ack:
      Number(String(msg.status).replace("PENDING", "2").replace("NaN", "1")) ||
      2,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: JSON.stringify(msg),
    ticketTrakingId: ticketTraking?.id,
    isPrivate,
    createdAt: new Date(
      Math.floor(getTimestampMessage(msg.messageTimestamp) * 1000)
    ).toISOString(),
    ticketImported: ticket.imported,
    isForwarded
  };

  await ticket.update({
    lastMessage: body || getMediaDescription(getTypeMessage(msg))
  });

  await CreateMessageService({ messageData, companyId: companyId });

  // Verificar e cancelar Floups se contato enviou mensagem e condições de parada estão ativas
  if (!msg.key.fromMe && contact?.id) {
    try {
      const FloupService = (await import('../../plugins/floup/service')).default;
      await FloupService.verificarECancelarFloupsAoReceberMensagem(
        ticket.id,
        contact.id,
        companyId,
        body
      );
    } catch (floupError) {
      // Log mas não interrompe o fluxo se houver erro na verificação de Floup
      logger.warn(`[FLOUP] Erro ao verificar condições de parada:`, floupError);
    }
  }

  // Disparar Floups por "primeira interação do cliente" quando for a 1ª mensagem do contato no ticket
  if (!msg.key.fromMe && contact?.id && ticket?.id) {
    try {
      const inboundCount = await Message.count({
        where: { ticketId: ticket.id, fromMe: false }
      });
      if (inboundCount <= 1) {
        const FloupService = (await import('../../plugins/floup/service')).default;
        await FloupService.verificarEIniciarFloupsPorInteracao(
          contact.id,
          companyId,
          ticket.id,
          'firstClientInteraction'
        );
      }
    } catch (floupError) {
      logger.warn(`[FLOUP] Erro ao iniciar Floup por primeira interação:`, floupError);
    }
  }

  // Disparar Floups por "primeira interação do atendente" quando for a 1ª mensagem fromMe do ticket (não automática)
  if (msg.key.fromMe && contact?.id && ticket?.id && !ticket.isGroup) {
    try {
      const outboundCount = await Message.count({
        where: { ticketId: ticket.id, fromMe: true }
      });
      if (outboundCount <= 1) {
        const FloupService = (await import('../../plugins/floup/service')).default;
        await FloupService.verificarEIniciarFloupsPorInteracao(
          contact.id,
          companyId,
          ticket.id,
          'firstAttendantInteraction'
        );
      }
    } catch (floupError) {
      logger.warn(`[FLOUP] Erro ao iniciar Floup por interação do atendente:`, floupError);
    }
  }


  if (!msg.key.fromMe && ticket.status === "closed") {
    await ticket.update({ status: ticket.isGroup ? "group" : "pending" });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" },
        { model: Whatsapp, as: "whatsapp" }
      ]
    });

    // io.to("closed").emit(`company-${companyId}-ticket`, {
    //   action: "delete",
    //   ticket,
    //   ticketId: ticket.id
    // });

    if (!ticket.imported) {
      io.of(String(companyId))
        // .to(ticket.status)
        // .to(ticket.id.toString())
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket,
          ticketId: ticket.id
        });
    }
  }
};

const isValidMsg = (msg: proto.IWebMessageInfo): boolean => {
  if (msg.key.remoteJid === "status@broadcast") return false;

  try {
    const message = (msg.message as any) || {};
    const nestedMessage =
      message.viewOnceMessage?.message ||
      message.viewOnceMessageV2?.message ||
      message.ephemeralMessage?.message?.viewOnceMessage?.message ||
      message.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
      message.ephemeralMessage?.message ||
      {};

    const hasInteractiveReplyShape = !!(
      message.templateButtonReplyMessage ||
      message.interactiveResponseMessage ||
      message.buttonsResponseMessage ||
      message.listResponseMessage ||
      nestedMessage.templateButtonReplyMessage ||
      nestedMessage.interactiveResponseMessage ||
      nestedMessage.buttonsResponseMessage ||
      nestedMessage.listResponseMessage
    );

    if (hasInteractiveReplyShape) {
      return true;
    }

    const safeRawMessage = (() => {
      try {
        return JSON.stringify(message || {});
      } catch {
        return "";
      }
    })();

    if (
      /templateButtonReplyMessage|interactiveResponseMessage|buttonsResponseMessage|listResponseMessage/i.test(
        safeRawMessage
      )
    ) {
      return true;
    }

    const msgType = getTypeMessage(msg);
    const normalizedMsgType = String(msgType || "")
      .replace(/[^\w]/g, "")
      .trim();
    const normalizedMsgTypeLower = normalizedMsgType.toLowerCase();

    if (!normalizedMsgTypeLower) {
      return false;
    }

    if (
      normalizedMsgTypeLower.includes("templatebuttonreplymessage") ||
      normalizedMsgTypeLower.includes("interactiveresponsemessage") ||
      normalizedMsgTypeLower.includes("buttonsresponsemessage") ||
      normalizedMsgTypeLower.includes("listresponsemessage")
    ) {
      return true;
    }

    const validTypes = new Set([
      "conversation",
      "extendedtextmessage",
      "audiomessage",
      "videomessage",
      "ptvmessage",
      "imagemessage",
      "documentmessage",
      "stickermessage",
      "buttonsresponsemessage",
      "buttonsmessage",
      "messagecontextinfo",
      "locationmessage",
      "livelocationmessage",
      "contactmessage",
      "voicemessage",
      "mediamessage",
      "contactsarraymessage",
      "reactionmessage",
      "ephemeralmessage",
      "protocolmessage",
      "listresponsemessage",
      "listmessage",
      "interactivemessage",
      "pollcreationmessagev3",
      "viewoncemessage",
      "documentwithcaptionmessage",
      "viewoncemessagev2",
      "editedmessage",
      "advertisingmessage",
      "highlystructuredmessage",
      "eventmessage",
      "admetapreview",
      "interactiveresponsemessage",
      "pollupdatemessage",
      "pollcreationmessage",
      "templatebuttonreplymessage"
    ]);

    const ifType = validTypes.has(normalizedMsgTypeLower);

    if (!ifType) {
      logger.warn(`#### Nao achou o type em isValidMsg: ${normalizedMsgTypeLower}\n${JSON.stringify(msg?.message)}`);
      Sentry.setExtra("Mensagem", {
        BodyMsg: msg.message,
        msg,
        msgType: normalizedMsgType,
        msgTypeLower: normalizedMsgTypeLower,
        msgKeys: Object.keys(message || {})
      });
      Sentry.captureException(new Error("Novo Tipo de Mensagem em isValidMsg"));
    }

    return ifType;
  } catch (error) {
    Sentry.setExtra("Error isValidMsg", { msg });
    Sentry.captureException(error);
    return false;
  }
};

const sendDialogflowAwswer = async (
  wbot: Session,
  ticket: Ticket,
  msg: WAMessage,
  contact: Contact,
  inputAudio: string | undefined,
  companyId: number,
  queueIntegration: QueueIntegrations
) => {
  const session = await createDialogflowSessionWithModel(queueIntegration);

  if (session === undefined) {
    return;
  }

  wbot.presenceSubscribe(contact.remoteJid);
  await delay(500);

  let dialogFlowReply = await queryDialogFlow(
    session,
    queueIntegration.projectName,
    contact.remoteJid,
    getBodyMessage(msg),
    queueIntegration.language,
    inputAudio
  );

  if (!dialogFlowReply) {
    wbot.sendPresenceUpdate("composing", contact.remoteJid);

    const bodyDuvida = formatBody(
      `\u200e *${queueIntegration?.name}:* Não consegui entender sua dúvida.`
    );

    await delay(1000);

    await wbot.sendPresenceUpdate("paused", contact.remoteJid);

    const sentMessage = await wbot.sendMessage(getJidOf(ticket.contact), {
      text: bodyDuvida
    });

    wbot.store(sentMessage);

    await verifyMessage(sentMessage, ticket, contact);
    return;
  }

  if (dialogFlowReply.endConversation) {
    await ticket.update({
      contactId: ticket.contact.id,
      useIntegration: false
    });
  }

  const image = dialogFlowReply.parameters.image?.stringValue ?? undefined;

  const react = dialogFlowReply.parameters.react?.stringValue ?? undefined;

  const audio = dialogFlowReply.encodedAudio.toString("base64") ?? undefined;

  wbot.sendPresenceUpdate("composing", contact.remoteJid);
  await delay(500);

  let lastMessage;

  for (let message of dialogFlowReply.responses) {
    lastMessage = message.text.text[0] ? message.text.text[0] : lastMessage;
  }
  for (let message of dialogFlowReply.responses) {
    if (message.text) {
      await sendDelayedMessages(
        wbot,
        ticket,
        contact,
        message.text.text[0],
        lastMessage,
        audio,
        queueIntegration
      );
    }
  }
};

async function sendDelayedMessages(
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  message: string,
  lastMessage: string,
  audio: string | undefined,
  queueIntegration: QueueIntegrations
) {
  const companyId = ticket.companyId;
  if (!wbot.id) { logger.warn("[WBOT] wbot.id nulo em sendDelayedMessages, usando ticket.whatsappId"); }
  const whatsapp = await ShowWhatsAppService(wbot.id || ticket.whatsappId, companyId);
  const farewellMessage = whatsapp.farewellMessage.replace(/[_*]/g, "");

  // if (react) {
  //   const test =
  //     /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g.test(
  //       react
  //     );
  //   if (test) {
  //     msg.react(react);
  //     await delay(1000);
  //   }
  // }
  const sentMessage = await wbot.sendMessage(`${contact.number}@c.us`, {
    text: `\u200e *${queueIntegration?.name}:* ` + message
  });

  wbot.store(sentMessage);

  await verifyMessage(sentMessage, ticket, contact);
  if (message != lastMessage) {
    await delay(500);
    wbot.sendPresenceUpdate("composing", contact.remoteJid);
  } else if (audio) {
    wbot.sendPresenceUpdate("recording", contact.remoteJid);
    await delay(500);

    // if (audio && message === lastMessage) {
    //   const newMedia = new MessageMedia("audio/ogg", audio);

    //   const sentMessage = await wbot.sendMessage(
    //     `${contact.number}@c.us`,
    //     newMedia,
    //     {
    //       sendAudioAsVoice: true
    //     }
    //   );

    //   await verifyMessage(sentMessage, ticket, contact);
    // }

    // if (sendImage && message === lastMessage) {
    //   const newMedia = await MessageMedia.fromUrl(sendImage, {
    //     unsafeMime: true
    //   });
    //   const sentMessage = await wbot.sendMessage(
    //     `${contact.number}@c.us`,
    //     newMedia,
    //     {
    //       sendAudioAsVoice: true
    //     }
    //   );

    //   await verifyMessage(sentMessage, ticket, contact);
    //   await ticket.update({ lastMessage: "📷 Foto" });
    // }

    if (farewellMessage && message.includes(farewellMessage)) {
      await delay(1000);
      setTimeout(async () => {
        await ticket.update({
          contactId: ticket.contact.id,
          useIntegration: true
        });
        await UpdateTicketService({
          ticketId: ticket.id,
          ticketData: { status: "closed" },
          companyId: companyId
        });
      }, 3000);
    }
  }
}

const verifyQueue = async (
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  settings?: any,
  ticketTraking?: TicketTraking
) => {
  const companyId = ticket.companyId;

  const {
    queues,
    greetingMessage,
    maxUseBotQueues,
    timeUseBotQueues,
    complationMessage
  } = await ShowWhatsAppService(wbot.id || ticket.whatsappId, companyId);

  let chatbot = false;

  if (queues.length === 1) {
    chatbot = queues[0]?.chatbots.length > 1;
  }

  const enableQueuePosition = settings.sendQueuePosition === "enabled";

  if (queues.length === 1 && !chatbot) {
    const sendGreetingMessageOneQueues =
      settings.sendGreetingMessageOneQueues === "enabled" || false;

    //inicia integração dialogflow/n8n
    if (!msg.key.fromMe && !ticket.isGroup && queues[0].integrationId) {
      const integrations = await ShowQueueIntegrationService(
        queues[0].integrationId,
        companyId
      );

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        integrations,
        ticket
      );

      if (msg.key.fromMe) {
        await ticket.update({
          typebotSessionTime: moment().toDate(),
          useIntegration: true,
          integrationId: integrations.id
        });
      } else {
        await ticket.update({
          useIntegration: true,
          integrationId: integrations.id
        });
      }

      // return;
    }

    if (greetingMessage && greetingMessage.trim().length > 1 && sendGreetingMessageOneQueues) {
      const body = formatBody(`${greetingMessage}`, ticket, { queue: queues[0].name });

      if (ticket.whatsapp.greetingMediaAttachment !== null) {
        const filePath = path.resolve(
          "public",
          `company${companyId}`,
          ticket.whatsapp.greetingMediaAttachment
        );

        const fileExists = fs.existsSync(filePath);

        if (fileExists) {
          const messagePath = ticket.whatsapp.greetingMediaAttachment;
          const optionsMsg = await getMessageOptions(
            messagePath,
            filePath,
            String(companyId),
            body
          );
          const debouncedSentgreetingMediaAttachment = debounce(
            async () => {
              const sentMessage = await wbot.sendMessage(
                getJidOf(ticket),
                { ...optionsMsg }
              );

              wbot.store(sentMessage);

              await verifyMediaMessage(
                sentMessage,
                ticket,
                contact,
                ticketTraking,
                false,
                false,
                wbot
              );
            },
            1000,
            `${ticket.id}:greetingMedia`
          );
          debouncedSentgreetingMediaAttachment();
        } else {
          await wbot.sendMessage(
            getJidOf(ticket),
            {
              text: body
            }
          );
        }
      } else {
        const sentMessage = await wbot.sendMessage(
          getJidOf(ticket),
          {
            text: body
          }
        );

        wbot.store(sentMessage);
      }
    }

    if (queues[0].greetingMessage?.trim().length) {
      const queueGreetingBody = formatBody(
        `\u200e${queues[0].greetingMessage}`,
        ticket,
        { queue: queues[0].name }
      );

      const sentQueueGreeting = await SendWhatsAppMessage({
        body: queueGreetingBody,
        ticket,
        isForwarded: false
      });

      await verifyMessage(sentQueueGreeting, ticket, contact, ticketTraking);
    }

    if (!isNil(queues[0].fileListId)) {
      try {
        const publicFolder = path.resolve(
          __dirname,
          "..",
          "..",
          "..",
          "public"
        );

        const files = await ShowFileService(
          queues[0].fileListId,
          ticket.companyId
        );

        const folder = path.resolve(
          publicFolder,
          `company${ticket.companyId}`,
          "fileList",
          String(files.id)
        );

        for (const [index, file] of files.options.entries()) {
          const mediaSrc = {
            fieldname: "medias",
            originalname: path.basename(file.path),
            encoding: "7bit",
            mimetype: file.mediaType,
            filename: file.path,
            path: path.resolve(folder, file.path)
          } as Express.Multer.File;

          await SendWhatsAppMedia({
            media: mediaSrc,
            ticket,
            body: file.name,
            isPrivate: false,
            isForwarded: false
          });
        }
      } catch (error) {
        logger.info(error);
      }
    }

    if (queues[0].closeTicket) {
      await UpdateTicketService({
        ticketData: {
          status: "closed",
          queueId: queues[0].id,
          sendFarewellMessage: false
        },
        ticketId: ticket.id,
        companyId
      });

      return;
    } else {
      await UpdateTicketService({
        ticketData: {
          queueId: queues[0].id,
          status: ticket.status === "lgpd" ? "pending" : ticket.status
        },
        ticketId: ticket.id,
        companyId
      });
    }

    // ✅ Agente de IA vinculado à fila única: aplicar promptId no ticket
    {
      const startedAi = await ApplyQueueAiAgent(queues[0] as any, ticket);
      if (startedAi) {
        await sendAiAgentInitialIfNoQueueGreeting(queues[0] as any, ticket, contact);
      }
    }

    const count = await Ticket.findAndCountAll({
      where: {
        userId: null,
        status: "pending",
        companyId,
        queueId: queues[0].id,
        isGroup: false
      }
    });

    if (enableQueuePosition) {
      // Lógica para enviar posição da fila de atendimento
      const qtd = count.count === 0 ? 1 : count.count;
      const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
      // const msgFila = `*Assistente Virtual:*\n{{ms}} *{{name}}*, sua posição na fila de atendimento é: *${qtd}*`;
      const bodyFila = formatBody(`${msgFila}`, ticket);
      const debouncedSentMessagePosicao = debounce(
        async () => {
          const sentMessage = await wbot.sendMessage(
            getJidOf(ticket),
            {
              text: bodyFila
            }
          );

          wbot.store(sentMessage);
        },
        3000,
        `${ticket.id}:queuePosition`
      );
      debouncedSentMessagePosicao();
    }

    return;
  }

  // REGRA PARA DESABILITAR O BOT PARA ALGUM CONTATO
  if (contact.disableBot) {
    return;
  }

  let selectedOption = "";

  if (ticket.status !== "lgpd") {
    selectedOption =
      msg?.message?.buttonsResponseMessage?.selectedButtonId ||
      msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      (() => { try { const irm = (msg.message as any)?.interactiveResponseMessage; if (irm?.nativeFlowResponseMessage?.paramsJson) { const p = JSON.parse(irm.nativeFlowResponseMessage.paramsJson); return p?.id || p?.display_text; } return null; } catch { return null; } })() ||
      getBodyMessage(msg);
  } else {
    if (!isNil(ticket.lgpdAcceptedAt))
      await ticket.update({
        status: ticket.isGroup ? "group" : "pending"
      });

    await ticket.reload();
  }

  if (String(selectedOption).toLocaleLowerCase() === "sair") {
    // Enviar mensagem de conclusão antes de fechar para aparecer no frontend
    if (complationMessage) {
      await SendWhatsAppMessage({ body: complationMessage, ticket });
    }

    // Fechar ticket via serviço central para emitir sockets adequadamente
    await UpdateTicketService({
      ticketData: {
        isBot: false,
        status: "closed",
        // já enviamos a farewell acima
        sendFarewellMessage: false,
        amountUsedBotQueues: 0
      },
      ticketId: ticket.id,
      companyId
    });

    await ticketTraking.update({
      userId: ticket.userId,
      closedAt: moment().toDate(),
      finishedAt: moment().toDate()
    });

    await CreateLogTicketService({
      ticketId: ticket.id,
      type: "clientClosed",
      queueId: ticket.queueId
    });

    return;
  }

  let choosenQueue =
    chatbot && queues.length === 1
      ? queues[+selectedOption]
      : queues[+selectedOption - 1];

  const typeBot = settings?.chatBotType || "text";

  // Serviço p/ escolher consultor aleatório para o ticket, ao selecionar fila.
  let randomUserId;

  if (choosenQueue) {
    try {
      const userQueue = await ListUserQueueServices(choosenQueue.id);
      if (userQueue.userId > -1) {
        randomUserId = userQueue.userId;
      }
    } catch (error) {
      console.error(error);
    }
  }

  // Ativar ou desativar opção de escolher consultor aleatório.
  /*   let settings = await CompaniesSettings.findOne({
      where: {
        companyId: companyId
      }
    }); */

  const botText = async () => {
    if (choosenQueue || (queues.length === 1 && chatbot)) {
      if (queues.length === 1) choosenQueue = queues[0];
      const queue = await Queue.findByPk(choosenQueue.id);

      if (ticket.isOutOfHour === false && ticketTraking.chatbotAt !== null) {
        await ticketTraking.update({
          chatbotAt: null
        });
        await ticket.update({
          amountUsedBotQueues: 0
        });
      }

      let currentSchedule;

      if (settings?.scheduleType === "queue") {
        currentSchedule = await VerifyCurrentSchedule(companyId, queue.id, 0);
      }

      if (
        settings?.scheduleType === "queue" &&
        ticket.status !== "open" &&
        !isNil(currentSchedule) &&
        (ticket.amountUsedBotQueues < maxUseBotQueues ||
          maxUseBotQueues === 0) &&
        (!currentSchedule || currentSchedule.inActivity === false) &&
        (!ticket.isGroup || ticket.whatsapp?.groupAsTicket === "enabled")
      ) {
        // Se o agente de IA do Prompt cobre o horário atual, não bloqueia
        // o fluxo fora do expediente — deixa seguir para o handleOpenAiFlow.
        if (await PromptCoversNow(ticket.whatsapp, queue, ticket.promptId)) {
          logger.debug(`[OUT-OF-HOURS BYPASS] Agente cobre o horário - ticket ${ticket.id}`);
        } else {
        if (timeUseBotQueues !== "0") {
          //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
          //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
          let dataLimite = new Date();
          let Agora = new Date();

          if (ticketTraking.chatbotAt !== null) {
            dataLimite.setMinutes(
              ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues)
            );

            if (
              ticketTraking.chatbotAt !== null &&
              Agora < dataLimite &&
              timeUseBotQueues !== "0" &&
              ticket.amountUsedBotQueues !== 0
            ) {
              return;
            }
          }
          await ticketTraking.update({
            chatbotAt: null
          });
        }

        const outOfHoursMessage = queue.outOfHoursMessage;

        if (outOfHoursMessage !== "") {
          const body = formatBody(`${outOfHoursMessage}`, ticket);

          const debouncedSentMessage = debounce(
            async () => {
              const sentMessage = await wbot.sendMessage(
                getJidOf(ticket),
                {
                  text: body
                }
              );

              wbot.store(sentMessage);
            },
            1000,
            `${ticket.id}:outOfHours`
          );
          debouncedSentMessage();

          //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
          // await ticket.update({
          //   queueId: queue.id,
          //   isOutOfHour: true,
          //   amountUsedBotQueues: ticket.amountUsedBotQueues + 1
          // });

          // return;
        }
        //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
        await ticket.update({
          queueId: queue.id,
          isOutOfHour: true,
          amountUsedBotQueues: ticket.amountUsedBotQueues + 1
        });
        return;
        }
      }

      await UpdateTicketService({
        ticketData: { amountUsedBotQueues: 0, queueId: choosenQueue.id },
        // ticketData: { queueId: queues.length ===1 ? null : choosenQueue.id },
        ticketId: ticket.id,
        companyId
      });
      // }

      if (choosenQueue.chatbots.length > 0 && !ticket.isGroup) {
        let options = "";
        choosenQueue.chatbots.forEach((chatbot, index) => {
          options += `*[ ${index + 1} ]* - ${chatbot.name}\n`;
        });

        const body = formatBody(
          `\u200e ${choosenQueue.greetingMessage}\n\n${buildChatbotBackAndExitText(options)}`,
          ticket,
          { queue: choosenQueue.name }
        );

        const sentMessage = await wbot.sendMessage(
          getJidOf(ticket),

          {
            text: body
          }
        );

        wbot.store(sentMessage);

        await verifyMessage(sentMessage, ticket, contact, ticketTraking);

      }

      // Atribuir usuário imediatamente se randomização imediata estiver ativada
      // ✅ Não atribuir usuário aqui se a fila tem fluxo vinculado (integrationId)
      // ou o ticket já está dentro de um fluxo — evita interromper o FlowBuilder.
      const _inActiveFlow = !!(ticket.flowStopped || ticket.flowWebhook || ticket.lastFlowId);
      const _queueHasFlow = !!(choosenQueue && (choosenQueue as any).integrationId);
      if (
        randomUserId &&
        (queue?.randomizeImmediate || settings?.settingsUserRandom === "enabled") &&
        !_inActiveFlow &&
        !_queueHasFlow
      ) {
        await UpdateTicketService({
          ticketData: { userId: randomUserId },
          ticketId: ticket.id,
          companyId
        });
      } else if (randomUserId && (_inActiveFlow || _queueHasFlow)) {
        logger.info(
          `[AUTO ASSIGN] Ticket ${ticket.id} com fluxo vinculado - adiando atribuição randômica para não parar o FlowBuilder`
        );
      }

      if (
        !choosenQueue.chatbots.length &&
        choosenQueue.greetingMessage.length !== 0
      ) {
        const body = formatBody(
          `\u200e${choosenQueue.greetingMessage}`,
          ticket,
          { queue: choosenQueue.name }
        );
        const sentMessage = await wbot.sendMessage(
          getJidOf(ticket),
          {
            text: body
          }
        );

        wbot.store(sentMessage);

        await verifyMessage(sentMessage, ticket, contact, ticketTraking);
      }

      //inicia integração dialogflow/n8n/typebot
      if (!msg.key.fromMe && !ticket.isGroup && choosenQueue?.integrationId) {
        const integrations = await ShowQueueIntegrationService(
          choosenQueue.integrationId,
          companyId
        );

        await handleMessageIntegration(
          msg,
          wbot,
          companyId,
          integrations,
          ticket
        );

        if (msg.key.fromMe) {
          await ticket.update({
            typebotSessionTime: moment().toDate(),
            useIntegration: true,
            integrationId: choosenQueue.integrationId
          });
        } else {
          await ticket.update({
            useIntegration: true,
            integrationId: choosenQueue.integrationId
          });
        }
      }

      // ✅ Agente de IA vinculado à fila escolhida pelo usuário
      {
        const startedAi = await ApplyQueueAiAgent(choosenQueue as any, ticket);
        if (startedAi) {
          await sendAiAgentInitialIfNoQueueGreeting(choosenQueue as any, ticket, contact);
        }
      }

      if (!isNil(choosenQueue.fileListId)) {
        try {
          const publicFolder = path.resolve(
            __dirname,
            "..",
            "..",
            "..",
            "public"
          );

          const files = await ShowFileService(
            choosenQueue.fileListId,
            ticket.companyId
          );

          const folder = path.resolve(
            publicFolder,
            `company${ticket.companyId}`,
            "fileList",
            String(files.id)
          );

          for (const [index, file] of files.options.entries()) {
            const mediaSrc = {
              fieldname: "medias",
              originalname: path.basename(file.path),
              encoding: "7bit",
              mimetype: file.mediaType,
              filename: file.path,
              path: path.resolve(folder, file.path)
            } as Express.Multer.File;

            // const debouncedSentMessagePosicao = debounce(
            //   async () => {
            const sentMessage = await SendWhatsAppMedia({
              media: mediaSrc,
              ticket,
              body: `\u200e ${file.name}`,
              isPrivate: false,
              isForwarded: false
            });

            await verifyMediaMessage(
              sentMessage,
              ticket,
              ticket.contact,
              ticketTraking,
              false,
              false,
              wbot
            );
            //   },
            //   2000,
            //   ticket.id
            // );
            // debouncedSentMessagePosicao();
          }
        } catch (error) {
          logger.info(error);
        }
      }

      await delay(4000);

      //se fila está parametrizada para encerrar ticket automaticamente
      if (choosenQueue.closeTicket) {
        try {
          await UpdateTicketService({
            ticketData: {
              status: "closed",
              queueId: choosenQueue.id,
              sendFarewellMessage: false
            },
            ticketId: ticket.id,
            companyId
          });
        } catch (error) {
          logger.info(error);
        }

        return;
      }

      const count = await Ticket.findAndCountAll({
        where: {
          userId: null,
          status: "pending",
          companyId,
          queueId: choosenQueue.id,
          whatsappId: wbot.id,
          isGroup: false
        }
      });

      await CreateLogTicketService({
        ticketId: ticket.id,
        type: "queue",
        queueId: choosenQueue.id
      });

      if (enableQueuePosition && !choosenQueue.chatbots.length) {
        // Lógica para enviar posição da fila de atendimento
        const qtd = count.count === 0 ? 1 : count.count;
        const msgFila = `${settings.sendQueuePositionMessage} *${qtd}*`;
        // const msgFila = `*Assistente Virtual:*\n{{ms}} *{{name}}*, sua posição na fila de atendimento é: *${qtd}*`;
        const bodyFila = formatBody(`${msgFila}`, ticket);
        const debouncedSentMessagePosicao = debounce(
          async () => {
            const sentMessage = await wbot.sendMessage(
              getJidOf(ticket),
              {
                text: bodyFila
              }
            );

            wbot.store(sentMessage);
          },
          3000,
          `${ticket.id}:queuePosition`
        );
        debouncedSentMessagePosicao();
      }
    } else {
      if (ticket.isGroup) return;

      if (
        maxUseBotQueues &&
        maxUseBotQueues !== 0 &&
        ticket.amountUsedBotQueues >= maxUseBotQueues
      ) {
        // await UpdateTicketService({
        //   ticketData: { queueId: queues[0].id },
        //   ticketId: ticket.id
        // });

        return;
      }

      if (timeUseBotQueues !== "0") {
        //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
        //const ticketTraking = await FindOrCreateATicketTrakingService({ ticketId: ticket.id, companyId });
        let dataLimite = new Date();
        let Agora = new Date();

        if (ticketTraking.chatbotAt !== null) {
          dataLimite.setMinutes(
            ticketTraking.chatbotAt.getMinutes() + Number(timeUseBotQueues)
          );

          if (
            ticketTraking.chatbotAt !== null &&
            Agora < dataLimite &&
            timeUseBotQueues !== "0" &&
            ticket.amountUsedBotQueues !== 0
          ) {
            return;
          }
        }
        await ticketTraking.update({
          chatbotAt: null
        });
      }

      // if (wbot.waitForSocketOpen()) {
      // }

      wbot.presenceSubscribe(contact.remoteJid);

      let options = "";

      wbot.sendPresenceUpdate("composing", contact.remoteJid);

      queues.forEach((queue, index) => {
        options += `*[ ${index + 1} ]* - ${queue.name}\n`;
      });
      options = buildChatbotExitOnlyText(options);

      const body = formatBody(`\u200e${greetingMessage}\n\n${options}`, ticket);

      await CreateLogTicketService({
        ticketId: ticket.id,
        type: "chatBot"
      });

      await delay(1000);

      await wbot.sendPresenceUpdate("paused", contact.remoteJid);

      if (ticket.whatsapp.greetingMediaAttachment !== null) {
        const filePath = path.resolve(
          "public",
          `company${companyId}`,
          ticket.whatsapp.greetingMediaAttachment
        );

        const fileExists = fs.existsSync(filePath);
        if (fileExists) {
          const messagePath = ticket.whatsapp.greetingMediaAttachment;
          const optionsMsg = await getMessageOptions(
            messagePath,
            filePath,
            String(companyId),
            body
          );

          const debouncedSentgreetingMediaAttachment = debounce(
            async () => {
              const sentMessage = await wbot.sendMessage(getJidOf(ticket),
                { ...optionsMsg }
              );

              wbot.store(sentMessage);

              await verifyMediaMessage(
                sentMessage,
                ticket,
                contact,
                ticketTraking,
                false,
                false,
                wbot
              );
            },
            1000,
            `${ticket.id}:greetingMedia`
          );
          debouncedSentgreetingMediaAttachment();
        } else {
          const debouncedSentMessage = debounce(
            async () => {
              const sentMessage = await wbot.sendMessage(getJidOf(ticket),
                {
                  text: body
                }
              );

              wbot.store(sentMessage);

              await verifyMessage(sentMessage, ticket, contact, ticketTraking);
            },
            1000,
            `${ticket.id}:queueGreeting`
          );
          debouncedSentMessage();
        }
        await UpdateTicketService({
          ticketData: { amountUsedBotQueues: ticket.amountUsedBotQueues + 1 },
          ticketId: ticket.id,
          companyId
        });

        return;
      } else {
        const debouncedSentMessage = debounce(
          async () => {
            const sentMessage = await wbot.sendMessage(
              getJidOf(ticket),
              {
                text: body
              }
            );

            wbot.store(sentMessage);

            await verifyMessage(sentMessage, ticket, contact, ticketTraking);
          },
          1000,
          `${ticket.id}:chatbotMenu`
        );

        await UpdateTicketService({
          ticketData: { amountUsedBotQueues: ticket.amountUsedBotQueues + 1 },
          ticketId: ticket.id,
          companyId
        });

        debouncedSentMessage();
      }
    }
  };

  if (typeBot === "text") {
    return botText();
  }

  if (typeBot === "button" && queues.length > 3) {
    return botText();
  }
};

/**
 * A resposta que está chegando é uma AVALIAÇÃO que estamos esperando?
 *
 * POR QUE O `userId !== null` SAIU DAQUI
 *
 * Havia a exigência de `ticketTraking.userId !== null`, ou seja: só aceitava
 * avaliação de atendimento que tivesse passado por um ATENDENTE humano.
 *
 * Isso quebrava o atendimento que termina no nó "Sair / Encerrar" do fluxo.
 * Nesse caminho a conversa é resolvida inteira pelo bot e ninguém assume o
 * ticket, então `ticket.userId` é nulo — e o `ticketTraking.userId`, que é
 * copiado dele ao fechar (UpdateTicketService), também.
 *
 * O efeito era ruim e silencioso: a pergunta da avaliação ERA enviada e o
 * ticket ia para o status "nps", mas quando o cliente respondia "5" esta
 * função devolvia false. O bloco que consome a nota era pulado, a execução
 * seguia adiante no listener e a nota caía nos gatilhos de fluxo lá embaixo —
 * ABRINDO UM NOVO ATENDIMENTO em vez de registrar a avaliação. Era exatamente
 * o "responde a avaliação e abre outro fluxo".
 *
 * As três condições que sobraram já bastam, e todos os 6 pontos que chamam
 * esta função checam `ticket.status === "nps"` antes — status que só existe
 * porque a avaliação foi realmente pedida:
 *
 *   closedAt  !== null  -> o atendimento foi encerrado
 *   ratingAt  === null  -> ainda não foi avaliado
 *   finishedAt === null -> o ciclo não foi fechado
 */
export const verifyRating = (ticketTraking: TicketTraking) => {
  if (
    ticketTraking &&
    ticketTraking.finishedAt === null &&
    ticketTraking.closedAt !== null &&
    ticketTraking.ratingAt === null
  ) {
    return true;
  }
  return false;
};

export const handleRating = async (
  rate: number,
  ticket: Ticket,
  ticketTraking: TicketTraking
) => {
  const io = getIO();
  const companyId = ticket.companyId;

  const { complationMessage } = await ShowWhatsAppService(
    ticket.whatsappId,

    companyId
  );

  let finalRate = rate;

  if (rate < 0) {
    finalRate = 0;
  }
  if (rate > 10) {
    finalRate = 10;
  }

  await UserRating.create({
    ticketId: ticketTraking.ticketId,
    companyId: ticketTraking.companyId,
    userId: ticketTraking.userId,
    rate: finalRate
  });

  if (
    !isNil(complationMessage) &&
    complationMessage !== "" &&
    !ticket.isGroup
  ) {
    const body = formatBody(`\u200e${complationMessage}`, ticket);
    if (ticket.channel === "whatsapp") {
      const msg = await SendWhatsAppMessage({ body, ticket });

      await verifyMessage(msg, ticket, ticket.contact, ticketTraking);
    }

    // wacalls (WhatsApp Plus) usa o mesmo SendWhatsAppMessage por baixo, mas
    // seu branch j\u00e1 persiste a mensagem internamente (via SendWacallsText) \u2014
    // chamar verifyMessage aqui de novo duplicaria a mensagem de conclus\u00e3o
    // no atendimento.
    if (ticket.channel === "wacalls") {
      await SendWhatsAppMessage({ body, ticket });
    }

    if (["facebook", "instagram"].includes(ticket.channel)) {
      await sendFacebookMessage({ body, ticket });
    }

    if (ticket.channel === "telegram") {
      await sendTelegramMessage({ body, ticket });
    }
  }

  await ticket.update({
    isBot: false,
    status: "closed",
    amountUsedBotQueuesNPS: 0
  });

  //loga fim de atendimento
  await CreateLogTicketService({
    userId: ticket.userId,
    queueId: ticket.queueId,
    ticketId: ticket.id,
    type: "closed"
  });

  io.of(String(companyId))
    // .to("open")
    .emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticket,
      ticketId: ticket.id
    });

  io.of(String(companyId))
    // .to(ticket.status)
    // .to(ticket.id.toString())
    .emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket,
      ticketId: ticket.id
    });
};

const sanitizeName = (name: string): string => {
  let sanitized = name.split(" ")[0];
  sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  return sanitized.substring(0, 60);
};

const stripInvisibleText = (value?: string | null): string =>
  (value || "").replace(/[\u200B-\u200F\uFEFF]/g, "").trim();

const hasVisibleText = (value?: string | null): boolean =>
  stripInvisibleText(value).length > 0;

/**
 * Verifica se a mensagem do cliente contém alguma das palavras-chave de
 * transferência configuradas no agente. Respeita também o flag allowTransfer:
 * se estiver desativado ou se não houver palavras-chave configuradas, retorna
 * false e o agente NÃO transfere por linguagem natural / marcador.
 */
const matchesTransferKeyword = (
  promptCfg: any,
  userText?: string | null
): boolean => {
  if (!promptCfg) return false;
  if (promptCfg.allowTransfer === false) return false;
  const raw = (promptCfg.transferKeywords || "").toString();
  if (!raw.trim()) return false;
  const text = (userText || "").toLowerCase();
  if (!text.trim()) return false;
  const keywords = raw
    .split(",")
    .map((k: string) => k.trim().toLowerCase())
    .filter((k: string) => k.length > 0);
  return keywords.some((k: string) => text.includes(k));
};

/**
 * Quando a fila não possui saudação configurada e o agente de IA assumiu o
 * ticket, dispara automaticamente a "Mensagem Inicial" do agente para que ele
 * inicie a conversa sem aguardar o cliente falar primeiro.
 */
export const sendAiAgentInitialIfNoQueueGreeting = async (
  queue: any,
  ticket: Ticket,
  contact: Contact
): Promise<void> => {
  try {
    if (!ticket || !ticket.promptId) return;
    if (hasVisibleText(queue?.greetingMessage)) return;

    const prompt = await PromptModel.findByPk(ticket.promptId);
    if (!prompt) return;
    if ((prompt as any).active === false) return;
    if ((prompt as any).workingHoursEnabled && !isWithinWorkingHours(prompt)) {
      logger.info(`[AI AGENT INIT] Fora do turno do agente (prompt ${ticket.promptId}) - ticket ${ticket.id}`);
      return;
    }

    // Só enviamos a "Mensagem Inicial" se ela estiver configurada no agente.
    // Sem fallback para template automático: caso contrário, a IA já responde
    // diretamente à mensagem do cliente e teríamos duas saudações duplicadas.
    const initialText = stripInvisibleText((prompt as any).greetingMessage);
    if (!hasVisibleText(initialText)) return;

    const delaySec = Number((prompt as any).responseDelay) || 0;
    if (delaySec > 0) {
      await new Promise(r => setTimeout(r, delaySec * 1000));
    }

    const body = formatBody(`\u200e${initialText}`, ticket);

    if (ticket.channel === "whatsapp_oficial") {
      try {
        await SendWhatsAppOficialMessage({
          body,
          ticket,
          type: "text",
          media: null,
          vCard: null
        } as any);
      } catch (e) {
        logger.warn(`[AI AGENT INIT] Falha ao enviar saudação inicial (oficial) - ticket ${ticket.id}: ${e}`);
      }
      aiInitialSentTickets.set(ticket.id, Date.now());
      return;
    }

    if (ticket.channel === "wacalls") {
      // Ver comentário equivalente em applyAiTransfer — sem esse branch a
      // "Mensagem Inicial" do Agente de IA nunca saía pra conexões WhatsApp
      // Plus (caía no branch Baileys abaixo, que usa GetTicketWbot).
      try {
        const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
        await SendWacallsText({ body, ticket });
      } catch (e) {
        logger.warn(`[AI AGENT INIT] Falha ao enviar saudação inicial (wacalls) - ticket ${ticket.id}: ${e}`);
      }
      aiInitialSentTickets.set(ticket.id, Date.now());
      return;
    }

    try {
      const wbot = await GetTicketWbot(ticket);
      const sent = await wbot.sendMessage(getJidOf(ticket), { text: body });
      if (sent) await verifyMessage(sent, ticket, contact);
      aiInitialSentTickets.set(ticket.id, Date.now());
    } catch (e) {
      logger.warn(`[AI AGENT INIT] Falha ao enviar saudação inicial - ticket ${ticket.id}: ${e}`);
    }
  } catch (err) {
    logger.warn(`[AI AGENT INIT] Erro inesperado - ticket ${ticket?.id}: ${err}`);
  }
};

/**
 * Mapa em memória de tickets que acabaram de receber a "Mensagem Inicial" do
 * agente de IA. Usado para evitar que a IA responda à MESMA mensagem do
 * cliente que disparou a saudação inicial (evita duas mensagens duplicadas).
 * Expira após 15s.
 */
const aiInitialSentTickets: Map<number, number> = new Map();
export const consumeAiInitialSent = (ticketId: number): boolean => {
  const ts = aiInitialSentTickets.get(ticketId);
  if (!ts) return false;
  aiInitialSentTickets.delete(ticketId);
  return Date.now() - ts < 15000;
};

// Removido: não enviar mais frase fixa "Você já está na fila correta...".
// Quando o cliente já estiver na fila do agente, o atendimento segue normalmente
// pelo prompt configurado (sem mensagem hardcoded).

const formatDateTimeBrasilia = (date: Date): string => {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const partValue = (type: string) =>
    parts.find(part => part.type === type)?.value || "";

  const weekday = partValue("weekday");
  const day = partValue("day");
  const month = partValue("month");
  const year = partValue("year");
  const hour = partValue("hour");
  const minute = partValue("minute");
  const second = partValue("second");

  return `${weekday}, ${day}/${month}/${year} ${hour}:${minute}:${second}`;
};

const deleteFileSync = (path: string): void => {
  try {
    fs.unlinkSync(path);
  } catch (error) {
    console.error("Erro ao deletar o arquivo:", error);
  }
};

export const convertTextToSpeechAndSaveToFile = (
  text: string,
  filename: string,
  subscriptionKey: string,
  serviceRegion: string,
  voice: string = "pt-BR-FabioNeural",
  audioToFormat: string = "mp3"
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const speechConfig = SpeechConfig.fromSubscription(
      subscriptionKey,
      serviceRegion
    );
    speechConfig.speechSynthesisVoiceName = voice;
    const audioConfig = AudioConfig.fromAudioFileOutput(`${filename}.wav`);
    const synthesizer = new SpeechSynthesizer(speechConfig, audioConfig);
    synthesizer.speakTextAsync(
      text,
      result => {
        if (result) {
          convertWavToAnotherFormat(
            `${filename}.wav`,
            `${filename}.${audioToFormat}`,
            audioToFormat
          )
            .then(output => {
              resolve();
            })
            .catch(error => {
              console.error(error);
              reject(error);
            });
        } else {
          reject(new Error("No result from synthesizer"));
        }
        synthesizer.close();
      },
      error => {
        console.error(`Error: ${error}`);
        synthesizer.close();
        reject(error);
      }
    );
  });
};

const convertWavToAnotherFormat = (
  inputPath: string,
  outputPath: string,
  toFormat: string
) => {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .toFormat(toFormat)
      .on("end", () => resolve(outputPath))
      .on("error", (err: { message: any }) =>
        reject(new Error(`Error converting file: ${err.message}`))
      )
      .save(outputPath);
  });
};

export const keepOnlySpecifiedChars = (str: string) => {
  return str.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚâêîôûÂÊÎÔÛãõÃÕçÇ!?.,;:\s]/g, "");
};

export const transferQueue = async (
  queueId: number,
  ticket: Ticket,
  contact: Contact
): Promise<void> => {
  await UpdateTicketService({
    ticketData: { queueId: queueId },
    ticketId: ticket.id,
    companyId: ticket.companyId
  });
};

// =====================================================================
// AI TRANSFER HELPERS (usado por handleOpenAi / handleAiAgent)
// =====================================================================

const _aiNormalize = (str: string): string =>
  (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Resolve fila e (opcionalmente) atendente a partir de um nome livre.
 * Tolerante a acento, caixa, "setor de", "fila", "departamento", etc.
 */
export const resolveTransferTarget = async (
  companyId: number,
  rawText: string,
  fallbackQueueId?: number | null
): Promise<{ queue: any | null; user: any | null }> => {
  const queues = await Queue.findAll({ where: { companyId } });
  if (!queues || queues.length === 0) {
    return { queue: null, user: null };
  }

  const cleaned = _aiNormalize(rawText || "")
    .replace(/\b(setor( de)?|fila|departamento|atendimento|equipe|time)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let queue: any = null;

  if (cleaned) {
    // 1) match exato
    queue = queues.find(q => _aiNormalize(q.name) === cleaned);
    // 2) inclusão bidirecional
    if (!queue) {
      queue = queues.find(q => {
        const qn = _aiNormalize(q.name);
        return qn.includes(cleaned) || cleaned.includes(qn);
      });
    }
    // 3) palavras
    if (!queue) {
      const words = cleaned.split(" ").filter(w => w.length >= 3);
      if (words.length > 0) {
        const scored = queues
          .map(q => {
            const qn = _aiNormalize(q.name);
            const score = words.filter(w => qn.includes(w)).length;
            return { q, score };
          })
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score);
        if (scored.length > 0 && (scored.length === 1 || scored[0].score > scored[1].score)) {
          queue = scored[0].q;
        }
      }
    }
  }

  if (!queue && fallbackQueueId) {
    queue = queues.find(q => q.id === fallbackQueueId) || null;
  }

  if (!queue) return { queue: null, user: null };

  // Tentar encontrar atendente mencionado pelo nome
  let user: any = null;
  try {
    const allUsers = await User.findAll({ where: { companyId } });
    const normalized = _aiNormalize(rawText || "");
    const candidates = allUsers
      .map(u => {
        const un = _aiNormalize(u.name || "");
        const first = un.split(" ")[0];
        let score = 0;
        if (un && normalized.includes(un)) score += 100;
        if (first && first.length >= 3 && normalized.includes(first)) score += 40;
        return { u, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (candidates.length > 0 && (candidates.length === 1 || candidates[0].score > candidates[1].score)) {
      user = candidates[0].u;
    }
  } catch (e) {
    logger.warn("[AI TRANSFER] Falha ao resolver atendente:", e);
  }

  return { queue, user };
};

/**
 * Aplica transferência completa do ticket para a fila (e opcional atendente)
 * vinda do agente de IA. Limpa as flags do bot e usa UpdateTicketService.
 */
export const applyAiTransfer = async (
  ticket: Ticket,
  contact: Contact,
  queue: any,
  user: any | null
): Promise<boolean> => {
  if (!queue || !queue.id) {
    logger.warn(`[AI TRANSFER] Tentativa de transferência sem fila válida - ticket ${ticket.id}`);
    return false;
  }

  if (Number(queue.id) === Number(ticket.queueId) && (!user?.id || Number(user.id) === Number(ticket.userId))) {
    logger.warn(`[AI TRANSFER] Bloqueada transferência para a própria fila atual (${queue.name} id=${queue.id}) - ticket ${ticket.id}`);
    return false;
  }

  try {
    // Limpar flags de bot/IA antes da transferência
    await ticket.update({
      promptId: null,
      aiModel: null,
      isBot: false,
      useIntegration: false,
      dataWebhook: null
    });
  } catch (e) {
    logger.warn(`[AI TRANSFER] Falha ao limpar flags do bot - ticket ${ticket.id}:`, e);
  }

  try {
    await UpdateTicketService({
      ticketData: {
        queueId: queue.id,
        userId: user?.id || null,
        status: user?.id ? "open" : "pending",
        isBot: false,
        useIntegration: false,
        isTransfered: true
      },
      ticketId: ticket.id,
      companyId: ticket.companyId
    });
    logger.info(
      `[AI TRANSFER] Ticket ${ticket.id} transferido para fila ${queue.name} (id=${queue.id})${user ? `, atendente ${user.name} (id=${user.id})` : ""}`
    );
    // Pós-transferência: saudação da fila destino + aplicar agente de IA da fila (se houver)
    try {
      await ticket.reload();
      const destQueue = await Queue.findByPk(queue.id);
      const greetingRaw = stripInvisibleText(destQueue?.greetingMessage);
      if (greetingRaw.length > 0) {
        const body = formatBody(`\u200e${destQueue.greetingMessage}`, ticket, { queue: destQueue.name });
        if (hasVisibleText(body)) {
          if (ticket.channel === "whatsapp_oficial") {
            await SendWhatsAppOficialMessage({ body, ticket, type: "text", media: null, vCard: null } as any);
          } else if (ticket.channel === "wacalls") {
            // Sem esse branch, transferência de ticket wacalls (WhatsApp Plus)
            // feita pelo Agente de IA caía no else abaixo (GetTicketWbot),
            // que só existe pra sessão Baileys — a saudação da fila destino
            // simplesmente não saía (engolida pelo catch gErr aqui embaixo).
            const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
            await SendWacallsText({ body, ticket });
          } else {
            const wbotDest = await GetTicketWbot(ticket);
            const sent = await wbotDest.sendMessage(getJidOf(ticket), { text: body });
            if (sent) await verifyMessage(sent, ticket, contact);
          }
        }
      }
      const startedQueueAi = await ApplyQueueAiAgent(destQueue as any, ticket);
      if (startedQueueAi) {
        logger.info(`[AI TRANSFER] Agente IA aplicado na fila destino ${destQueue?.id} - ticket ${ticket.id}. Aguardando próxima mensagem do cliente.`);
        await sendAiAgentInitialIfNoQueueGreeting(destQueue as any, ticket, contact);
      }
      await ticket.reload();
    } catch (gErr) {
      logger.warn(`[AI TRANSFER] Falha ao enviar saudação/aplicar IA da fila destino - ticket ${ticket.id}: ${gErr}`);
    }
    return true;
  } catch (err) {
    logger.error(`[AI TRANSFER] Erro no UpdateTicketService - ticket ${ticket.id}:`, err);
    try {
      await ticket.update({
        queueId: queue.id,
        ...(user?.id ? { userId: user.id, status: "open" } : { status: "pending" })
      });
      return true;
    } catch (e) {
      logger.error(`[AI TRANSFER] Fallback update falhou - ticket ${ticket.id}:`, e);
      return false;
    }
  }
};

/**
 * Detecta intenção de transferência em texto natural do agente OU do cliente.
 */
export const detectAiTransferIntent = (text: string): boolean => {
  const t = _aiNormalize(text || "");
  if (!t) return false;
  return [
    "transferir", "transfere", "transferindo", "transferencia",
    "encaminhar", "encaminhando", "encaminhe",
    "passar para", "passar voce", "passar você", "passo voce", "passo você",
    "vou te passar", "vou te transferir", "vou te encaminhar",
    "falar com atendente", "atendente humano", "humano",
    "setor", "departamento", "fila"
  ].some(k => t.includes(k));
};

export const getSafeAiTransferFallbackQueueId = (
  fallbackQueueId?: number | null,
  currentQueueId?: number | null
): number | null => {
  if (!fallbackQueueId) return null;
  // Quando o Prompt está vinculado à própria fila do agente IA, esse queueId
  // NÃO é destino humano; usar ele faria a "transferência" ficar na mesma fila.
  if (currentQueueId && Number(fallbackQueueId) === Number(currentQueueId)) return null;
  return fallbackQueueId;
};

const getPromptTransferQueueId = (promptCfg: any): number | null => {
  const queueId = Number(promptCfg?.transferQueueId);
  return Number.isFinite(queueId) && queueId > 0 ? queueId : null;
};

const getPromptTransferUserId = (promptCfg: any): number | null => {
  const userId = Number(promptCfg?.transferUserId);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
};

const resolvePromptTransferQueueId = (promptCfg: any, ticket: Ticket): number | null => {
  const explicitQueueId = getPromptTransferQueueId(promptCfg);
  if (explicitQueueId) return explicitQueueId;
  return getSafeAiTransferFallbackQueueId(promptCfg?.queueId, ticket.queueId);
};

const resolveConfiguredTransferTarget = async (
  promptCfg: any,
  ticket: Ticket,
  rawText: string
): Promise<{ queue: any | null; user: any | null }> => {
  const explicitQueueId = getPromptTransferQueueId(promptCfg);
  if (explicitQueueId) {
    const queue = await Queue.findOne({ where: { id: explicitQueueId, companyId: ticket.companyId } });
    if (queue) {
      const explicitUserId = getPromptTransferUserId(promptCfg);
      const user = explicitUserId
        ? await User.findOne({ where: { id: explicitUserId, companyId: ticket.companyId } })
        : null;
      return { queue, user };
    }
    logger.warn(`[AI TRANSFER] transferQueueId=${explicitQueueId} não encontrado na empresa ${ticket.companyId} - ticket ${ticket.id}`);
  }

  return resolveTransferTarget(
    ticket.companyId,
    rawText,
    getSafeAiTransferFallbackQueueId(promptCfg?.queueId, ticket.queueId)
  );
};

const maybeTransferByExplicitQueueRequest = async (
  bodyMessage: string,
  ticket: Ticket,
  contact: Contact,
  wbot: Session,
  remoteJid: string,
  transferMessage?: string | null,
  fallbackQueueId?: number | null
): Promise<boolean> => {
  const { queue, user } = await resolveTransferTarget(ticket.companyId, bodyMessage, fallbackQueueId || null);
  if (!queue || Number(queue.id) === Number(ticket.queueId)) return false;

  const normalizedBody = _aiNormalize(bodyMessage);
  const normalizedQueue = _aiNormalize(queue.name || "");
  const explicitQueueMention = normalizedQueue.length >= 3 && normalizedBody.includes(normalizedQueue);

  if (!explicitQueueMention) return false;

  logger.info(`[AI TRANSFER] Pedido direto de fila detectado no texto do cliente: "${bodyMessage}" -> ${queue.name} (${queue.id}) - ticket ${ticket.id}`);

  if (hasVisibleText(transferMessage)) {
    try {
      const sentMsg = await wbot.sendMessage(remoteJid, { text: `\u200e ${transferMessage}` });
      await verifyMessage(sentMsg!, ticket, contact);
    } catch (e) {
      logger.warn("[AI TRANSFER] Falha ao enviar mensagem antes da transferência direta:", e);
    }
  }

  return applyAiTransfer(ticket, contact, queue, user);
};

const matchesAnyPhrase = (
  campaignPhrases: PhraseCondition[],
  messageBody: string
): boolean => {
  if (
    !campaignPhrases ||
    !Array.isArray(campaignPhrases) ||
    campaignPhrases.length === 0
  ) {
    return false;
  }

  if (!messageBody || typeof messageBody !== "string") {
    return false;
  }

  const bodyLower = messageBody.toLowerCase().trim();

  return campaignPhrases.some((condition: PhraseCondition) => {
    if (!condition.text || typeof condition.text !== "string") {
      return false;
    }

    const phraseLower = condition.text.toLowerCase().trim();

    if (condition.type === "exact") {
      return bodyLower === phraseLower;
    } else if (condition.type === "partial") {
      return bodyLower.includes(phraseLower);
    }

    return false;
  });
};

/**
 * Normaliza frases de campanha para garantir backward compatibility
 */
const normalizeCampaignPhrases = (phrase: any): PhraseCondition[] => {
  if (!phrase) return [];

  if (Array.isArray(phrase)) {
    return phrase.filter(item => item && item.text);
  }

  if (typeof phrase === "string") {
    try {
      const parsed = JSON.parse(phrase);

      if (Array.isArray(parsed)) {
        return parsed.filter(item => item && item.text);
      }

      if (typeof parsed === "string") {
        return [{ text: parsed, type: "exact" }];
      }
    } catch {
      return [{ text: phrase, type: "exact" }];
    }
  }

  return [];
};

/**
 * Encontra uma campanha que faça match com a mensagem
 */
const findMatchingCampaign = (
  campaigns: CampaignPhrase[],
  messageBody: string
): CampaignPhrase | null => {
  if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
    return null;
  }

  if (!messageBody || typeof messageBody !== "string") {
    return null;
  }

  return (
    campaigns.find((campaign: CampaignPhrase) => {
      if (!campaign.status) {
        return false;
      }

      const phrases = normalizeCampaignPhrases(campaign.phrase);
      const hasMatch = matchesAnyPhrase(phrases, messageBody);

      if (hasMatch) {
        flowDebug(
          `[CAMPANHA MATCH] ID: ${campaign.id}, Mensagem: "${messageBody}", Frases:`,
          phrases
        );
      }

      return hasMatch;
    }) || null
  );
};

const normalizeFlowKeywordText = (value?: string | null): string =>
  (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Mesma extração do parseFlowKeywords, porém SEM normalizar o texto.
 *
 * A normalização derruba acentos e passa tudo para minúsculo — ótimo para
 * comparar palavra-chave, e destrutivo para expressão regular: um padrão como
 * `[A-Z]{3}` viraria `[a-z]{3}` e deixaria de casar com o que o usuário
 * escreveu.
 */
const parseFlowPatternsRaw = (raw: any): string[] => {
  const values: string[] = [];
  const append = (value: any) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach(append);
      return;
    }
    if (typeof value === "object") {
      ["keywords", "keyword", "phrases", "phrase", "triggers", "words", "pattern", "regex"].forEach(
        key => append(value[key])
      );
      return;
    }
    const text = String(value).trim();
    if (!text) return;
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        append(JSON.parse(text));
        return;
      } catch {
        // segue como texto puro
      }
    }
    // Sem split por vírgula aqui: vírgula é sintaxe válida de quantificador
    // em expressão regular ({2,5}), e quebrar por ela arruinaria o padrão.
    values.push(text);
  };
  append(raw);
  return Array.from(new Set(values.filter(v => v.trim().length > 0)));
};

const parseFlowKeywords = (raw: any): string[] => {
  const values: string[] = [];
  const append = (value: any) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach(append);
      return;
    }
    if (typeof value === "object") {
      ["keywords", "keyword", "phrases", "phrase", "triggers", "words"].forEach(key => append(value[key]));
      return;
    }

    const text = String(value).trim();
    if (!text) return;
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        append(JSON.parse(text));
        return;
      } catch {
        // continua com split abaixo
      }
    }
    text.split(/[,;\n]/).forEach(item => values.push(item));
  };

  append(raw);
  return Array.from(new Set(values
    .map((keyword: any) => normalizeFlowKeywordText(keyword))
    .filter((keyword: string) => keyword.length > 0)));
};

export const executeFlowBuilderKeywordTrigger = async ({
  msg,
  wbot,
  companyId,
  ticket,
  contact,
  messageBody
}: {
  msg: proto.IWebMessageInfo | null;
  wbot: Session | null;
  companyId: number;
  ticket: Ticket;
  contact: Contact;
  messageBody: string;
}): Promise<boolean> => {
  if (!msg || msg.key.fromMe || !messageBody || ticket.flowWebhook || ticket.lastFlowId || ticket.flowStopped) {
    return false;
  }

  // Não dispara em conversas em andamento (atendente, fila, chatbot ou integração ativa)
  if (ticket.userId || ticket.queueId || ticket.isBot || ticket.useIntegration) {
    logger.info(
      `[FLOWBUILDER-KEYWORD] Ignorado: conversa em andamento (ticket ${ticket.id} userId=${ticket.userId || "-"} queueId=${ticket.queueId || "-"} isBot=${!!ticket.isBot} useIntegration=${!!ticket.useIntegration})`
    );
    return false;
  }

  const messageId = msg.key.id;
  const cacheKey = `flowbuilder_keyword_${companyId}_${ticket.id}_${messageId || "manual"}`;
  if (messageId && await cacheLayer.get(cacheKey)) {
    return false;
  }

  const normalizedBody = normalizeFlowKeywordText(messageBody);

  // A saída antecipada por corpo vazio ficava AQUI. Isso impedia o gatilho
  // "qualquer mensagem" de valer para mensagem só de mídia (foto ou áudio sem
  // legenda), que não tem texto para normalizar. Agora a checagem acontece
  // depois de carregar os fluxos: sem texto, só os de "qualquer mensagem"
  // podem disparar — palavra-chave e expressão regular precisam de conteúdo.

  // "any_message" precisa entrar aqui. A tela oferece o gatilho "Qualquer
  // mensagem" e salva direitinho no banco, mas esta consulta só trazia
  // "keyword" (e os antigos, com o campo nulo) — o fluxo de qualquer mensagem
  // nunca era sequer carregado, então nunca disparava.
  const keywordFlows = await FlowBuilderModel.findAll({
    where: {
      company_id: companyId,
      active: true,
      [Op.or]: [
        { triggerType: "keyword" },
        { triggerType: "any_message" },
        { triggerType: "regex" },
        // A tela oferece sete gatilhos; o backend só conhecia três. "Primeiro
        // contato" e "Fora do horário" eram salvos e ficavam mortos: o fluxo
        // aparecia Ativo na lista e nunca disparava.
        //
        // "Integração / Webhook" e "Manual (disparo via API)" continuam fora
        // desta consulta de propósito — eles não são disparados por mensagem
        // recebida, e sim por chamada externa.
        { triggerType: "first_contact" },
        { triggerType: "out_of_hours" },
        { triggerType: null }
      ]
    }
  });

  const tipoDoFluxo = (f: any) => String(f.triggerType || "keyword");
  const fluxosPorPalavra = keywordFlows.filter(f => tipoDoFluxo(f) === "keyword");
  const fluxosRegex = keywordFlows.filter(f => tipoDoFluxo(f) === "regex");
  const fluxosQualquerMensagem = keywordFlows.filter(
    f => tipoDoFluxo(f) === "any_message"
  );
  const fluxosPrimeiroContato = keywordFlows.filter(
    f => tipoDoFluxo(f) === "first_contact"
  );
  const fluxosForaDoHorario = keywordFlows.filter(
    f => tipoDoFluxo(f) === "out_of_hours"
  );

  logger.info(
    `[FLOWBUILDER-KEYWORD] Empresa ${companyId} - ${fluxosPorPalavra.length} por palavra-chave, ${fluxosRegex.length} por expressão regular, ${fluxosQualquerMensagem.length} por qualquer mensagem, ${fluxosPrimeiroContato.length} por primeiro contato e ${fluxosForaDoHorario.length} por fora do horário. Mensagem normalizada: "${normalizedBody}"`
  );

  // Sem texto (mídia sem legenda) só os gatilhos que não dependem de
  // conteúdo podem valer.
  if (
    !normalizedBody &&
    fluxosQualquerMensagem.length === 0 &&
    fluxosPrimeiroContato.length === 0 &&
    fluxosForaDoHorario.length === 0
  ) {
    return false;
  }

  // Palavra-chave deve disparar mesmo sem vínculo de conexão.
  // A guarda no topo da função (flowWebhook / lastFlowId / flowStopped /
  // userId / queueId / isBot / useIntegration) já impede que um novo fluxo
  // por palavra-chave seja iniciado enquanto há um atendimento ou fluxo
  // em andamento, evitando confusão.
  // Palavra-chave tem prioridade sobre "qualquer mensagem": um fluxo
  // pega-tudo abafaria todos os outros se fosse avaliado primeiro.
  let matchedFlow = fluxosPorPalavra.find(flow => {
    const parsed = Array.from(new Set([
      ...parseFlowKeywords(flow.keywords),
      ...parseFlowKeywords(flow.triggerConfig)
    ]));
    if (parsed.length === 0) {
      // Sem palavra cadastrada não existe comparação possível. Dizer isso é
      // melhor do que registrar "match=false" e deixar parecer defeito.
      logger.warn(
        `[FLOWBUILDER-KEYWORD] Fluxo ${flow.id} (${flow.name}) está com gatilho de palavra-chave mas nenhuma palavra cadastrada — nunca vai disparar.`
      );
      return false;
    }

    const hit = parsed.some(keyword => normalizedBody.includes(keyword));
    logger.info(
      `[FLOWBUILDER-KEYWORD] Fluxo ${flow.id} (${flow.name}) keywords=${JSON.stringify(parsed)} match=${hit}`
    );
    return hit;
  });

  // Expressão regular: mesma ideia da palavra-chave, mas com o padrão escrito
  // pelo usuário. Também estava sem tratamento nenhum no backend.
  if (!matchedFlow && fluxosRegex.length > 0) {
    matchedFlow = fluxosRegex.find(flow => {
      const padroes = [
        ...parseFlowPatternsRaw(flow.keywords),
        ...parseFlowPatternsRaw(flow.triggerConfig)
      ];
      return padroes.some(padrao => {
        try {
          return new RegExp(padrao, "i").test(messageBody);
        } catch (err: any) {
          // Padrão inválido não pode derrubar o processamento da mensagem.
          logger.warn(
            `[FLOWBUILDER-KEYWORD] Fluxo ${flow.id}: expressão regular inválida (${padrao}): ${err?.message}`
          );
          return false;
        }
      });
    });
    if (matchedFlow) {
      logger.info(
        `[FLOWBUILDER-KEYWORD] Fluxo ${matchedFlow.id} (${matchedFlow.name}) disparado por expressão regular`
      );
    }
  }

  // Primeiro contato: vale só quando este é o único atendimento do contato e
  // ele ainda não recebeu nenhuma resposta nossa. Sem essa segunda condição o
  // fluxo dispararia de novo a cada mensagem enquanto o ticket fosse o
  // primeiro, o que na prática é um laço.
  if (!matchedFlow && fluxosPrimeiroContato.length > 0) {
    try {
      const totalDeTickets = await Ticket.count({
        where: { contactId: contact.id, companyId }
      });
      const mensagensRecebidas = await Message.count({
        where: { ticketId: ticket.id, fromMe: false }
      });

      const ehPrimeiroContato = totalDeTickets <= 1 && mensagensRecebidas <= 1;

      logger.info(
        `[FLOWBUILDER-KEYWORD] Primeiro contato? tickets=${totalDeTickets} mensagens=${mensagensRecebidas} -> ${ehPrimeiroContato}`
      );

      if (ehPrimeiroContato) {
        matchedFlow = fluxosPrimeiroContato[0];
        logger.info(
          `[FLOWBUILDER-KEYWORD] Fluxo ${matchedFlow.id} (${matchedFlow.name}) disparado por "primeiro contato"`
        );
      }
    } catch (erro: any) {
      logger.warn(
        `[FLOWBUILDER-KEYWORD] Falha ao avaliar primeiro contato: ${erro?.message}`
      );
    }
  }

  // Fora do horário: usa o mesmo expediente que já governa a mensagem de fora
  // do expediente. Tenta o horário da conexão e cai para o da empresa.
  if (!matchedFlow && fluxosForaDoHorario.length > 0) {
    try {
      let expediente = await VerifyCurrentSchedule(
        companyId,
        0,
        ticket.whatsappId || 0
      );

      if (!expediente) {
        expediente = await VerifyCurrentSchedule(companyId, 0, 0);
      }

      const foraDoHorario = !!expediente && expediente.inActivity === false;

      logger.info(
        `[FLOWBUILDER-KEYWORD] Fora do horário? ${foraDoHorario}`
      );

      if (foraDoHorario) {
        matchedFlow = fluxosForaDoHorario[0];
        logger.info(
          `[FLOWBUILDER-KEYWORD] Fluxo ${matchedFlow.id} (${matchedFlow.name}) disparado por "fora do horário"`
        );
      }
    } catch (erro: any) {
      logger.warn(
        `[FLOWBUILDER-KEYWORD] Falha ao avaliar fora do horário: ${erro?.message}`
      );
    }
  }

  if (!matchedFlow && fluxosQualquerMensagem.length > 0) {
    // Não há palavra a conferir: o gatilho é a mensagem em si.
    matchedFlow = fluxosQualquerMensagem[0];
    logger.info(
      `[FLOWBUILDER-KEYWORD] Fluxo ${matchedFlow.id} (${matchedFlow.name}) disparado por "qualquer mensagem"`
    );
  }

  if (!matchedFlow) return false;

  const nodes: INodes[] = matchedFlow.flow?.["nodes"];
  const connections: IConnections[] = matchedFlow.flow?.["connections"] || [];

  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    logger.warn(`[FLOWBUILDER-KEYWORD] Fluxo ${matchedFlow.id} sem nós válidos`);
    await matchedFlow.increment({ failureCount: 1 });
    return false;
  }

  logger.info(
    `[FLOWBUILDER-KEYWORD] Disparando FlowBuilder ${matchedFlow.id} sem vínculo de conexão para ticket ${ticket.id}`
  );

  try {
    // IMPORTANTE: NÃO marcar flowWebhook=true aqui. O ActionsWebhookService
    // rejeita com "already_running" quando flowWebhook=true e nextStage não é
    // o estágio inicial conhecido ("start"/"1"). O próprio serviço marca o
    // ticket como em fluxo após validar.
    const newHash = `kwflow_${ticket.id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await ticket.update({
      flowWebhook: false,
      flowStopped: null,
      lastFlowId: null,
      hashFlowId: newHash,
      dataWebhook: null,
      isBot: true,
      status: ticket.isGroup ? "group" : "pending"
    });
    await ticket.reload();

    const result = await ActionsWebhookService(
      wbot?.id || ticket.whatsappId,
      matchedFlow.id,
      ticket.companyId,
      nodes,
      connections,
      resolveFlowEntryNodeId(nodes, connections),
      null,
      { inputs: [], keysFull: [] },
      newHash,
      null,
      ticket.id,
      {
        number: contact.number,
        name: contact.name,
        email: contact.email
      }
    );

    if (result === "already_running" || result === "no_nodes" || result === "missing_ids") {
      logger.warn(`[FLOWBUILDER-KEYWORD] ActionsWebhookService retornou "${result}" para fluxo ${matchedFlow.id}`);
      await matchedFlow.increment({ failureCount: 1 });
      await ticket.update({
        flowWebhook: false,
        isBot: false,
        lastFlowId: null,
        hashFlowId: null,
        flowStopped: null
      });
      return false;
    }

    await matchedFlow.increment({ executionCount: 1, successCount: 1 });
    if (messageId) {
      await cacheLayer.set(cacheKey, "1", "EX", 300);
    }
    return true;
  } catch (error) {
    logger.error("[FLOWBUILDER-KEYWORD] Erro ao executar fluxo por palavra-chave:", error);
    await matchedFlow.increment({ failureCount: 1 });
    await ticket.update({
      flowWebhook: false,
      isBot: false,
      lastFlowId: null,
      hashFlowId: null,
      flowStopped: null
    });
    return false;
  }
};

export const flowbuilderIntegration = async (
  msg: proto.IWebMessageInfo | null,
  wbot: Session | null,
  companyId: number,
  queueIntegration: QueueIntegrations | null,
  ticket: Ticket,
  contact: Contact,
  isFirstMsg?: Ticket,
  isTranfered?: boolean
) => {
  const io = getIO();
  // Extrai resposta interativa (nativeFlow/buttons/list) com prioridade sobre getBodyMessage
  const extractInteractiveResponse = (m: any): string | null => {
    if (!m?.message) return null;
    try {
      // 1) nativeFlowResponseMessage (listas e botões via nativeFlow)
      const irm = m.message?.interactiveResponseMessage;
      if (irm?.nativeFlowResponseMessage?.paramsJson) {
        const p = JSON.parse(irm.nativeFlowResponseMessage.paramsJson);
        const val = p?.id || p?.display_text;
        if (val) {
          logger.debug(`[FLOW-INTERACTIVE] Resposta nativeFlow extraída: "${val}" (paramsJson: ${irm.nativeFlowResponseMessage.paramsJson})`);
          return String(val);
        }
      }
      // 2) buttonsResponseMessage (botões legados)
      if (m.message?.buttonsResponseMessage?.selectedButtonId) {
        return m.message.buttonsResponseMessage.selectedButtonId;
      }
      // 3) listResponseMessage (listas legadas)
      if (m.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return m.message.listResponseMessage.singleSelectReply.selectedRowId;
      }
      // 4) templateButtonReplyMessage (resposta de botões interativos nativeFlow)
      const tbrm = m.message?.templateButtonReplyMessage;
      if (tbrm) {
        const val = tbrm.selectedDisplayText || tbrm.selectedId;
        if (val) {
          logger.debug(`[FLOW-INTERACTIVE] Resposta templateButtonReply extraída: "${val}" (id: ${tbrm.selectedId})`);
          return String(val);
        }
      }
    } catch (e) { /* fallback to getBodyMessage */ }
    return null;
  };

  const body = msg ? (extractInteractiveResponse(msg) || getBodyMessage(msg)) : ticket.lastMessage || "";

  // DEBUG - Verificar parâmetros de entrada
  logger.debug(`[RDS-FLOW-DEBUG] flowbuilderIntegration iniciado para ticket ${ticket.id}`);
  logger.debug(`[RDS-FLOW-DEBUG] Parâmetros: queueIntegration.type=${queueIntegration?.type || "sem integração"}, flowWebhook=${ticket.flowWebhook}, lastFlowId=${ticket.lastFlowId}`);
  logger.debug(`[RDS-FLOW-DEBUG] Mensagem: ${body}`);

  // ✅ ENCERRAMENTO GLOBAL: Se o cliente mandar uma palavra-chave de encerramento
  // enquanto está em qualquer ponto do fluxo, encerra imediatamente e libera o ticket.
  //
  // A implementação saiu daqui para services/FlowBuilderService/HandleFlowExitKeyword.ts
  // porque este ponto só era alcançado em todas as mensagens no WhatsApp Plus.
  // Baileys e API Oficial desviam para o ActionsWebhookService assim que o
  // ticket entra em fluxo, e por isso o "sair" não funcionava neles. Agora os
  // três canais chamam o mesmo serviço no início do processamento.
  if (msg && !msg.key.fromMe && body) {
    const encerrou = await HandleFlowExitKeyword({
      ticket,
      contact,
      companyId,
      body: String(body),
      canal: "BAILEYS"
    });
    if (encerrou) return true;
  }



  // ✅ PRIORIDADE MÁXIMA: Se o fluxo está parado aguardando resposta do usuário, continuar IMEDIATAMENTE
  // Não passar pelas campanhas/frases/welcome para evitar reiniciar o fluxo
  if (ticket.flowStopped && ticket.lastFlowId && msg && !msg.key.fromMe) {
    logger.info(`[FLOW STOPPED EARLY] Ticket ${ticket.id} tem fluxo parado (flowStopped=${ticket.flowStopped}, lastFlowId=${ticket.lastFlowId}) - continuando IMEDIATAMENTE`);
    
    try {
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: ticket.flowStopped,
          company_id: companyId,
          active: true
        }
      });

      if (!flow) {
        // Fluxo desativado ou não encontrado - limpar estado do ticket
        logger.warn(`[FLOW STOPPED EARLY] Fluxo ${ticket.flowStopped} inativo ou não encontrado - limpando estado do ticket ${ticket.id}`);
        await ticket.update({
          flowStopped: null,
          lastFlowId: null,
          flowWebhook: false,
          hashFlowId: null,
          dataWebhook: null
        });
        return false;
      }

      if (flow) {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];

        const mountDataContact = {
          number: contact.number,
          name: contact.name,
          email: contact.email
        };

        logger.info(`[FLOW STOPPED EARLY] Chamando ActionsWebhookService com pressKey: "${body}"`);

        await ActionsWebhookService(
          wbot?.id || ticket.whatsappId,
          parseInt(ticket.flowStopped),
          ticket.companyId,
          nodes,
          connections,
          ticket.lastFlowId,
          null,
          "",
          "",
          body,
          ticket.id,
          mountDataContact
        );

        logger.info("[FLOW STOPPED EARLY] ✅ Fluxo continuado com sucesso!");
        return true;
      } else {
        logger.error(`[FLOW STOPPED EARLY] ❌ Fluxo ${ticket.flowStopped} não encontrado`);
      }
    } catch (error) {
      logger.error("[FLOW STOPPED EARLY] ❌ Erro ao continuar fluxo:", error);
    }
  }

  // Se o fluxo está ativo mas NÃO está parado (executando), ignorar
  if (ticket.flowWebhook && ticket.lastFlowId && msg && !ticket.flowStopped) {
    logger.debug(`[RDS-FLOW-DEBUG] Ticket ${ticket.id} já em fluxo ativo (lastFlowId: ${ticket.lastFlowId}), ignorando`);
    return false;
  }

  // Só processar se não for mensagem minha (exceto quando msg é null = verificação pós-fluxo)
  if (msg && msg.key.fromMe) {
    logger.debug(`[RDS-FLOW-DEBUG] Mensagem é fromMe, ignorando fluxo para ticket ${ticket.id}`);
    return false;
  }

  if (msg && msg.messageStubType) {
    if (ENABLE_LID_DEBUG) {
      logger.info(
        `[RDS-LID] FlowBuilder - Ignorando evento de grupo: ${msg.messageStubType}`
      );
    }
    return false;
  }

  // ✅ ADICIONAR CACHE/CONTROLE PARA EVITAR EXECUÇÃO REPETIDA
  const messageId = msg?.key?.id;
  const cacheKey = `campaign_check_${ticket.id}_${messageId || 'manual'}`;

  // Verificar se já processamos esta mensagem/ticket para campanhas
  if (messageId && await cacheLayer.get(cacheKey)) {
    return false;
  }

  // Verificar se ticket foi fechado e reabrir se necessário
  if (msg && !msg.key.fromMe && ticket.status === "closed") {

    const reopenStatus = ticket.isGroup ? "group" : "pending";
    await ticket.update({ status: reopenStatus });
    await ticket.reload({
      include: [
        { model: Queue, as: "queue" },
        { model: User, as: "user" },
        { model: Contact, as: "contact" }
      ]
    });

    await UpdateTicketService({
      ticketData: { status: reopenStatus, integrationId: ticket.integrationId },
      ticketId: ticket.id,
      companyId
    });

    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticket,
      ticketId: ticket.id
    });

    io.to(ticket.status).emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket,
      ticketId: ticket.id
    });
  }

  const whatsapp = await ShowWhatsAppService(
    wbot?.id || ticket.whatsappId,
    companyId
  );

  // DEBUG - Verificar configurações de fluxo
  flowDebug(
    `[FLOW-DEBUG] Configurações de fluxo - flowIdNotPhrase: ${whatsapp.flowIdNotPhrase}, flowIdWelcome: ${whatsapp.flowIdWelcome}`
  );

  // *** PRIORIDADE MÁXIMA: CAMPANHAS SEMPRE SÃO VERIFICADAS PRIMEIRO ***
  flowDebug(
    `[CAMPANHAS] Verificando campanhas para: "${body}" na conexão ${whatsapp.id} (${whatsapp.name})`
  );

  try {
    // Buscar campanhas ativas da empresa
    const activeCampaigns = await FlowCampaignModel.findAll({
      where: {
        companyId: ticket.companyId,
        status: true
      }
    });

    flowDebug(
      `[CAMPANHAS] ${activeCampaigns.length} campanhas ativas encontradas`
    );

    // ALTERAÇÃO PRINCIPAL: Filtrar campanhas que incluem esta conexão WhatsApp específica
    const campaignsForThisWhatsapp = activeCampaigns.filter(campaign => {
      try {
        const whatsappIds = campaign.whatsappIds || [];
        // Se nenhuma conexão estiver vinculada, a campanha vale para todas
        const includes =
          !whatsappIds || whatsappIds.length === 0
            ? true
            : whatsappIds.includes(whatsapp.id);

        if (includes) {
          flowDebug(
            `[CAMPANHAS] Campanha "${campaign.name}" (ID: ${campaign.id}) ${
              !whatsappIds || whatsappIds.length === 0
                ? "sem conexão vinculada (aplica a todas)"
                : `inclui conexão ${whatsapp.id}`
            }`
          );
        }

        return includes;
      } catch (error) {
        console.error(
          `[CAMPANHAS] Erro ao verificar campanha ${campaign.id}:`,
          error
        );
        return false;
      }
    });

    flowDebug(
      `[CAMPANHAS] ${campaignsForThisWhatsapp.length} campanhas aplicáveis para conexão ${whatsapp.id}`
    );

    // Buscar tags do contato para filtragem por tag
    let contactTagIds: number[] = [];
    try {
      const contactTags = await ContactTag.findAll({
        where: { contactId: contact.id }
      });
      contactTagIds = contactTags.map(ct => ct.tagId);
    } catch (err) {
      console.error("[CAMPANHAS] Erro ao buscar tags do contato:", err);
    }

    // Verificar se alguma campanha faz match com a mensagem E com as tags do contato
    const matchingCampaign = campaignsForThisWhatsapp.find(campaign => {
      try {
        if (!campaign.status) {
          return false;
        }

        // Verificar tags do contato (se a campanha tiver tags configuradas)
        if (!campaign.matchesContactTags(contactTagIds)) {
          return false;
        }

        // Usar novo método que considera a conexão específica
        const matches = campaign.matchesMessage(body, whatsapp.id);

        if (matches) {
          flowDebug(
            `[CAMPANHAS] ✅ MATCH encontrado! Campanha "${campaign.name}" (ID: ${campaign.id}) para mensagem: "${body}"`
          );
        }

        return matches;
      } catch (error) {
        console.error(
          `[CAMPANHAS] Erro ao verificar match da campanha ${campaign.id}:`,
          error
        );
        return false;
      }
    });

    if (matchingCampaign) {
      flowDebug(
        `[CAMPANHAS] 🚀 EXECUTANDO FLUXO! Campanha: ${matchingCampaign.name} (ID: ${matchingCampaign.id}) | Fluxo: ${matchingCampaign.flowId} | Conexão: ${whatsapp.id} | Ticket: ${ticket.id}`
      );

      // ✅ MARCAR QUE CAMPANHA FOI EXECUTADA NO CACHE
      if (messageId) {
        await cacheLayer.set(cacheKey, "300"); // 5 minutos de cache
      }

      // Verificar se pode disparar campanha (não está em outro fluxo)
      if (msg && ticket.flowWebhook && ticket.lastFlowId) {
        flowDebug(
          `[CAMPANHAS] ⚠️ Ticket ${ticket.id} já em fluxo ativo (lastFlowId: ${ticket.lastFlowId}), aguardando...`
        );
        return false;
      }

      // *** IMPORTANTE: LIMPAR FLUXO ANTERIOR ANTES DE EXECUTAR CAMPANHA ***
      flowDebug(
        `[CAMPANHAS] 🧹 Limpando fluxo anterior do ticket ${ticket.id}`
      );

      await ticket.update({
        flowWebhook: true, // ✅ IMPORTANTE: Marcar como TRUE imediatamente para evitar execuções simultâneas
        flowStopped: null,
        lastFlowId: null,
        hashFlowId: null,
        dataWebhook: null,
        isBot: true,
        status: ticket.isGroup ? "group" : "pending"
      });

      await ticket.reload();

      // Buscar o fluxo a ser executado
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: matchingCampaign.flowId,
          company_id: companyId,
          active: true
        }
      });

      if (!flow) {
        console.error(
          `[CAMPANHAS] ❌ Fluxo ${matchingCampaign.flowId} não encontrado para empresa ${companyId}`
        );

        // ✅ LIMPAR ESTADO EM CASO DE ERRO
        await ticket.update({
          flowWebhook: false,
          isBot: false
        });

        return false;
      }

      flowDebug(
        `[CAMPANHAS] ✅ Fluxo encontrado: ${flow.name} (ID: ${flow.id})`
      );

      try {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];

        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
          console.error(
            `[CAMPANHAS] ❌ Fluxo ${flow.id} não possui nós válidos`
          );

          // ✅ LIMPAR ESTADO EM CASO DE ERRO
          await ticket.update({
            flowWebhook: false,
            isBot: false
          });

          return false;
        }

        const mountDataContact = {
          number: contact.number,
          name: contact.name,
          email: contact.email
        };

        flowDebug(
          `[CAMPANHAS] 🎯 Iniciando execução do fluxo com dados do contato:`,
          mountDataContact
        );

        // Executar o fluxo
        await ActionsWebhookService(
          whatsapp.id,
          matchingCampaign.flowId,
          ticket.companyId,
          nodes,
          connections,
          resolveFlowEntryNodeId(nodes, connections),
          null,
          "",
          "",
          null,
          ticket.id,
          mountDataContact
        );

        flowDebug(
          `[CAMPANHAS] ✅ SUCESSO! Campanha ${matchingCampaign.id} executada com sucesso na conexão ${whatsapp.id}!`
        );

        return true; // Retorna true indicando que uma campanha foi executada
      } catch (executionError) {
        console.error(
          `[CAMPANHAS] ❌ Erro ao executar fluxo da campanha ${matchingCampaign.id}:`,
          executionError
        );

        // ✅ LIMPAR ESTADO EM CASO DE ERRO
        await ticket.update({
          flowWebhook: false,
          isBot: false,
          lastFlowId: null,
          hashFlowId: null,
          flowStopped: null
        });

        return false;
      }
    }

    flowDebug(
      `[CAMPANHAS] ℹ️ Nenhuma campanha fez match com "${body}" na conexão ${whatsapp.id}`
    );
  } catch (error) {
    console.error("[CAMPANHAS] ❌ Erro geral ao executar campanhas:", error);

    // ✅ LIMPAR ESTADO EM CASO DE ERRO GERAL
    try {
      await ticket.update({
        flowWebhook: false,
        isBot: false,
        lastFlowId: null,
        hashFlowId: null,
        flowStopped: null
      });
    } catch (cleanupError) {
      console.error("[CAMPANHAS] ❌ Erro ao limpar estado do ticket:", cleanupError);
    }
  }

  try {
    const keywordTriggered = await executeFlowBuilderKeywordTrigger({
      msg,
      wbot,
      companyId,
      ticket,
      contact,
      messageBody: body
    });
    if (keywordTriggered) return true;
  } catch (kwErr) {
    console.error("[FLOWBUILDER-KEYWORD] ❌ Erro ao verificar gatilho direto:", kwErr);
  }

  // Se é verificação pós-fluxo (msg = null) e não houve match de campanha, parar aqui
  if (!msg) {
    flowDebug(
      `[FLOW INTEGRATION] Verificação pós-fluxo concluída para ticket ${ticket.id}`
    );
    return false;
  }

  // Contar mensagens do cliente para verificar se é primeira interação
  const messageCount = await Message.count({
    where: {
      ticketId: ticket.id,
      fromMe: false // Apenas mensagens do cliente
    }
  });

  // Verificar se o contato é novo na base (primeira vez que aparece)
  const isNewContact = contact.createdAt && 
    Math.abs(new Date().getTime() - new Date(contact.createdAt).getTime()) < 5000; // 5 segundos de tolerância

  flowDebug(
    `[FIRST CONTACT CHECK] Ticket ${ticket.id} - Mensagens do cliente: ${messageCount}`
  );
  flowDebug(
    `[CONTACT STATUS] Contato ${contact.id} - Novo na base: ${isNewContact}, Criado em: ${contact.createdAt}`
  );

  // Buscar todas as campanhas para verificar se há match (para lógica do flowIdNotPhrase)
  const listPhrase = await FlowCampaignModel.findAll({
    where: {
      companyId: ticket.companyId,
      status: true
    }
  });

  // Função para verificar se tem match com alguma campanha desta conexão específica
  const hasAnyPhraseMatch = (
    listPhrase: any[],
    messageBody: string,
    whatsappId: number
  ): boolean => {
    return listPhrase.some(campaign => {
      try {
        const whatsappIds = campaign.whatsappIds || [];
        // Sem conexão vinculada → aplica para qualquer conexão
        if (whatsappIds.length > 0 && !whatsappIds.includes(whatsappId)) {
          return false;
        }

        return campaign.matchesMessage(messageBody, whatsappId);
      } catch (error) {
        console.error(
          `[PHRASE MATCH] Erro ao verificar campanha ${campaign.id}:`,
          error
        );
        return false;
      }
    });
  };

  // *** FLUXO flowIdNotPhrase: APENAS para contatos NOVOS na primeira mensagem SEM match de campanha ***
  flowDebug(
    `[FLOW-DEBUG] Verificando condições para flowIdNotPhrase:`
  );
  flowDebug(
    `[FLOW-DEBUG] - hasAnyPhraseMatch: ${hasAnyPhraseMatch(listPhrase, body, whatsapp.id)}`
  );
  flowDebug(
    `[FLOW-DEBUG] - whatsapp.flowIdNotPhrase: ${whatsapp.flowIdNotPhrase}`
  );
  flowDebug(
    `[FLOW-DEBUG] - messageCount: ${messageCount}`
  );
  flowDebug(
    `[FLOW-DEBUG] - isNewContact: ${isNewContact}`
  );

  // Evitar reexecutar o fluxo de primeiro contato no mesmo ticket
  const firstContactFlagKey = `first-contact-executed:${ticket.id}`;
  const firstContactAlreadyRan = await cacheLayer.get(firstContactFlagKey);

  // *** FLUXO flowIdWelcome: Para contatos que JÁ EXISTEM na base ***
  let welcomeOrFirstContactFlowExecuted = false;
  if (
    !hasAnyPhraseMatch(listPhrase, body, whatsapp.id) &&
    whatsapp.flowIdWelcome &&
    messageCount === 1 &&
    !isNewContact &&
    !firstContactAlreadyRan
  ) {
    flowDebug(
      `[WELCOME FLOW] 🚀 Iniciando flowIdWelcome (${whatsapp.flowIdWelcome}) - Contato existente na primeira mensagem`
    );

    try {
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: whatsapp.flowIdWelcome,
          company_id: companyId,
          active: true
        }
      });

      if (!flow) {
        console.error(
          `[WELCOME FLOW] ❌ Fluxo flowIdWelcome ${whatsapp.flowIdWelcome} não encontrado`
        );
      } else {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];

        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
          console.error(
            `[WELCOME FLOW] ❌ Fluxo flowIdWelcome ${flow.id} não possui nós válidos`
          );
        } else {
          const mountDataContact = {
            number: contact.number,
            name: contact.name,
            email: contact.email
          };

          await ActionsWebhookService(
            whatsapp.id,
            whatsapp.flowIdWelcome,
            ticket.companyId,
            nodes,
            connections,
            resolveFlowEntryNodeId(nodes, connections),
            null,
            "",
            "",
            null,
            ticket.id,
            mountDataContact
          );

          flowDebug(
            `[WELCOME FLOW] ✅ Fluxo flowIdWelcome executado com sucesso!`
          );

          // Marcar em cache para não reexecutar neste ticket
          await cacheLayer.set(firstContactFlagKey, "1", "EX", 86400);
          welcomeOrFirstContactFlowExecuted = true;
        }
      }
    } catch (error) {
      console.error(
        "[WELCOME FLOW] ❌ Erro ao executar fluxo flowIdWelcome:",
        error
      );
    }
  } else if (
    !hasAnyPhraseMatch(listPhrase, body, whatsapp.id) &&
    whatsapp.flowIdNotPhrase &&
    messageCount === 1 &&
    isNewContact &&
    !firstContactAlreadyRan
  ) {
    flowDebug(
      `[FIRST CONTACT] 🚀 Iniciando flowIdNotPhrase (${whatsapp.flowIdNotPhrase}) - Contato NOVO na primeira mensagem sem match de campanha`
    );

    try {
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: whatsapp.flowIdNotPhrase,
          company_id: companyId,
          active: true
        }
      });

      if (!flow) {
        console.error(
          `[FIRST CONTACT] ❌ Fluxo flowIdNotPhrase ${whatsapp.flowIdNotPhrase} não encontrado`
        );
      } else {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];

        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
          console.error(
            `[FIRST CONTACT] ❌ Fluxo flowIdNotPhrase ${flow.id} não possui nós válidos`
          );
        } else {
          const mountDataContact = {
            number: contact.number,
            name: contact.name,
            email: contact.email
          };

          await ActionsWebhookService(
            whatsapp.id,
            whatsapp.flowIdNotPhrase,
            ticket.companyId,
            nodes,
            connections,
            resolveFlowEntryNodeId(nodes, connections),
            null,
            "",
            "",
            null,
            ticket.id,
            mountDataContact
          );

          flowDebug(
            `[FIRST CONTACT] ✅ Fluxo flowIdNotPhrase executado com sucesso na primeira mensagem!`
          );

          // Marcar em cache para não reexecutar neste ticket
          await cacheLayer.set(firstContactFlagKey, "1", "EX", 86400);
          welcomeOrFirstContactFlowExecuted = true;
        }
      }
    } catch (error) {
      console.error(
        "[FIRST CONTACT] ❌ Erro ao executar fluxo flowIdNotPhrase:",
        error
      );
    }
  } else if (
    !hasAnyPhraseMatch(listPhrase, body, whatsapp.id) &&
    (whatsapp.flowIdNotPhrase || whatsapp.flowIdWelcome) &&
    messageCount > 1
  ) {
    // Limpar flag caso exista, para não interferir em novos tickets
    if (firstContactAlreadyRan) {
      await cacheLayer.del(firstContactFlagKey);
    }

    // ✅ CORREÇÃO: Re-disparar fluxo quando não há fluxo ativo nem modo IA
    // Isso permite que o Agente de IA seja alcançado mesmo em mensagens subsequentes
    await ticket.reload();
    const currentDataWebhook = ticket.dataWebhook as any;
    const isCurrentlyInAIMode = currentDataWebhook?.type === "openai" || currentDataWebhook?.type === "gemini" || currentDataWebhook?.type === "aiAgent";
    const hasActiveFlow = ticket.flowWebhook || ticket.lastFlowId || ticket.flowStopped;

    if (isCurrentlyInAIMode && ticket.useIntegration) {
      flowDebug(
        `[FLOW SKIP] ℹ️ Ticket ${ticket.id} está em modo IA (${currentDataWebhook.type}) - deixando AI handler processar`
      );
    } else if (!hasActiveFlow && (ticket.amountUsedBotQueues || 0) === 0) {
      flowDebug(
        `[FLOW RE-TRIGGER] 🔄 Ticket ${ticket.id} sem fluxo ativo e sem modo IA - re-disparando fluxo (messageCount: ${messageCount})`
      );

      const flowIdToUse = (!isNewContact && whatsapp.flowIdWelcome)
        ? whatsapp.flowIdWelcome
        : (whatsapp.flowIdNotPhrase || whatsapp.flowIdWelcome);

      try {
        const flow = await FlowBuilderModel.findOne({
          where: {
            id: flowIdToUse,
            company_id: companyId,
            active: true
          }
        });

        if (flow) {
          const nodes: INodes[] = flow.flow["nodes"];
          const connections: IConnections[] = flow.flow["connections"];

          if (nodes && Array.isArray(nodes) && nodes.length > 0) {
            const mountDataContact = {
              number: contact.number,
              name: contact.name,
              email: contact.email
            };

            await ActionsWebhookService(
              whatsapp.id,
              flowIdToUse,
              ticket.companyId,
              nodes,
              connections,
              resolveFlowEntryNodeId(nodes, connections),
              null,
              "",
              "",
              null,
              ticket.id,
              mountDataContact
            );

            flowDebug(
              `[FLOW RE-TRIGGER] ✅ Fluxo ${flowIdToUse} re-executado com sucesso para ticket ${ticket.id}`
            );
            welcomeOrFirstContactFlowExecuted = true;
          }
        } else {
          flowDebug(
            `[FLOW RE-TRIGGER] ❌ Fluxo ${flowIdToUse} não encontrado ou inativo`
          );
        }
      } catch (error) {
        console.error(
          `[FLOW RE-TRIGGER] ❌ Erro ao re-executar fluxo:`, error
        );
      }
    } else {
      flowDebug(
        `[FLOW SKIP] ℹ️ Ticket ${ticket.id} tem fluxo ativo (flowWebhook=${ticket.flowWebhook}, lastFlowId=${ticket.lastFlowId}) - não re-disparando`
      );
    }
  }

  // *** FLUXOS WEBHOOK EXISTENTES (lógica original) ***
  // ✅ CORREÇÃO: Se acabamos de executar o welcome/firstContact flow, NÃO reprocessar
  // a mesma mensagem como pressKey no fluxo interrompido
  if (welcomeOrFirstContactFlowExecuted) {
    logger.debug(`[FLOW CHECK] ⏭️ Welcome/FirstContact flow acabou de ser executado - pulando reprocessamento da mesma mensagem`);
    return false;
  }

  await ticket.reload();
  logger.debug(`[FLOW CHECK] ========== VERIFICANDO SE DEVE CONTINUAR FLUXO ==========`);
  logger.debug(`[FLOW CHECK] Ticket ID: ${ticket.id}`);
  logger.debug(`[FLOW CHECK] flowWebhook: ${ticket.flowWebhook}`);
  logger.debug(`[FLOW CHECK] hashFlowId: ${ticket.hashFlowId}`);
  logger.debug(`[FLOW CHECK] lastFlowId: ${ticket.lastFlowId}`);
  logger.debug(`[FLOW CHECK] flowStopped: ${ticket.flowStopped}`);
  logger.debug(`[FLOW CHECK] Condição (flowWebhook && hashFlowId): ${!!(ticket.flowWebhook && ticket.hashFlowId)}`);

  if (ticket.flowWebhook && ticket.hashFlowId) {
    logger.info(
      `[FLOW WEBHOOK] ========== PROCESSANDO FLUXO WEBHOOK EXISTENTE ==========`
    );
    logger.info(`[FLOW WEBHOOK] Ticket ID: ${ticket.id}`);
    logger.info(`[FLOW WEBHOOK] flowWebhook: ${ticket.flowWebhook}`);
    logger.info(`[FLOW WEBHOOK] hashFlowId: ${ticket.hashFlowId}`);

    // Validação para evitar erro de hash_id undefined
    if (!ticket.hashFlowId) {
      logger.error(
        `[FLOW WEBHOOK] ❌ Erro: ticket.hashFlowId é undefined para ticket ${ticket.id}`
      );
      return false;
    }

    try {
      const webhook = await WebhookModel.findOne({
        where: {
          company_id: ticket.companyId,
          hash_id: ticket.hashFlowId
        }
      });

      if (webhook && webhook.config["details"]) {
        // ✅ CRÍTICO: Só processar se a mensagem for do USUÁRIO, não do BOT
        if (msg && msg.key.fromMe) {
          logger.info(`[FLOW WEBHOOK] ⚠️ Mensagem é do bot (fromMe=true) - IGNORANDO para evitar loop`);
          logger.info(`[FLOW WEBHOOK] Aguardando resposta do USUÁRIO para ticket ${ticket.id}`);
          return false;
        }

        logger.info(
          `[FLOW WEBHOOK] ========== WEBHOOK ENCONTRADO ==========`
        );
        logger.info(`[FLOW WEBHOOK] Nome: ${webhook.name || "sem nome"}`);
        logger.info(`[FLOW WEBHOOK] Ticket ${ticket.id}, Mensagem: "${body}"`);

        const flow = await FlowBuilderModel.findOne({
          where: {
            id: webhook.config["details"].idFlow,
            company_id: companyId,
            active: true
          }
        });

        if (flow) {
          const nodes: INodes[] = flow.flow["nodes"];
          const connections: IConnections[] = flow.flow["connections"];

          await ActionsWebhookService(
            whatsapp.id,
            webhook.config["details"].idFlow,
            ticket.companyId,
            nodes,
            connections,
            ticket.lastFlowId,
            ticket.dataWebhook,
            webhook.config["details"],
            ticket.hashFlowId,
            body,
            ticket.id
          );

          logger.info("[FLOW WEBHOOK] ✅ Fluxo webhook executado!");
        } else {
          logger.error(
            `[FLOW WEBHOOK] ❌ Fluxo ${webhook.config["details"].idFlow} não encontrado`
          );
        }
      } else if (ticket.flowStopped && ticket.lastFlowId) {
        // ✅ CRÍTICO: Só processar se a mensagem for do USUÁRIO, não do BOT
        if (msg && msg.key.fromMe) {
          logger.debug(`[FLOW STOPPED] ⚠️ Mensagem é do bot (fromMe=true) - IGNORANDO para evitar loop`);
          logger.debug(`[FLOW STOPPED] Aguardando resposta do USUÁRIO para ticket ${ticket.id}`);
          return false;
        }

        // Fluxo interrompido
        logger.info(
          `[FLOW STOPPED] ========== CONTINUANDO FLUXO INTERROMPIDO ==========`
        );
        logger.debug(`[FLOW STOPPED] Ticket ${ticket.id}, FlowId: ${ticket.flowStopped}`);
        logger.debug(`[FLOW STOPPED] LastFlowId: ${ticket.lastFlowId}`);
        logger.debug(`[FLOW STOPPED] Mensagem do usuário: "${body}"`);

        const flow = await FlowBuilderModel.findOne({
          where: {
            id: ticket.flowStopped,
            company_id: companyId,
            active: true
          }
        });

        if (!flow) {
          // Fluxo desativado - limpar estado
          logger.warn(`[FLOW STOPPED] Fluxo ${ticket.flowStopped} inativo - limpando ticket ${ticket.id}`);
          await ticket.update({
            flowStopped: null,
            lastFlowId: null,
            flowWebhook: false,
            hashFlowId: null,
            dataWebhook: null
          });
        } else {
          const nodes: INodes[] = flow.flow["nodes"];
          const connections: IConnections[] = flow.flow["connections"];

          const mountDataContact = {
            number: contact.number,
            name: contact.name,
            email: contact.email
          };

          logger.debug(`[FLOW STOPPED] Chamando ActionsWebhookService com pressKey: "${body}"`);

          await ActionsWebhookService(
            whatsapp.id,
            parseInt(ticket.flowStopped),
            ticket.companyId,
            nodes,
            connections,
            ticket.lastFlowId,
            null,
            "",
            "",
            body,
            ticket.id,
            mountDataContact
          );

          logger.debug("[FLOW STOPPED] ✅ Fluxo interrompido continuado!");
          return true;
        }
      }
    } catch (error) {
      logger.error(
        "[FLOW WEBHOOK] ❌ Erro ao processar fluxo webhook:",
        error
      );
    }
  } else {
    logger.warn(`[FLOW CHECK] ❌ CONDIÇÃO NÃO ATENDIDA - Fluxo não será continuado`);
    logger.warn(`[FLOW CHECK] Motivo: flowWebhook=${ticket.flowWebhook}, hashFlowId=${ticket.hashFlowId || 'null'}`);
    
    // Se tem flowStopped e lastFlowId mas não tem hashFlowId ou flowWebhook, pode ser um problema
    if (ticket.flowStopped && ticket.lastFlowId) {
      logger.error(`[FLOW CHECK] ⚠️ PROBLEMA DETECTADO: Ticket tem flowStopped=${ticket.flowStopped} e lastFlowId=${ticket.lastFlowId}`);
      logger.error(`[FLOW CHECK] mas flowWebhook=${ticket.flowWebhook} e hashFlowId=${ticket.hashFlowId || 'null'}`);
      logger.error(`[FLOW CHECK] Isso indica que o ticket não foi salvo corretamente após enviar o menu!`);
    }
  }

  logger.info(
    `[FLOW INTEGRATION] Processamento concluído para ticket ${ticket.id} - conexão ${whatsapp.id}`
  );
  return false;
};

export const handleMessageIntegration = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  queueIntegration: QueueIntegrations,
  ticket: Ticket
): Promise<void> => {
  const msgType = getTypeMessage(msg);

  // REGRA PARA DESABILITAR O BOT PARA ALGUM CONTATO
  if (ticket?.contact?.disableBot) {
    return;
  }

  if (queueIntegration.type === "n8n" || queueIntegration.type === "webhook") {
    if (queueIntegration?.urlN8N) {
      // Extrai dados úteis da mensagem para o n8n consumir diretamente
      const rawMsg: any = msg ? JSON.parse(JSON.stringify(msg)) : {};
      const remoteJid: string = rawMsg?.key?.remoteJid || "";
      const isLidJid = remoteJid.includes("@lid");
      // Só extrai número do JID se NÃO for @lid (LID é identificador interno do Meta,
      // não é um MSISDN — enviar para ele causa ERR_CHECK_NUMBER no /api/messages/send).
      const numberFromJid =
        remoteJid && !isLidJid
          ? remoteJid.split("@")[0].split(":")[0]
          : null;

      // ✅ Fallbacks a partir do contato/ticket e da última mensagem do banco,
      // garantindo que contactNumber/contactName/messageText nunca cheguem nulos.
      let contact: Contact | null = (ticket as any).contact || null;
      if (!contact && ticket.contactId) {
        try {
          contact = await Contact.findByPk(ticket.contactId);
        } catch (e: any) {
          logger.warn(`[N8N] Falha ao carregar contato: ${e?.message}`);
        }
      }

      // Preferir o number do contato (MSISDN real) sobre o JID, justamente para
      // evitar enviar LID quando o WhatsApp entrega a mensagem em formato @lid.
      const contactNumber = contact?.number || numberFromJid || null;
      const contactName = rawMsg?.pushName || contact?.name || null;

      let messageText =
        rawMsg?.message?.conversation ||
        rawMsg?.message?.extendedTextMessage?.text ||
        rawMsg?.message?.imageMessage?.caption ||
        rawMsg?.message?.videoMessage?.caption ||
        rawMsg?.message?.buttonsResponseMessage?.selectedDisplayText ||
        rawMsg?.message?.listResponseMessage?.title ||
        "";
      let messageType = rawMsg?.message
        ? Object.keys(rawMsg.message)[0]
        : null;

      if (!messageText || !messageType) {
        try {
          const lastDbMessage = await Message.findOne({
            where: { ticketId: ticket.id, fromMe: false },
            order: [["createdAt", "DESC"]]
          });
          if (!messageText && lastDbMessage?.body) {
            messageText = lastDbMessage.body;
          }
          if (!messageType && lastDbMessage?.mediaType) {
            messageType = lastDbMessage.mediaType;
          }
        } catch (e: any) {
          logger.warn(`[N8N] Falha ao buscar última mensagem: ${e?.message}`);
        }
      }

      const integrationPayload = {
        ticketId: ticket.id,
        companyId: ticket.companyId,
        integrationId: queueIntegration.id,
        contactNumber,
        contactName,
        fromMe: !!rawMsg?.key?.fromMe,
        messageText,
        messageType,
        rawMsg,
        _integrationConfig: {
          enableTransfer: queueIntegration.enableTransfer,
          transferQueueId: queueIntegration.transferQueueId,
          transferUserId: queueIntegration.transferUserId,
          queueIdAssign: queueIntegration.queueIdAssign,
          whatsappId: queueIntegration.whatsappId ?? ticket.whatsappId ?? null,
          userIdAssign: queueIntegration.userIdAssign,
          enableCloseTicket: queueIntegration.enableCloseTicket,
          closeTicketMessage: queueIntegration.closeTicketMessage,
          enableOpenTicket: queueIntegration.enableOpenTicket,
          openTicketQueueId: queueIntegration.openTicketQueueId,
          openTicketUserId: queueIntegration.openTicketUserId,
          openTicketMessage: queueIntegration.openTicketMessage,
          ticketId: ticket.id,
          companyId: ticket.companyId,
        }
      };

      logger.info(
        `[N8N] payload ticket=${ticket.id} number=${contactNumber} name=${contactName} type=${messageType} textLen=${(messageText || "").length}`
      );

      try {
        const n8nResp = await axios.post(
          queueIntegration.urlN8N,
          integrationPayload,
          {
            headers: { "Content-Type": "application/json" },
            timeout: 30000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            validateStatus: () => true
          }
        );
        logger.info(
          `[N8N] POST ${queueIntegration.urlN8N} -> status ${n8nResp.status} ticket=${ticket.id}`
        );
        if (n8nResp.status >= 400) {
          logger.error(
            `[N8N] Webhook respondeu erro ${n8nResp.status}: ${JSON.stringify(
              n8nResp.data
            ).slice(0, 500)}`
          );
        }
      } catch (error: any) {
        logger.error(
          `[N8N] Falha ao chamar webhook ${queueIntegration.urlN8N}: ${error?.message}`
        );
      }
    } else {
      logger.warn(
        `[N8N] Integração ${queueIntegration.id} sem urlN8N configurada — POST ignorado.`
      );
    }
  } else if (queueIntegration.type === "dialogflow") {
    let inputAudio: string | undefined;

    if (msgType === "audioMessage") {
      let filename = `${msg.messageTimestamp}.ogg`;
      readFile(
        join(
          __dirname,
          "..",
          "..",
          "..",
          "public",
          `company${companyId}`,
          filename
        ),
        "base64",
        (err, data) => {
          inputAudio = data;
          if (err) {
            logger.error(err);
          }
        }
      );
    } else {
      inputAudio = undefined;
    }

    const debouncedSentMessage = debounce(
      async () => {
        await sendDialogflowAwswer(
          wbot,
          ticket,
           msg as any,
          ticket.contact,
          inputAudio,
          companyId,
          queueIntegration
        );
      },
      500,
      `${ticket.id}:dialogflow`
    );
    debouncedSentMessage();
  } else if (queueIntegration.type === "typebot") {
    // await typebots(ticket, msg, wbot, queueIntegration);
    await typebotListener({ ticket, msg, wbot, typebot: queueIntegration });
  } else if (queueIntegration.type === "flowbuilder") {
    const contact = await ShowContactService(
      ticket.contactId,
      ticket.companyId
    );
    await flowbuilderIntegration(msg, wbot, companyId, queueIntegration, ticket, contact, null, null);
  }
};

const flowBuilderQueue = async (
  ticket: Ticket,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  whatsapp: Whatsapp,
  companyId: number,
  contact: Contact,
  isFirstMsg: Ticket
) => {
  // Extrai resposta interativa (nativeFlow/buttons/list) com prioridade
  let body: string;
  try {
    const irm = (msg.message as any)?.interactiveResponseMessage;
    if (irm?.nativeFlowResponseMessage?.paramsJson) {
      const p = JSON.parse(irm.nativeFlowResponseMessage.paramsJson);
      body = p?.id || p?.display_text || getBodyMessage(msg);
      logger.debug(`[FLOW-INTERACTIVE] handleFlowWebhook - resposta nativeFlow: "${body}"`);
    } else {
      body = msg?.message?.buttonsResponseMessage?.selectedButtonId
        || msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId
        || getBodyMessage(msg);
    }
  } catch {
    body = getBodyMessage(msg);
  }

  const flow = await FlowBuilderModel.findOne({
    where: {
      id: ticket.flowStopped,
      company_id: ticket.companyId,
      active: true
    }
  });

  if (!flow) {
    logger.warn(`[FLOW INPUT] Fluxo ${ticket.flowStopped} inativo ou não encontrado para ticket ${ticket.id} - limpando estado`);
    await ticket.update({
      flowStopped: null,
      lastFlowId: null,
      flowWebhook: false,
      hashFlowId: null,
      dataWebhook: null
    });
    return;
  }

  const mountDataContact = {
    number: contact.number,
    name: contact.name,
    email: contact.email
  };

  const nodes: INodes[] = flow.flow["nodes"];
  const connections: IConnections[] = flow.flow["connections"];

  if (!ticket.lastFlowId) {
    return;
  }

  await ActionsWebhookService(
    whatsapp.id,
    parseInt(ticket.flowStopped),
    ticket.companyId,
    nodes,
    connections,
    ticket.lastFlowId,
    null,
    "",
    "",
    body,
    ticket.id,
    mountDataContact,
    null,
    msg
  );

  //const integrations = await ShowQueueIntegrationService(whatsapp.integrationId, companyId);
  //await handleMessageIntegration(msg, wbot, companyId, integrations, ticket, contact, isFirstMsg)
};

const checkTemporaryAI = async (
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  msgContact: IMe,
  mediaSent: Message,
  ticketTraking: TicketTraking,
  msg: proto.IWebMessageInfo
) => {
  // Verificar se é modo temporário com flowContinuation
  const dataWebhook = ticket.dataWebhook as any;
  const flowContinuation = dataWebhook?.flowContinuation;

  // ✅ CORRIGIDO: IA temporária deve parar quando ticket é aceito (status = "open" ou isBot = false)
  if ((!flowContinuation || !ticket.useIntegration || !ticket.flowStopped || !ticket.lastFlowId) && ticket.status !== "open" && ticket.isBot !== false) {
    return false;
  }

  // Verificar se é node IA em modo temporário
  const isAIMode = dataWebhook?.type === "openai" || dataWebhook?.type === "gemini" || dataWebhook?.type === "aiAgent";
  if (!isAIMode || dataWebhook?.mode !== "temporary") {
    return false;
  }

  try {
    const aiSettings = {
      ...dataWebhook.settings,
      provider: dataWebhook.type === "aiAgent"
        ? (dataWebhook.settings?.model?.startsWith('gpt-') || dataWebhook.settings?.model?.startsWith('o') ? 'openai' : 'gemini')
        : dataWebhook.type
    };

    // ✅ SE FOR PRIMEIRA RESPOSTA, REMOVER FLAG
    if (dataWebhook.awaitingUserResponse) {
      await ticket.update({
        dataWebhook: {
          ...dataWebhook,
          awaitingUserResponse: false
        }
      });
    }

    // ✅ PROCESSAR ATRAVÉS DA IA
    await handleOpenAiFlow(
      aiSettings,
      msg,
      wbot,
      ticket,
      contact,
      mediaSent,
      ticketTraking
    );

    return true;

  } catch (error) {
    logger.error("[AI SERVICE] Erro ao processar IA temporário:", error);
    return false;
  }
};

const handleOpenAi = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking,
  promptOverride?: any
): Promise<void> => { return _handleOpenAi(msg, wbot, ticket, contact, mediaSent, ticketTraking, promptOverride); };

// ===== Helpers para envio de mídias da Base de Conhecimento via IA =====
const buildKnowledgeContext = (knowledgeItems: PromptKnowledgeBase[]): string => {
  if (!knowledgeItems || knowledgeItems.length === 0) return "";
  const textParts: string[] = [];
  const mediaParts: string[] = [];
  for (const item of knowledgeItems) {
    if (item.mediaUrl) {
      mediaParts.push(
        `- id=${item.id} | nome="${item.originalName || item.name}" | tipo=${item.type}${item.content ? ` | descrição: ${String(item.content).slice(0, 200)}` : ""}`
      );
    } else {
      textParts.push(`[${item.name}] (${item.type}):\n${item.content || ""}`);
    }
  }
  let ctx = "\n\nBASE DE CONHECIMENTO - Use estas informações como referência para responder:\n";
  if (textParts.length) ctx += textParts.join("\n\n---\n\n");
  if (mediaParts.length) {
    ctx += `\n\nARQUIVOS DISPONÍVEIS NA BASE (vídeos, imagens, áudios, documentos):\n${mediaParts.join("\n")}\n\nQuando o cliente pedir/precisar de algum desses arquivos (ou quando o conteúdo do arquivo for a melhor resposta para a dúvida do cliente), você DEVE incluir na sua resposta o marcador exato:\n[ENVIAR_ARQUIVO:<id>]\nUse o id correto da lista acima. Pode incluir mais de um marcador se precisar enviar vários arquivos. O sistema removerá os marcadores e enviará os arquivos automaticamente para o cliente. Não cole links nem invente caminhos.\n`;
  }
  ctx += "\nIMPORTANTE: Baseie suas respostas nas informações da base de conhecimento quando relevante. Se a pergunta não estiver coberta pela base, responda normalmente.\n";
  return ctx;
};

const sendKnowledgeMediaFromResponse = async (
  response: string,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking,
  publicFolder: string,
  promptId: number
): Promise<string> => {
  if (!response) return response;
  const regex = /\[ENVIAR_ARQUIVO:\s*(\d+)\s*\]/gi;
  const ids = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(response)) !== null) ids.add(Number(m[1]));
  if (ids.size === 0) return response;
  for (const id of ids) {
    try {
      const item = await PromptKnowledgeBase.findOne({
        where: { id, promptId, companyId: ticket.companyId, active: true }
      });
      if (!item || !item.mediaUrl) {
        logger.warn(`[AI MEDIA] Arquivo id=${id} não encontrado na base do prompt ${promptId}`);
        continue;
      }
      const filePath = `${publicFolder}/${item.mediaUrl}`;
      if (!fs.existsSync(filePath)) {
        logger.warn(`[AI MEDIA] Arquivo físico não encontrado: ${filePath}`);
        continue;
      }
      const opts = await getMessageOptions(
        item.originalName || item.mediaUrl,
        filePath,
        String(ticket.companyId),
        ""
      );
      if (!opts) continue;
      const sent = await wbot.sendMessage(msg_remoteJid(ticket), { ...opts });
      await verifyMediaMessage(sent!, ticket, contact, ticketTraking, false, false, wbot);
    } catch (e) {
      logger.error(`[AI MEDIA] Falha ao enviar arquivo id=${id}:`, e);
    }
  }
  return response.replace(regex, "").replace(/\n{3,}/g, "\n\n").trim();
};

const msg_remoteJid = (ticket: Ticket): string => {
  // Reaproveita getJidOf quando disponível, caso contrário monta a partir do contato
  try { return getJidOf(ticket); } catch { return `${ticket.contact?.number}@s.whatsapp.net`; }
};

// ✅ Dedup de respostas do agente de IA por wid de mensagem (evita audios duplicados)
const aiHandledMessageIds = new Set<string>();
const markAiHandled = (msg: proto.IWebMessageInfo): boolean => {
  const id = msg?.key?.id;
  if (!id) return true;
  if (aiHandledMessageIds.has(id)) return false;
  aiHandledMessageIds.add(id);
  // Limpa entradas antigas para não vazar memória
  setTimeout(() => aiHandledMessageIds.delete(id), 5 * 60 * 1000);
  return true;
};

// ✅ Envia o áudio TTS convertendo MP3 -> OGG/Opus para garantir compatibilidade com WhatsApp Mobile
const sendAiTtsAudio = async (
  wbot: any,
  remoteJid: string,
  mp3Path: string,
  publicFolder: string,
  asPTT: boolean
) => {
  let audioToSend = mp3Path;
  let audioMime = "audio/mpeg";
  try {
    const { convertToMobileAudio } = await import("../../utils/AudioUtils");
    audioToSend = await convertToMobileAudio(mp3Path, publicFolder);
    audioMime = "audio/ogg; codecs=opus";
  } catch (convErr) {
    logger.error("[AI TTS] Falha ao converter para OGG/Opus, enviando MP3:", convErr);
  }
  const sent = await wbot.sendMessage(remoteJid, {
    audio: { url: audioToSend },
    mimetype: audioMime,
    ptt: asPTT
  });
  return { sent, audioToSend, mp3Path };
};

const _handleOpenAi = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking,
  promptOverride?: any
): Promise<void> => {

  // REGRA PARA DESABILITAR O BOT PARA ALGUM CONTATO
  if (contact.disableBot) {
    return;
  }
  const bodyMessage = getBodyMessage(msg);
  if (!bodyMessage) return;
  // Cliente respondeu — cancela qualquer lembrete de inatividade pendente
  try {
    const { cancelInactivityReminder } = await import("../../helpers/InactivityReminder");
    cancelInactivityReminder(ticket.id);
  } catch (e) { /* noop */ }
  // ✅ Garantir uma única execução por mensagem recebida
  if (!markAiHandled(msg)) {
    logger.info(`[handleOpenAi] Mensagem ${msg.key.id} já processada pelo agente - ignorando duplicata`);
    return;
  }
  // ✅ Permite usar um prompt vindo da FILA (override) com a MESMA lógica da conexão
  let prompt: any = promptOverride;
  if (!prompt) {
    const wppData = await ShowWhatsAppService(wbot.id || ticket.whatsappId, ticket.companyId);
    prompt = (wppData as any).prompt;
  }


  if (!prompt) return;

  // ✅ Verificar se o agente está ativo
  if (prompt.active === false) {
    logger.info(`[handleOpenAi] Agente desativado (prompt ${prompt.id}) - ticket ${ticket.id}`);
    return;
  }

  if (msg.messageStubType) return;

  // ✅ Verificação de turno (horário de atendimento) também no caminho legado
  if (prompt.workingHoursEnabled && !isWithinWorkingHours(prompt)) {
    logger.info(`[handleOpenAi] Fora do turno (prompt ${prompt.id}) - ticket ${ticket.id}`);
    if (!isNil(ticket.queueId)) return;
    const outMsg = String(prompt.workingHoursOutOfMessage || "").trim();
    if (outMsg) {
      try {
        const sent = await wbot.sendMessage(msg.key.remoteJid!, { text: `\u200e ${outMsg}` });
        await verifyMessage(sent!, ticket, contact);
      } catch (e: any) {
        logger.error(`[handleOpenAi] Falha ao enviar mensagem fora-do-turno: ${e?.message}`);
      }
    }
    return;
  }

  // ✅ Se acabamos de enviar a "Mensagem Inicial" do agente neste ticket,
  // não responder à MESMA mensagem do cliente que disparou a saudação —
  // caso contrário enviaríamos duas mensagens (a inicial + a resposta da IA).
  if (consumeAiInitialSent(ticket.id)) {
    logger.info(`[handleOpenAi] Pulando resposta da IA após mensagem inicial - ticket ${ticket.id}`);
    return;
  }

  // ✅ Se o agente tem ferramentas ativas (Notificar Humano, HTTP, Agendamento, Abrir Atendimento),
  // delegamos para o handleOpenAiFlow que sabe executar function-calling. O caminho legado deste
  // _handleOpenAi usa chat.completions sem tools e portanto não dispara notify_human etc.
  const hasAgentTools =
    prompt.toolNotifyHuman === true ||
    prompt.toolHttpRequest === true ||
    prompt.toolScheduling === true ||
    prompt.toolOpenTicket === true;
  if (hasAgentTools) {
    const _modelName = (prompt.aiModel || prompt.model || "gpt-4.1-mini").toString();
    const _isGemini = /^gemini/i.test(_modelName);
    const aiSettings: any = {
      ...((prompt as any).dataValues || prompt),
      id: (prompt as any).id ?? (ticket as any).promptId,
      promptId: (prompt as any).id ?? (ticket as any).promptId,
      provider: _isGemini ? "gemini" : "openai",
      model: _modelName
    };
    try {
      await handleOpenAiFlow(aiSettings, msg, wbot, ticket, contact, mediaSent, ticketTraking);
    } catch (err) {
      logger.error("[handleOpenAi] Falha ao delegar para handleOpenAiFlow com tools:", err);
    }
    return;
  }

  if (prompt.allowTransfer !== false) {
    const directTransfer = await maybeTransferByExplicitQueueRequest(
      bodyMessage,
      ticket,
      contact,
      wbot,
      msg.key.remoteJid!,
      prompt.transferMessage || "Entendi! Vou transferir você para o setor solicitado. Aguarde um momento!",
      resolvePromptTransferQueueId(prompt, ticket)
    );
    if (directTransfer) return;
  }

  const publicFolder: string = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "public",
    `company${ticket.companyId}`
  );

  let openai: OpenAI | any;
  // Um cliente por CHAVE, não por atendimento — ver comentário longo em
  // OpenAiService.ts. O array `sessionsOpenAi` só crescia (um cliente por
  // ticket, para sempre), era varrido linearmente a cada mensagem, e cada
  // `new OpenAI()` abria o próprio pool de conexões HTTP.
  openai = obterClienteIA(prompt.apiKey) as SessionOpenAi;

  const messages = (await Message.findAll({
    where: { ticketId: ticket.id },
    // DESC + reverse: `ASC + limit` devolvia as mensagens MAIS ANTIGAS do
    // atendimento, então a IA nunca via o contexto recente. Ver comentário
    // longo em OpenAiService.ts.
    order: [["createdAt", "DESC"]],
    limit: janelaDeHistorico(prompt.maxMessages)
  })).reverse();

  const agora = new Date();
  const currentDateTimeBrasilia = formatDateTimeBrasilia(agora);

  // ✅ Carregar base de conhecimento ativa (mesma lógica do handleAiAgent)
  let knowledgeContext = "";
  try {
    const _kbPromptId = (prompt as any).id || (ticket as any).promptId;
    if (_kbPromptId) {
      const knowledgeItems = await PromptKnowledgeBase.findAll({
        where: { promptId: _kbPromptId, companyId: ticket.companyId, active: true }
      });
      knowledgeContext = buildKnowledgeContext(knowledgeItems);
    }
  } catch (err) {
    logger.warn("[handleOpenAi] Erro ao carregar base de conhecimento:", err);
  }

  // ✅ Construir instrução de idioma
  let languageInstruction = "";
  try {
    const langs = prompt.languages ? JSON.parse(prompt.languages) : ["pt-BR"];
    if (langs.includes("auto")) {
      languageInstruction = "IDIOMA OBRIGATÓRIO: Detecte o idioma da mensagem do cliente e responda SEMPRE no MESMO idioma do cliente.\n";
    } else if (langs.length > 0) {
      const langMap: Record<string, string> = {
        "pt-BR": "Português do Brasil (pt-BR). Use expressões e vocabulário do português brasileiro, NUNCA use português de Portugal.",
        "en-US": "English (US)",
        "es-ES": "Español de España",
        "fr-FR": "Français",
        "de-DE": "Deutsch",
        "it-IT": "Italiano"
      };
      const primaryLang = langMap[langs[0]] || langs[0];
      languageInstruction = `IDIOMA OBRIGATÓRIO: Você DEVE responder SEMPRE e EXCLUSIVAMENTE em ${primaryLang}, INDEPENDENTEMENTE do idioma em que o cliente escreva. NUNCA mude de idioma. Mesmo que o cliente envie mensagens em português, inglês ou qualquer outro idioma, sua resposta DEVE ser em ${primaryLang}.\n`;
      if (langs.length > 1) {
        const allLangs = langs.map((l: string) => langMap[l] || l).join(", ");
        languageInstruction = `IDIOMA OBRIGATÓRIO: Você DEVE responder EXCLUSIVAMENTE em um destes idiomas: ${allLangs}. Idioma preferencial: ${primaryLang}. Se o cliente escrever claramente em outro idioma da lista acima, você pode responder nesse idioma. NUNCA responda em idiomas fora desta lista.\n`;
      }
    }
  } catch (e) {
    languageInstruction = "IMPORTANTE: Responda SEMPRE em Português do Brasil (pt-BR). Use expressões e vocabulário do português brasileiro, NUNCA use português de Portugal.\n";
  }

  // Listar filas da empresa para a IA poder transferir corretamente
  let _connQueueNames = "";
  try {
    const _connQueues = await Queue.findAll({
      where: { companyId: ticket.companyId },
      attributes: ["id", "name"]
    });
    _connQueueNames = _connQueues.map(q => q.name).join(", ");
  } catch (e) { _connQueueNames = ""; }

  const promptSystem = `${languageInstruction}REGRA DE USO DO NOME: O nome do cliente é "${sanitizeName(contact.name || "Amigo(a)")}". Use o nome APENAS na primeira saudação da conversa. Nas mensagens seguintes, NÃO repita o nome — converse de forma natural e humanizada, como uma pessoa real. Só volte a citar o nome em momentos pontuais (encerramento, confirmação importante, chamar atenção). NUNCA comece toda mensagem com "Olá, [nome]" — isso soa robótico.\nCONTINUIDADE: esta é UMA conversa contínua com o mesmo cliente. NUNCA cumprimente de novo ("Olá", "Oi", "Bom dia", "Como posso te ajudar?", "Atendimento ao cliente como posso ajudar?" etc.) depois da primeira mensagem. Mantenha o contexto e o histórico anteriores.\nRESPOSTAS A CONFIRMAÇÕES CURTAS: quando o cliente enviar apenas "ok", "okay", "blz", "beleza", "valeu", "obrigado", "obrigada", "vlw", "tá", "tá bom", "entendi", "certo", "perfeito", "👍" ou "🙏", você DEVE responder com a tag exata [[SILENT]] (e nada mais). NÃO mande "Se precisar de mais alguma coisa..." nem cumprimente de novo. Aguarde o cliente fazer uma nova pergunta para voltar a responder.\nSua resposta deve usar no máximo ${prompt.maxTokens} tokens e cuide para não truncar o final.\n\nSetores/filas disponíveis na empresa: ${_connQueueNames || "(nenhuma cadastrada)"}\nQuando o cliente pedir para falar com um setor/atendente humano (ex: "comercial", "financeiro", "suporte", "atendente"), você DEVE iniciar sua resposta exatamente com o marcador:\n  Ação: Transferir para <NomeExatoDoSetor>\nUse o nome EXATO de um dos setores listados acima. Se o cliente não disser qual setor, escolha o mais adequado pelo contexto, OU pergunte qual setor ele deseja listando os disponíveis. NUNCA invente nomes de setor.\n\n Sempre usa o horário de Brasília (UTC-3). Agora são ${currentDateTimeBrasilia}. Sempre que questionado sobre hora ou data, responda utilizando esse fuso horário e considere o momento exato da solicitação.\n
  ${prompt.prompt}\n${knowledgeContext}`;

  let messagesOpenAi = [];

  if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
    messagesOpenAi = [];
    messagesOpenAi.push({ role: "system", content: promptSystem });
    for (
      let i = 0;
      i < Math.min(prompt.maxMessages, messages.length);
      i++
    ) {
      const message = messages[i];
      if (message.mediaType === "conversation" || message.mediaType === "extendedTextMessage") {
        if (message.fromMe) {
          messagesOpenAi.push({ role: "assistant", content: message.body });
        } else {
          messagesOpenAi.push({ role: "user", content: message.body });
        }
      }
    }
    messagesOpenAi.push({ role: "user", content: bodyMessage! });

    const chat = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: messagesOpenAi,
      max_tokens: prompt.maxTokens,
      temperature: prompt.temperature
    });

    let response = chat.choices[0].message?.content;
    trackTokenUsage(prompt.id, { promptTokens: chat.usage?.prompt_tokens, completionTokens: chat.usage?.completion_tokens, totalTokens: chat.usage?.total_tokens });

    // Detectar transferência: marcador da IA OU intenção em texto natural OU pedido do cliente
    // ✅ Enviar arquivos da Base de Conhecimento solicitados pela IA
    if (response) {
      response = await sendKnowledgeMediaFromResponse(response, wbot, ticket, contact, ticketTraking, publicFolder, prompt.id);
    }
    {
      const transferRegexConn = /A[çc][ãa]o:\s*Transferir(?:\s+para\s+(?:o\s+setor\s+de\s+)?(.+?))?(?:\.|!|\n|$)/i;
      const transferMatchConn = response ? response.match(transferRegexConn) : null;
      // ✅ Só transfere se estiver permitido E o cliente usou uma das palavras-chave configuradas
      const userAsks = matchesTransferKeyword(prompt, bodyMessage || "");
      if (userAsks) {
        const requested = transferMatchConn?.[1]?.trim() || "";
        const combined = `${requested} ${bodyMessage || ""} ${response || ""}`;
        const { queue: tQueue, user: tUser } = await resolveConfiguredTransferTarget(
          prompt,
          ticket,
          combined
        );

        if (tQueue) {
          if (response && transferMatchConn) {
            response = response.replace(transferRegexConn, "").trim();
          }
          const isSameQueueTransfer = Number(tQueue.id) === Number(ticket.queueId) && (!tUser?.id || Number(tUser.id) === Number(ticket.userId));
          const responseBody = stripInvisibleText(response);
          if (isSameQueueTransfer) {
            // Já está na fila correta: ignora a "transferência" e deixa o agente
            // responder normalmente pelo fluxo abaixo (sem frase fixa).
            if (userAsks) {
              try {
                const queueName = tQueue?.name || "";
                const infoMsg = `\u200e Você já está no setor *${queueName}*. Pode seguir me contando como posso te ajudar por aqui! 😉`;
                const sentInfo = await wbot.sendMessage(msg.key.remoteJid!, { text: infoMsg });
                if (sentInfo) await verifyMessage(sentInfo, ticket, contact);
              } catch (e) {
                logger.warn("[handleOpenAi] Falha ao enviar aviso de mesma fila:", e);
              }
              return;
            }
          } else {
            // ✅ Envia a "Mensagem ao transferir" configurada no agente
            // (com fallback), substituindo qualquer texto natural da IA.
            const configuredTransferMsg =
              (prompt.transferMessage || "").toString().trim() ||
              "Estou transferindo você para um atendente. Aguarde um momento!";
            let transferText = configuredTransferMsg;
            try { transferText = formatBody(configuredTransferMsg, ticket); } catch { /* noop */ }
            try {
              const sentMsg = await wbot.sendMessage(msg.key.remoteJid!, { text: `\u200e ${transferText}` });
              await verifyMessage(sentMsg!, ticket, contact);
            } catch (e) { logger.warn("[handleOpenAi] Falha ao enviar transferMessage:", e); }
            const transferred = await applyAiTransfer(ticket, contact, tQueue, tUser);
            if (transferred) return;
          }
        } else {
          logger.warn(`[handleOpenAi] Transferência solicitada mas nenhuma fila válida resolvida - ticket ${ticket.id}`);
        }
      }
    }

    response = stripInvisibleText(response);
    if (!hasVisibleText(response)) {
      logger.warn(`[handleOpenAi] Resposta vazia ignorada - ticket ${ticket.id}`);
      return;
    }

    // ✅ Tag [[SILENT]] = não enviar nada (resposta a "ok", "obrigado" etc.)
    if (response && /\[\[\s*SILENT\s*\]\]/i.test(response)) {
      logger.info(`[handleOpenAi] Resposta SILENT - não enviando mensagem - ticket ${ticket.id}`);
      return;
    }

    // ✅ Sanitiza rótulos de ação que a IA às vezes vaza no texto do cliente
    // (ex: "Ação: Transferir para Suporte", "Action: notify_human").
    if (response) {
      response = response
        .replace(/^\s*(?:[-*•]\s*)?(?:a[cç][aã]o|action|acao)\s*[:：]\s*.*$/gim, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    if (!hasVisibleText(response)) {
      logger.warn(`[handleOpenAi] Resposta vazia após sanitização de rótulos - ticket ${ticket.id}`);
      return;
    }

    // ✅ Determinar modo de resposta
    const responseMode = prompt.responseMode || (prompt.voice === "texto" ? "text" : prompt.voice ? "audio" : "text");
    // "both" = envia texto E áudio juntos (é isso que a tela de configuração
    // do agente promete: "Áudio e Texto" / "Responde com ambos"). Antes esse
    // trecho tratava "both" como "só áudio", diferente de outros pontos do
    // mesmo arquivo — inconsistência que fazia o modo "Áudio e Texto" às
    // vezes não mandar nada de texto.
    const shouldSendAudio = responseMode === "audio" || responseMode === "both";
    const shouldSendText = responseMode === "text" || responseMode === "both";

    // Aplicar delay de resposta configurado no agente
    if (prompt.responseDelay && prompt.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, prompt.responseDelay * 1000));
    }

    if (shouldSendText) {
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: `\u200e ${response!}`
      });
      await verifyMessage(sentMessage!, ticket, contact);
    }

    if (shouldSendAudio && prompt.apiKey) {
      try {
        const { generateOpenAiTTS, isValidOpenAiVoice } = await import("../../helpers/OpenAiTTS");
        const agentVoice = isValidOpenAiVoice(prompt.agentVoice) ? prompt.agentVoice : "nova";
        const fileNameTTS = `${ticket.id}_tts_${Date.now()}`;
        const outputPath = `${publicFolder}/${fileNameTTS}`;
        const mp3Path = await generateOpenAiTTS(
          keepOnlySpecifiedChars(response!),
          outputPath,
          prompt.apiKey,
          agentVoice
        );
        const { sent: sendMessage, audioToSend } = await sendAiTtsAudio(
          wbot,
          msg.key.remoteJid!,
          mp3Path,
          publicFolder,
          prompt.sendAsPTT !== false
        );
        await verifyMediaMessage(sendMessage!, ticket, contact, ticketTraking, false, false, wbot);
        deleteFileSync(mp3Path);
        if (audioToSend !== mp3Path) deleteFileSync(audioToSend);
      } catch (error) {
        logger.error("[handleOpenAi] Erro no TTS, enviando como texto:", error);
        if (!shouldSendText) {
          const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            text: `\u200e ${response!}`
          });
          await verifyMessage(sentMessage!, ticket, contact);
        }
      }
    } else if (!shouldSendText && !shouldSendAudio) {
      // Fallback: enviar como texto
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: `\u200e ${response!}`
      });
      await verifyMessage(sentMessage!, ticket, contact);
    }
  } else if (msg.message?.audioMessage) {
    const mediaUrl = mediaSent!.mediaUrl!.split("/").pop();
    const file = fs.createReadStream(`${publicFolder}/${mediaUrl}`) as any;

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: file,
    });

    messagesOpenAi = [];
    messagesOpenAi.push({ role: "system", content: promptSystem });
    for (
      let i = 0;
      i < Math.min(prompt.maxMessages, messages.length);
      i++
    ) {
      const message = messages[i];
      if (message.mediaType === "conversation" || message.mediaType === "extendedTextMessage") {
        if (message.fromMe) {
          messagesOpenAi.push({ role: "assistant", content: message.body });
        } else {
          messagesOpenAi.push({ role: "user", content: message.body });
        }
      }
    }
    messagesOpenAi.push({ role: "user", content: transcription.text });
    const chat = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: messagesOpenAi,
      max_tokens: prompt.maxTokens,
      temperature: prompt.temperature
    });
    let response = chat.choices[0].message?.content;
    trackTokenUsage(prompt.id, { promptTokens: chat.usage?.prompt_tokens, completionTokens: chat.usage?.completion_tokens, totalTokens: chat.usage?.total_tokens });

    // Detectar transferência também no fluxo de áudio
    if (response) {
      response = await sendKnowledgeMediaFromResponse(response, wbot, ticket, contact, ticketTraking, publicFolder, prompt.id);
    }
    {
      const transferRegexConnA = /A[çc][ãa]o:\s*Transferir(?:\s+para\s+(?:o\s+setor\s+de\s+)?(.+?))?(?:\.|!|\n|$)/i;
      const transferMatchConnA = response ? response.match(transferRegexConnA) : null;
      const userAsksA = matchesTransferKeyword(prompt, transcription.text || "");
      if (userAsksA) {
        const requestedA = transferMatchConnA?.[1]?.trim() || "";
        const combinedA = `${requestedA} ${transcription.text || ""} ${response || ""}`;
        const { queue: tQueueA, user: tUserA } = await resolveConfiguredTransferTarget(
          prompt,
          ticket,
          combinedA
        );
        if (tQueueA) {
          if (response && transferMatchConnA) response = response.replace(transferRegexConnA, "").trim();
          const isSameQueueTransferA = Number(tQueueA.id) === Number(ticket.queueId) && (!tUserA?.id || Number(tUserA.id) === Number(ticket.userId));
          if (isSameQueueTransferA) {
            if (userAsksA) {
              try {
                const queueName = tQueueA?.name || "";
                const infoMsg = `\u200e Você já está no setor *${queueName}*. Pode seguir me contando como posso te ajudar por aqui! 😉`;
                const sentInfo = await wbot.sendMessage(msg.key.remoteJid!, { text: infoMsg });
                if (sentInfo) await verifyMessage(sentInfo, ticket, contact);
              } catch (e) {
                logger.warn("[handleOpenAi audio] Falha ao enviar aviso de mesma fila:", e);
              }
              return;
            }
          } else {
          if (response) {
            try {
              const sentMsg = await wbot.sendMessage(msg.key.remoteJid!, { text: `\u200e ${response}` });
              await verifyMessage(sentMsg!, ticket, contact);
            } catch (e) { logger.warn("[handleOpenAi audio] Falha ao enviar resposta antes da transferência:", e); }
          }
          const transferred = await applyAiTransfer(ticket, contact, tQueueA, tUserA);
          if (transferred) return;
          }
        }
      }
    }
    // ✅ Determinar modo de resposta para áudio transcrito
    const responseModeT = prompt.responseMode || (prompt.voice === "texto" ? "text" : prompt.voice ? "audio" : "text");
    // "both" = envia texto + áudio (mesclado)
    const shouldSendAudioT = responseModeT === "audio" || responseModeT === "both";
    const shouldSendTextT = responseModeT === "text" || responseModeT === "both";

    // Aplicar delay de resposta configurado no agente (áudio transcrito)
    if (prompt.responseDelay && prompt.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, prompt.responseDelay * 1000));
    }

    if (shouldSendTextT) {
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: `\u200e ${response!}`
      });
      await verifyMessage(sentMessage!, ticket, contact);
    }

    if (shouldSendAudioT && prompt.apiKey) {
      try {
        const { generateOpenAiTTS, isValidOpenAiVoice } = await import("../../helpers/OpenAiTTS");
        const agentVoice = isValidOpenAiVoice(prompt.agentVoice) ? prompt.agentVoice : "nova";
        const fileNameTTS = `${ticket.id}_tts_${Date.now()}`;
        const outputPath = `${publicFolder}/${fileNameTTS}`;
        const mp3Path = await generateOpenAiTTS(
          keepOnlySpecifiedChars(response!),
          outputPath,
          prompt.apiKey,
          agentVoice
        );
        const { sent: sendMessage, audioToSend } = await sendAiTtsAudio(
          wbot,
          msg.key.remoteJid!,
          mp3Path,
          publicFolder,
          prompt.sendAsPTT !== false
        );
        await verifyMediaMessage(sendMessage!, ticket, contact, ticketTraking, false, false, wbot);
        deleteFileSync(mp3Path);
        if (audioToSend !== mp3Path) deleteFileSync(audioToSend);
      } catch (error) {
        logger.error("[handleOpenAi] Erro no TTS (áudio transcrito):", error);
        if (!shouldSendTextT) {
          const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
            text: `\u200e ${response!}`
          });
          await verifyMessage(sentMessage!, ticket, contact);
        }
      }
    }
  }
  messagesOpenAi = [];
  // Agenda lembrete de inatividade se o cliente não responder
  try {
    const { scheduleInactivityReminder } = await import("../../helpers/InactivityReminder");
    scheduleInactivityReminder(wbot, ticket, contact, prompt);
  } catch (e) { /* noop */ }
};

// Handler para Agente de IA (queueType: aiAgent) usando promptId do ticket
const handleAiAgent = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent: Message | undefined,
  ticketTraking: TicketTraking
): Promise<void> => {
  if (contact.disableBot) return;

  const bodyMessage = getBodyMessage(msg);
  if (!bodyMessage) return;

  // ✅ Garantir uma única execução por mensagem recebida
  if (!markAiHandled(msg)) {
    logger.info(`[AI AGENT] Mensagem ${msg.key.id} já processada - ignorando duplicata`);
    return;
  }

  try {
    const promptRecord = await ShowPromptService({
      promptId: ticket.promptId,
      companyId: ticket.companyId
    });

    if (!promptRecord) return;

    // ✅ Verificar se o agente está ativo
    if (promptRecord.active === false) {
      logger.info(`[AI AGENT] Agente desativado (prompt ${promptRecord.id}) - ticket ${ticket.id}`);
      return;
    }

    if (msg.messageStubType) return;

    if (promptRecord.workingHoursEnabled && !isWithinWorkingHours(promptRecord)) {
      logger.info(`[AI AGENT] Fora do turno do agente (prompt ${promptRecord.id}) - ticket ${ticket.id}`);
      return;
    }

    if (promptRecord.allowTransfer !== false) {
      const directTransfer = await maybeTransferByExplicitQueueRequest(
        bodyMessage,
        ticket,
        contact,
        wbot,
        msg.key.remoteJid!,
      promptRecord.transferMessage || "Entendi! Vou transferir você para o setor solicitado. Aguarde um momento!",
      resolvePromptTransferQueueId(promptRecord, ticket)
      );
      if (directTransfer) return;
    }

    // ✅ Verificar transferKeywords configuráveis ANTES de chamar a IA
    if (promptRecord.allowTransfer !== false && promptRecord.transferKeywords) {
      const keywords = promptRecord.transferKeywords.split(",").map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
      const lowerBody = bodyMessage.toLowerCase();
      const matchedKeyword = keywords.find(kw => lowerBody.includes(kw));

      if (matchedKeyword) {
        logger.info(`[AI AGENT] Keyword de transferência detectada: "${matchedKeyword}" - ticket ${ticket.id}`);

        const configuredTransferMsg = promptRecord.transferMessage || "Entendi! Vou transferir você para um atendente. Aguarde um momento!";
        let transferMsg = configuredTransferMsg;
        try { transferMsg = formatBody(configuredTransferMsg, ticket); } catch { /* noop */ }

        if (promptRecord.responseDelay && promptRecord.responseDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, promptRecord.responseDelay * 1000));
        }

        const sentMsg = await wbot.sendMessage(msg.key.remoteJid!, {
          text: `\u200e ${transferMsg}`
        });
        await verifyMessage(sentMsg!, ticket, contact);

        // Prioriza a fila configurada em "Fila de transferência". Se não existir,
        // tenta resolver pelo texto e só então usa a fila padrão quando ela não é a atual.
        const { queue: tQueue, user: tUser } = await resolveConfiguredTransferTarget(
          promptRecord,
          ticket,
          bodyMessage
        );
        if (tQueue) {
          const transferred = await applyAiTransfer(ticket, contact, tQueue, tUser);
          if (transferred) return;
          logger.warn(`[AI AGENT] Transferência por keyword não aplicada (destino igual ao atual ou inválido) - ticket ${ticket.id}`);
          return;
        } else {
          logger.warn(`[AI AGENT] Sem fila válida para transferir ticket ${ticket.id} (sem fallback no agente).`);
          return;
        }
      }
    }

    const publicFolder: string = path.resolve(
      __dirname, "..", "..", "..", "public", `company${ticket.companyId}`
    );

    let openai: OpenAI | any;
    // Um cliente por CHAVE, não por atendimento — ver comentário longo em
    // OpenAiService.ts.
    openai = obterClienteIA(promptRecord.apiKey) as SessionOpenAi;

    // DESC + reverse: ver comentário longo em OpenAiService.ts. `ASC + limit`
    // devolvia as mensagens mais ANTIGAS do atendimento.
    const messages = (await Message.findAll({
      where: { ticketId: ticket.id },
      order: [["createdAt", "DESC"]],
      limit: janelaDeHistorico(promptRecord.maxMessages)
    })).reverse();

    const agora = new Date();
    const currentDateTimeBrasilia = formatDateTimeBrasilia(agora);

    const companyQueues = await Queue.findAll({
      where: { companyId: ticket.companyId },
      attributes: ["id", "name"]
    });
    const queueNames = companyQueues.map(q => q.name).join(", ");

    // ✅ Carregar base de conhecimento ativa
    let knowledgeContext = "";
    try {
      const knowledgeItems = await PromptKnowledgeBase.findAll({
        where: { promptId: promptRecord.id, companyId: ticket.companyId, active: true }
      });
      knowledgeContext = buildKnowledgeContext(knowledgeItems);
    } catch (err) {
      logger.warn("[AI AGENT] Erro ao carregar base de conhecimento:", err);
    }

    // ✅ Construir instrução de idioma
    let languageInstruction = "";
    try {
      const langs = promptRecord.languages ? JSON.parse(promptRecord.languages) : ["pt-BR"];
      if (langs.includes("auto")) {
        languageInstruction = "IDIOMA OBRIGATÓRIO: Detecte o idioma da mensagem do cliente e responda SEMPRE no MESMO idioma do cliente.\n";
      } else if (langs.length > 0) {
        const langMap: Record<string, string> = {
          "pt-BR": "Português do Brasil (pt-BR). Use expressões e vocabulário do português brasileiro, NUNCA use português de Portugal.",
          "en-US": "English (US)",
          "es-ES": "Español de España",
          "fr-FR": "Français",
          "de-DE": "Deutsch",
          "it-IT": "Italiano"
        };
        const primaryLang = langMap[langs[0]] || langs[0];
        languageInstruction = `IDIOMA OBRIGATÓRIO: Você DEVE responder SEMPRE e EXCLUSIVAMENTE em ${primaryLang}, INDEPENDENTEMENTE do idioma em que o cliente escreva. NUNCA mude de idioma. Mesmo que o cliente envie mensagens em português, inglês ou qualquer outro idioma, sua resposta DEVE ser em ${primaryLang}.\n`;
        if (langs.length > 1) {
          const allLangs = langs.map((l: string) => langMap[l] || l).join(", ");
          languageInstruction = `IDIOMA OBRIGATÓRIO: Você DEVE responder EXCLUSIVAMENTE em um destes idiomas: ${allLangs}. Idioma preferencial: ${primaryLang}. Se o cliente escrever claramente em outro idioma da lista acima, você pode responder nesse idioma. NUNCA responda em idiomas fora desta lista.\n`;
        }
      }
    } catch (e) {
      languageInstruction = "IMPORTANTE: Responda SEMPRE em Português do Brasil (pt-BR). Use expressões e vocabulário do português brasileiro, NUNCA use português de Portugal.\n";
    }

    const promptSystem = `${languageInstruction}REGRA DE USO DO NOME: O nome do cliente é "${sanitizeName(contact.name || "Amigo(a)")}". Use o nome APENAS na primeira saudação da conversa. Nas mensagens seguintes, NÃO repita o nome — converse de forma natural e humanizada, como uma pessoa real. Só volte a citar o nome em momentos pontuais (encerramento, confirmação importante, chamar atenção). NUNCA comece toda mensagem com "Olá, [nome]" — isso soa robótico.\nCONTINUIDADE: esta é UMA conversa contínua com o mesmo cliente. NUNCA cumprimente de novo ("Olá", "Oi", "Bom dia", "Como posso te ajudar?", "Atendimento ao cliente como posso ajudar?" etc.) depois da primeira mensagem. Mantenha o contexto e o histórico anteriores.\nRESPOSTAS A CONFIRMAÇÕES CURTAS: quando o cliente enviar apenas "ok", "okay", "blz", "beleza", "valeu", "obrigado", "obrigada", "vlw", "tá", "tá bom", "entendi", "certo", "perfeito", "👍" ou "🙏", você DEVE responder com a tag exata [[SILENT]] (e nada mais). NÃO mande "Se precisar de mais alguma coisa..." nem cumprimente de novo. Aguarde o cliente fazer uma nova pergunta para voltar a responder.\nSua resposta deve usar no máximo ${promptRecord.maxTokens} tokens e cuide para não truncar o final.\n\nSetores/filas disponíveis na empresa: ${queueNames || "(nenhum)"}\nQuando o cliente pedir para falar com um setor/atendente humano (ex: "comercial", "financeiro", "suporte", "atendente", "humano"), você DEVE iniciar sua resposta EXATAMENTE com o marcador:\n  Ação: Transferir para <NomeExatoDoSetor>\nUse o nome EXATO de um dos setores listados acima. Se o cliente não especificar o setor, pergunte qual setor ele deseja listando os disponíveis. NUNCA invente nomes de setor.\n\n Sempre usa o horário de Brasília (UTC-3). Agora são ${currentDateTimeBrasilia}. Sempre que questionado sobre hora ou data, responda utilizando esse fuso horário e considere o momento exato da solicitação.\n
    ${promptRecord.prompt}\n${knowledgeContext}`;

    let messagesOpenAi = [];

    if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
      messagesOpenAi.push({ role: "system", content: promptSystem });
      for (let i = 0; i < Math.min(promptRecord.maxMessages, messages.length); i++) {
        const message = messages[i];
        if (message.mediaType === "conversation" || message.mediaType === "extendedTextMessage") {
          if (message.fromMe) {
            messagesOpenAi.push({ role: "assistant", content: message.body });
          } else {
            messagesOpenAi.push({ role: "user", content: message.body });
          }
        }
      }
      messagesOpenAi.push({ role: "user", content: bodyMessage! });

      const aiModel = ticket.aiModel || promptRecord.aiModel || "gpt-4.1-mini";
      const chat = await openai.chat.completions.create({
        model: aiModel,
        messages: messagesOpenAi,
        max_tokens: promptRecord.maxTokens,
        temperature: promptRecord.temperature
      });

      let response = chat.choices[0].message?.content;
      trackTokenUsage(promptRecord.id, { promptTokens: chat.usage?.prompt_tokens, completionTokens: chat.usage?.completion_tokens, totalTokens: chat.usage?.total_tokens });

      if (response) {
        response = await sendKnowledgeMediaFromResponse(response, wbot, ticket, contact, ticketTraking, publicFolder, promptRecord.id);
      }

      // ✅ Aplicar charLimit (limite de caracteres)
      if (response && promptRecord.charLimit && promptRecord.charLimit > 0 && response.length > promptRecord.charLimit) {
        const truncated = response.substring(0, promptRecord.charLimit);
        const lastSpace = truncated.lastIndexOf(" ");
        response = lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
      }

      // ✅ Humanizar conversa
      if (response && promptRecord.humanizeConversation) {
        response = response
          .replace(/\. /g, () => Math.random() > 0.7 ? ".\n" : ". ")
          .replace(/!$/g, () => Math.random() > 0.5 ? "! 😊" : "!");
      }

      // Detectar transferência: marcador da IA OU intenção em texto natural OU pedido do cliente
      {
        const transferRegex = /A[çc][ãa]o:\s*Transferir(?:\s+para\s+(?:o\s+setor\s+de\s+)?(.+?))?(?:\.|!|\n|$)/i;
        const transferMatch = response ? response.match(transferRegex) : null;
        // ✅ Só transfere se permitido E o cliente usou palavra-chave configurada
        const userAsks = matchesTransferKeyword(promptRecord, bodyMessage || "");
        if (userAsks) {
          const requested = transferMatch?.[1]?.trim() || "";
          const combined = `${requested} ${bodyMessage || ""} ${response || ""}`;
          const { queue: tQueue, user: tUser } = await resolveConfiguredTransferTarget(
            promptRecord,
            ticket,
            combined
          );
          if (tQueue) {
            if (response && transferMatch) response = response.replace(transferRegex, "").trim();
            if (promptRecord.responseDelay && promptRecord.responseDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, promptRecord.responseDelay * 1000));
            }
            const isSameQueueTransfer = Number(tQueue.id) === Number(ticket.queueId) && (!tUser?.id || Number(tUser.id) === Number(ticket.userId));
            const responseBody = stripInvisibleText(response);
            if (isSameQueueTransfer) {
              // Já está na fila correta: segue resposta normal pelo prompt, sem frase fixa.
              if (userAsks) {
                try {
                  const queueName = tQueue?.name || "";
                  const infoMsg = `\u200e Você já está no setor *${queueName}*. Pode seguir me contando como posso te ajudar por aqui! 😉`;
                  const sentInfo = await wbot.sendMessage(msg.key.remoteJid!, { text: infoMsg });
                  if (sentInfo) await verifyMessage(sentInfo, ticket, contact);
                } catch (e) {
                  logger.warn("[AI AGENT] Falha ao enviar aviso de mesma fila:", e);
                }
                return;
              }
            } else {
              // ✅ Envia a "Mensagem ao transferir" configurada no agente
              // (com fallback), substituindo qualquer texto natural da IA para
              // garantir consistência com o que o usuário configurou.
              const configuredTransferMsg =
                (promptRecord.transferMessage || "").toString().trim() ||
                "Estou transferindo você para um atendente. Aguarde um momento!";
              let transferText = configuredTransferMsg;
              try { transferText = formatBody(configuredTransferMsg, ticket); } catch { /* noop */ }
              try {
                const sentMsg = await wbot.sendMessage(msg.key.remoteJid!, { text: `\u200e ${transferText}` });
                await verifyMessage(sentMsg!, ticket, contact);
              } catch (e) {
                logger.warn("[AI AGENT] Falha ao enviar transferMessage:", e);
              }
              const transferred = await applyAiTransfer(ticket, contact, tQueue, tUser);
              if (transferred) return;
            }
          } else {
            logger.warn(`[AI AGENT] Transferência solicitada sem fila válida - ticket ${ticket.id}`);
          }
        }
      }

      response = stripInvisibleText(response);
      if (!hasVisibleText(response)) {
        logger.warn(`[AI AGENT] Resposta vazia ignorada - ticket ${ticket.id}`);
        return;
      }

      // ✅ Tag [[SILENT]] = não enviar nada (resposta a "ok", "obrigado" etc.)
      if (response && /\[\[\s*SILENT\s*\]\]/i.test(response)) {
        logger.info(`[AI AGENT] Resposta SILENT - não enviando mensagem - ticket ${ticket.id}`);
        return;
      }

      // ✅ Sanitiza rótulos de ação ("Ação: Transferir para X", "Action: ...") que
      // a IA às vezes vaza no texto do cliente, mesmo sem que o usuário tenha
      // pedido transferência.
      if (response) {
        response = response
          .replace(/^\s*(?:[-*•]\s*)?(?:a[cç][aã]o|action|acao)\s*[:：]\s*.*$/gim, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
      if (!hasVisibleText(response)) {
        logger.warn(`[AI AGENT] Resposta vazia após sanitização de rótulos - ticket ${ticket.id}`);
        return;
      }

      // ✅ Aplicar responseDelay antes de enviar
      if (promptRecord.responseDelay && promptRecord.responseDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, promptRecord.responseDelay * 1000));
      }

      // ✅ Determinar modo de resposta: texto, áudio ou ambos
      const responseMode = promptRecord.responseMode || "text";
      // "both" = envia texto E áudio juntos (mesma semântica documentada na
      // tela do agente: "Áudio e Texto" / "Responde com ambos").
      const shouldSendAudio = responseMode === "audio" || responseMode === "both";
      const shouldSendText = responseMode === "text" || responseMode === "both";

      if (shouldSendText) {
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: `\u200e ${response!}`
        });
        await verifyMessage(sentMessage!, ticket, contact);
      }

      if (shouldSendAudio) {
        try {
          const { generateOpenAiTTS, isValidOpenAiVoice } = await import("../../helpers/OpenAiTTS");
          const agentVoice = isValidOpenAiVoice(promptRecord.agentVoice) ? promptRecord.agentVoice : "nova";
          const fileNameWithOutExtension = `${ticket.id}_tts_${Date.now()}`;
          const outputPath = `${publicFolder}/${fileNameWithOutExtension}`;

          const mp3Path = await generateOpenAiTTS(
            keepOnlySpecifiedChars(response!),
            outputPath,
            promptRecord.apiKey,
            agentVoice
          );

          const { sent: sendMessage, audioToSend } = await sendAiTtsAudio(
            wbot,
            msg.key.remoteJid!,
            mp3Path,
            publicFolder,
            promptRecord.sendAsPTT !== false
          );
          await verifyMediaMessage(sendMessage!, ticket, contact, ticketTraking, false, false, wbot);
          deleteFileSync(mp3Path);
          if (audioToSend !== mp3Path) deleteFileSync(audioToSend);

          logger.info(`[AI AGENT] Resposta enviada como áudio TTS (voz: ${agentVoice}) - ticket ${ticket.id}`);
        } catch (ttsError) {
          logger.error("[AI AGENT] Erro no TTS, enviando como texto:", ttsError);
          if (!shouldSendText) {
            const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
              text: `\u200e ${response!}`
            });
            await verifyMessage(sentMessage!, ticket, contact);
          }
        }
      }
    } else if (msg.message?.audioMessage) {
      // ✅ Verificar se transcrição de áudio está habilitada
      if (!promptRecord.transcribeAudio) {
        logger.info(`[AI AGENT] Transcrição de áudio desabilitada para prompt ${promptRecord.id} - ticket ${ticket.id}`);
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: "\u200e Desculpe, no momento só consigo processar mensagens de texto. Por favor, envie sua pergunta por escrito."
        });
        await verifyMessage(sentMessage!, ticket, contact);
        return;
      }

      let transcriptionText = "";
      const mediaUrl = mediaSent!.mediaUrl!.split("/").pop();
      const audioFilePath = `${publicFolder}/${mediaUrl}`;

      if (!fs.existsSync(audioFilePath)) {
        logger.error(`[AI AGENT] Arquivo de áudio não encontrado: ${audioFilePath}`);
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: "\u200e Desculpe, não foi possível processar seu áudio. Tente novamente."
        });
        await verifyMessage(sentMessage!, ticket, contact);
        return;
      }

      // ✅ Tentar TRANSCRIBE_URL local (Whisper self-hosted) primeiro, fallback para OpenAI Whisper
      if (process.env.TRANSCRIBE_URL) {
        try {
          const FormData = require("form-data");
          const axios = require("axios");
          const data = new FormData();
          data.append("audio", fs.createReadStream(audioFilePath));

          const config = {
            method: "post" as const,
            maxBodyLength: Infinity,
            url: `${process.env.TRANSCRIBE_URL}/transcrever`,
            headers: {
              ...(process.env.TRANSCRIBE_API_KEY
                ? { Authorization: `Bearer ${process.env.TRANSCRIBE_API_KEY}` }
                : {}),
              ...data.getHeaders(),
            },
            data: data,
          };

          const res = await axios.request(config);
          if (typeof res.data === "string") {
            transcriptionText = res.data;
          } else if (res.data && typeof res.data === "object") {
            transcriptionText =
              res.data.text ||
              res.data.transcription ||
              res.data.transcript ||
              res.data.result ||
              res.data.data ||
              "";
          }
          transcriptionText = String(transcriptionText || "").trim();
          if (transcriptionText === "__TRANSCRIPTION_FAILED__") transcriptionText = "";
          if (!transcriptionText) throw new Error("Empty transcription from TRANSCRIBE_URL");
          logger.info(`[AI AGENT] Transcrição local (TRANSCRIBE_URL) bem-sucedida - ticket ${ticket.id}`);
        } catch (error) {
          logger.warn(`[AI AGENT] Falha na transcrição local, tentando OpenAI Whisper - ticket ${ticket.id}:`, error);
          // Fallback para OpenAI Whisper
          const file = fs.createReadStream(audioFilePath) as any;
          const transcription = await openai.audio.transcriptions.create({
            model: "whisper-1",
            file: file,
          });
          transcriptionText = transcription.text;
        }
      } else {
        // Usar OpenAI Whisper diretamente
        const file = fs.createReadStream(audioFilePath) as any;
        const transcription = await openai.audio.transcriptions.create({
          model: "whisper-1",
          file: file,
        });
        transcriptionText = transcription.text;
      }

      if (!transcriptionText) {
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: "\u200e Desculpe, não consegui entender o áudio. Tente novamente ou envie uma mensagem de texto."
        });
        await verifyMessage(sentMessage!, ticket, contact);
        return;
      }

      // Enviar transcrição para o usuário
      const sentTranscript = await wbot.sendMessage(msg.key.remoteJid!, {
        text: `🎤 *Sua mensagem de voz:* ${transcriptionText}`,
      });
      await verifyMessage(sentTranscript!, ticket, contact);

      // Processar transcrição com IA
      messagesOpenAi = [];
      messagesOpenAi.push({ role: "system", content: promptSystem });
      for (let i = 0; i < Math.min(promptRecord.maxMessages, messages.length); i++) {
        const message = messages[i];
        if (message.mediaType === "conversation" || message.mediaType === "extendedTextMessage") {
          if (message.fromMe) {
            messagesOpenAi.push({ role: "assistant", content: message.body });
          } else {
            messagesOpenAi.push({ role: "user", content: message.body });
          }
        }
      }
      messagesOpenAi.push({ role: "user", content: transcriptionText });
      const aiModelAudio = ticket.aiModel || promptRecord.aiModel || "gpt-4.1-mini";
      const chat = await openai.chat.completions.create({
        model: aiModelAudio,
        messages: messagesOpenAi,
        max_tokens: promptRecord.maxTokens,
        temperature: promptRecord.temperature
      });
      let response = chat.choices[0].message?.content;
      trackTokenUsage(promptRecord.id, { promptTokens: chat.usage?.prompt_tokens, completionTokens: chat.usage?.completion_tokens, totalTokens: chat.usage?.total_tokens });

      if (response) {
        response = await sendKnowledgeMediaFromResponse(response, wbot, ticket, contact, ticketTraking, publicFolder, promptRecord.id);
      }

      // ✅ Aplicar charLimit
      if (response && promptRecord.charLimit && promptRecord.charLimit > 0 && response.length > promptRecord.charLimit) {
        const truncated = response.substring(0, promptRecord.charLimit);
        const lastSpace = truncated.lastIndexOf(" ");
        response = lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
      }

      // ✅ Humanizar
      if (response && promptRecord.humanizeConversation) {
        response = response
          .replace(/\. /g, () => Math.random() > 0.7 ? ".\n" : ". ")
          .replace(/!$/g, () => Math.random() > 0.5 ? "! 😊" : "!");
      }

      // Áudio: mesma detecção robusta de transferência
      {
        const transferRegexAudio = /A[çc][ãa]o:\s*Transferir(?:\s+para\s+(?:o\s+setor\s+de\s+)?(.+?))?(?:\.|!|\n|$)/i;
        const transferMatchAudio = response ? response.match(transferRegexAudio) : null;
        const userAsksA = matchesTransferKeyword(promptRecord, transcriptionText || "");
        if (userAsksA) {
          const requestedA = transferMatchAudio?.[1]?.trim() || "";
          const combinedA = `${requestedA} ${transcriptionText || ""} ${response || ""}`;
          const { queue: tQueueA, user: tUserA } = await resolveConfiguredTransferTarget(
            promptRecord,
            ticket,
            combinedA
          );
          if (tQueueA) {
            if (response && transferMatchAudio) response = response.replace(transferRegexAudio, "").trim();
            if (promptRecord.responseDelay && promptRecord.responseDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, promptRecord.responseDelay * 1000));
            }
            const isSameQueueTransfer = Number(tQueueA.id) === Number(ticket.queueId) && (!tUserA?.id || Number(tUserA.id) === Number(ticket.userId));
            const responseBody = stripInvisibleText(response);
            if (isSameQueueTransfer) {
              // Já está na fila correta: segue resposta normal pelo prompt, sem frase fixa.
              if (userAsksA) {
                try {
                  const queueName = tQueueA?.name || "";
                  const infoMsg = `\u200e Você já está no setor *${queueName}*. Pode seguir me contando como posso te ajudar por aqui! 😉`;
                  const sentInfo = await wbot.sendMessage(msg.key.remoteJid!, { text: infoMsg });
                  if (sentInfo) await verifyMessage(sentInfo, ticket, contact);
                } catch (e) {
                  logger.warn("[AI AGENT audio] Falha ao enviar aviso de mesma fila:", e);
                }
                return;
              }
            } else {
              if (hasVisibleText(responseBody)) {
                const sentMsg = await wbot.sendMessage(msg.key.remoteJid!, { text: `\u200e ${responseBody}` });
                await verifyMessage(sentMsg!, ticket, contact);
              }
              const transferred = await applyAiTransfer(ticket, contact, tQueueA, tUserA);
              if (transferred) return;
            }
          }
        }
      }

      // ✅ Aplicar responseDelay
      if (promptRecord.responseDelay && promptRecord.responseDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, promptRecord.responseDelay * 1000));
      }

      // ✅ Determinar modo de resposta para áudio transcrito
      const responseModeAudio = promptRecord.responseMode || "text";
      // "both" = envia texto E áudio juntos (mesma semântica documentada na
      // tela do agente: "Áudio e Texto" / "Responde com ambos").
      const shouldSendAudioT = responseModeAudio === "audio" || responseModeAudio === "both";
      const shouldSendTextT = responseModeAudio === "text" || responseModeAudio === "both";

      if (shouldSendTextT) {
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: `\u200e ${response!}`
        });
        await verifyMessage(sentMessage!, ticket, contact);
      }

      if (shouldSendAudioT) {
        try {
          const { generateOpenAiTTS, isValidOpenAiVoice } = await import("../../helpers/OpenAiTTS");
          const agentVoice = isValidOpenAiVoice(promptRecord.agentVoice) ? promptRecord.agentVoice : "nova";
          const fileNameTTS = `${ticket.id}_tts_${Date.now()}`;
          const outputPath = `${publicFolder}/${fileNameTTS}`;

          const mp3Path = await generateOpenAiTTS(
            keepOnlySpecifiedChars(response!),
            outputPath,
            promptRecord.apiKey,
            agentVoice
          );

          const { sent: sendMessage, audioToSend } = await sendAiTtsAudio(
            wbot,
            msg.key.remoteJid!,
            mp3Path,
            publicFolder,
            promptRecord.sendAsPTT !== false
          );
          await verifyMediaMessage(sendMessage!, ticket, contact, ticketTraking, false, false, wbot);
          deleteFileSync(mp3Path);
          if (audioToSend !== mp3Path) deleteFileSync(audioToSend);
        } catch (ttsError) {
          logger.error("[AI AGENT] Erro no TTS (áudio), enviando como texto:", ttsError);
          if (!shouldSendTextT) {
            const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
              text: `\u200e ${response!}`
            });
            await verifyMessage(sentMessage!, ticket, contact);
          }
        }
      } else if (!shouldSendTextT) {
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: `\u200e ${response!}`
        });
        await verifyMessage(sentMessage!, ticket, contact);
      }
    }
  } catch (error) {
    logger.error("[AI AGENT] Erro ao processar agente de IA:", error);
  }

  // Agenda lembrete de inatividade (mesma lógica de handleOpenAi)
  try {
    const { scheduleInactivityReminder } = await import("../../helpers/InactivityReminder");
    const promptForReminder = await ShowPromptService({
      promptId: ticket.promptId,
      companyId: ticket.companyId
    }).catch(() => null as any);
    if (promptForReminder) {
      scheduleInactivityReminder(wbot, ticket, contact, promptForReminder);
    }
  } catch (e) { /* noop */ }
};


const handleMessage = async (
  msg: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number,
  isImported: boolean = false
): Promise<void> => {

  let campaignExecuted = false;

  
  if (isImported) {
    addLogs({
      fileName: `processImportMessagesWppId${wbot.id}.txt`,
      text: `Importando Mensagem: ${JSON.stringify(
        msg,
        null,
        2
      )}>>>>>>>>>>>>>>>>>>>`
    });

    let wid = msg.key.id;
    let existMessage = await Message.findOne({
      where: { wid }
    });
    if (existMessage) {
      await new Promise(r => setTimeout(r, 150));
      return;
    } else {
      await new Promise(r =>
        setTimeout(r, parseInt(process.env.TIMEOUT_TO_IMPORT_MESSAGE) || 330)
      );
    }
  }
  //  else {
  //   await new Promise(r => setTimeout(r, i * 150));
  //   i++
  // }

  if (!isValidMsg(msg)) {
    return;
  }

  // ✅ DEDUPLICAÇÃO: Verificar se a mensagem já existe (evitar duplicatas em tempo real)
  if (!isImported) {
    const existingMsg = await Message.findOne({ where: { wid: msg.key.id } });
    if (existingMsg) {
      logger.info(`[DEDUP-BAILEYS] Mensagem ${msg.key.id} já existe, ignorando duplicata`);
      return;
    }
  }

  // ✅ CORREÇÃO: Ignorar eventos de grupo (messageStubType)
  if (msg.messageStubType) {
    if (ENABLE_LID_DEBUG) {
      logger.info(
        `[RDS-LID] HandleMessage - Ignorando evento de grupo: ${msg.messageStubType}`
      );
    }
    return;
  }



  try {
    let msgContact: IMe;
    let groupContact: Contact | undefined;
    let queueId: number = null;
    let tagsId: number = null;
    let userId: number = null;

    // 🔍 DEBUG: Log da estrutura da mensagem para identificar tipo de resposta de botão interativo
    const msgKeys = msg.message ? Object.keys(msg.message) : [];
    if (msgKeys.some(k => k.toLowerCase().includes('interactive') || k.toLowerCase().includes('button') || k.toLowerCase().includes('list') || k.toLowerCase().includes('response') || k.toLowerCase().includes('native') || k.toLowerCase().includes('viewonce'))) {
      logger.debug(`[DEBUG-INTERACTIVE] Mensagem recebida - keys: ${JSON.stringify(msgKeys)}`);
      logger.debug(`[DEBUG-INTERACTIVE] Estrutura completa: ${JSON.stringify(msg.message, null, 2)}`);
    }

    let bodyMessage = getBodyMessage(msg);
    const msgType = getTypeMessage(msg);
    
    // 🔍 DEBUG: Log do tipo e body extraídos
    if (msgKeys.some(k => k.toLowerCase().includes('interactive') || k.toLowerCase().includes('button') || k.toLowerCase().includes('list') || k.toLowerCase().includes('response') || k.toLowerCase().includes('native') || k.toLowerCase().includes('viewonce'))) {
      logger.debug(`[DEBUG-INTERACTIVE] msgType: ${msgType}, bodyMessage: ${bodyMessage}`);
    }
    //if (msgType === "protocolMessage") return; // Tratar isso no futuro para excluir msgs se vor REVOKE

    const hasMedia =
      msg.message?.imageMessage ||
      msg.message?.audioMessage ||
      msg.message?.videoMessage ||
      msg.message?.stickerMessage ||
      msg.message?.documentMessage ||
      msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
      // msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
      // msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage ||
      // msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage ||
      msg.message?.ephemeralMessage?.message?.audioMessage ||
      msg.message?.ephemeralMessage?.message?.documentMessage ||
      msg.message?.ephemeralMessage?.message?.videoMessage ||
      msg.message?.ephemeralMessage?.message?.stickerMessage ||
      msg.message?.ephemeralMessage?.message?.imageMessage ||
      msg.message?.viewOnceMessage?.message?.imageMessage ||
      msg.message?.viewOnceMessage?.message?.videoMessage ||
      msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
        ?.imageMessage ||
      msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
        ?.videoMessage ||
      msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
        ?.audioMessage ||
      msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message
        ?.documentMessage ||
      msg.message?.documentWithCaptionMessage?.message?.documentMessage ||
      msg.message?.templateMessage?.hydratedTemplate?.imageMessage ||
      msg.message?.templateMessage?.hydratedTemplate?.documentMessage ||
      msg.message?.templateMessage?.hydratedTemplate?.videoMessage ||
      msg.message?.templateMessage?.hydratedFourRowTemplate?.imageMessage ||
      msg.message?.templateMessage?.hydratedFourRowTemplate?.documentMessage ||
      msg.message?.templateMessage?.hydratedFourRowTemplate?.videoMessage ||
      msg.message?.templateMessage?.fourRowTemplate?.imageMessage ||
      msg.message?.templateMessage?.fourRowTemplate?.documentMessage ||
      msg.message?.templateMessage?.fourRowTemplate?.videoMessage ||
      msg.message?.interactiveMessage?.header?.imageMessage ||
      msg.message?.interactiveMessage?.header?.documentMessage ||
      msg.message?.interactiveMessage?.header?.videoMessage ||
      msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate
        ?.documentMessage ||
      msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate
        ?.videoMessage ||
      msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate
        ?.imageMessage ||
      msg.message?.highlyStructuredMessage?.hydratedHsm?.hydratedTemplate
        ?.locationMessage;
    // const isPrivate = /\u200d/.test(bodyMessage);

    // if (isPrivate) return;

    if (msg.key.fromMe) {
      if (/\u200e/.test(bodyMessage)) return;

      if (
        !hasMedia &&
        msgType !== "conversation" &&
        msgType !== "extendedTextMessage" &&
        msgType !== "contactMessage" &&
        msgType !== "reactionMessage" &&
        msgType !== "ephemeralMessage" &&
        msgType !== "protocolMessage" &&
        msgType !== "viewOnceMessage" &&
        msgType !== "editedMessage" &&
        msgType !== "hydratedContentText"
      )
        return;
      msgContact = await getContactMessage(msg, wbot);
    } else {
      msgContact = await getContactMessage(msg, wbot);
    }

    
    const isGroup = msg.key.remoteJid?.endsWith("@g.us");

    // 🔍 DEBUG GRUPOS
    if (isGroup) {
      logger.debug(`[GROUP-DEBUG] Mensagem de grupo recebida: ${msg.key.remoteJid}, fromMe: ${msg.key.fromMe}`);
    }

    if (!wbot.id) { logger.warn(`[WBOT] wbot.id nulo em handleMessage, ignorando mensagem`); return; }
    const whatsapp = await ShowWhatsAppService(wbot.id, companyId);

    if (!whatsapp.allowGroup && isGroup) {
      logger.debug(`[GROUP-DEBUG] ❌ Mensagem de grupo BLOQUEADA - allowGroup=${whatsapp.allowGroup} na conexão ${whatsapp.name} (id=${whatsapp.id})`);
      return;
    }

    if (isGroup) {
      let grupoMeta = null;

      try {
        grupoMeta = await getGroupMetadataCache(whatsapp.id, msg.key.remoteJid);
      } catch (error) {
        logger.error(`Erro ao obter metadados do grupo: ${JSON.stringify(error)}`);
      }

      if (!grupoMeta) {
        try {
          await updateGroupMetadataCache(whatsapp.id, msg.key.remoteJid);
          grupoMeta = await getGroupMetadataCache(whatsapp.id, msg.key.remoteJid);
        } catch (error) {
          logger.error(`Erro ao atualizar cache do grupo: ${JSON.stringify(error)}`);
        }
      }


      if (grupoMeta === undefined || grupoMeta === null || !grupoMeta?.id) {
        logger.debug(`[GROUP-DEBUG] Cache vazio, buscando metadata direto para: ${msg.key.remoteJid}`);
        try {
          grupoMeta = await wbot.groupMetadata(msg.key.remoteJid!)
        } catch (error) {
          logger.error(`[GROUP-DEBUG] ❌ Falha ao obter metadata do grupo ${msg.key.remoteJid}: ${JSON.stringify(error)}`);
          return;
        }
      }
      logger.debug(`[GROUP-DEBUG] ✅ Grupo resolvido: ${grupoMeta?.subject || 'sem nome'} (${grupoMeta?.id})`);

      const msgGroupContact = {
        id: grupoMeta.id,
        name: grupoMeta.subject
      };

      groupContact = await verifyContact(msgGroupContact, wbot, companyId);

      if (!groupContact) {
        logger.info("Grupo não encontrado, buscando novamente no banco de dados...")
        groupContact = await Contact.findOne({
          where: {
            companyId,
            [Op.or]: [
              { number: msg.key.remoteJid.split("@")[0].split(":")[0].replace(/\D/g, '') },
              { number: msg.key.remoteJid.replace('@g.us', '') },
              { lid: msg.key.remoteJid.replace('@s.whatsapp.net', '') }
            ]
          }
        })
        if (!groupContact) {
          logger.info("Grupo não encontrado, descarta a mensagem para não abrir como contato...")
          return;
        }
      }
    }

    const contact = await verifyContact(msgContact, wbot, companyId);

    // Quanto somar ao contador de não lidas do ticket: SEMPRE 1 por mensagem
    // recebida. O FindOrCreateTicketService faz `ticket.unreadMessages + este
    // valor`, então mandar aqui o acumulado do cache somava duas vezes e o
    // contador crescia sozinho (2 mensagens viravam 3, 3 viravam 6...).
    // O cache continua sendo mantido só como espelho, porque o
    // SetTicketMessagesAsRead o zera ao marcar como lido.
    let unreadMessages = 0;

    if (msg.key.fromMe) {
      await cacheLayer.set(`contacts:${contact.id}:unreads`, "0");
    } else {
      unreadMessages = 1;
      const unreads = await cacheLayer.get(`contacts:${contact.id}:unreads`);
      await cacheLayer.set(
        `contacts:${contact.id}:unreads`,
        `${(Number(unreads) || 0) + 1}`
      );
    }

    const settings = await getCachedCompanySettings(companyId);
    const enableLGPD = settings.enableLGPD === "enabled";

    // contador
    // if (msg.key.fromMe && count?.unreadCount > 0) {
    //   let remoteJid = msg.key.remoteJid;
    //   SendAckBYRemoteJid({ remoteJid, companyId });
    // }

    // ✅ Otimizado: apenas verificar existência, sem carregar modelo completo nem ordenar
    const isFirstMsg = await Ticket.findOne({
      where: {
        contactId: groupContact ? groupContact.id : contact.id,
        companyId,
        whatsappId: whatsapp.id
      },
      attributes: ["id"],
      order: [["id", "DESC"]],
      raw: true
    });

    // ✅ Mutex por contato (não mais por mensagem) — evita race conditions na criação de tickets
    const contactMutex = getTicketMutex(contact.id);
    const ticket = await contactMutex.runExclusive(async () => {
      const result = await FindOrCreateTicketService(
        contact,
        whatsapp,
        unreadMessages,
        companyId,
        queueId,
        userId,
        groupContact,
        "whatsapp",
        isImported,
        false,
        settings
      );
      return result;
    });

    // NÃO forçar fila padrão aqui — o verifyQueue abaixo cuida de 0/1/2+ filas corretamente

    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      userId,
      whatsappId: whatsapp?.id
    });

    // ✅ Click-to-WhatsApp Ad (Baileys): externalAdReply traz metadados do anúncio.
    // Atenção: Baileys NÃO recebe ctwa_clid (só Cloud API). Aqui salvamos contexto
    // do anúncio para enriquecer o atendimento; CAPI só dispara se houver ctwa_clid.
    try {
      const adReply =
        (msg.message as any)?.extendedTextMessage?.contextInfo?.externalAdReply ||
        (msg.message as any)?.listResponseMessage?.contextInfo?.externalAdReply;
      if (!msg.key.fromMe && adReply && contact?.number) {
        await upsertLead({
          phone: contact.number,
          companyId,
          channel: "baileys",
          contactId: contact.id,
          firstTicketId: ticket.id,
          firstMessage: getBodyMessage(msg) || null,
          ctwa_clid: adReply.ctwaClid || adReply.ctwa_clid || null,
          adId: adReply.sourceId || adReply.source_id || null,
          adTitle: adReply.title || null,
          adBody: adReply.body || null,
          sourceType: adReply.sourceType || adReply.source_type || null,
          sourceUrl: adReply.sourceUrl || adReply.source_url || null,
          mediaType: adReply.mediaType || adReply.media_type || null,
          thumbnailUrl: adReply.thumbnailUrl || null
        });
        logger.info(
          `[CTWA-BAILEYS] Lead salvo - phone=${contact.number} ad=${adReply.sourceId || ""}`
        );
      }
    } catch (e: any) {
      logger.error(`[CTWA-BAILEYS] erro ao salvar lead: ${e?.message}`);
    }

    if (!msg.key.fromMe && !ticket.imported) {
      const keywordFlowExecuted = await executeFlowBuilderKeywordTrigger({
        msg,
        wbot,
        companyId,
        ticket,
        contact: groupContact || contact,
        messageBody: bodyMessage
      });

      if (keywordFlowExecuted) {
        return;
      }
    }

    // ✅ ROTEAMENTO POR BOTÃO INTERATIVO → fila/atendente
    const hasInteractiveQueueReply = !!(
      (msg.message as any)?.templateButtonReplyMessage ||
      (msg.message as any)?.interactiveResponseMessage ||
      (msg.message as any)?.buttonsResponseMessage ||
      (msg.message as any)?.listResponseMessage ||
      (msg.message as any)?.viewOnceMessage?.message?.templateButtonReplyMessage ||
      (msg.message as any)?.viewOnceMessageV2?.message?.templateButtonReplyMessage ||
      (msg.message as any)?.ephemeralMessage?.message?.templateButtonReplyMessage ||
      (msg.message as any)?.ephemeralMessage?.message?.viewOnceMessage?.message?.templateButtonReplyMessage ||
      (msg.message as any)?.ephemeralMessage?.message?.viewOnceMessageV2?.message?.templateButtonReplyMessage
    );

    if (!msg.key.fromMe && (
      msgType === "templateButtonReplyMessage" ||
      msgType === "interactiveResponseMessage" ||
      msgType === "buttonsResponseMessage" ||
      hasInteractiveQueueReply
    )) {
      try {
        const rootMsg = (msg.message as any) || {};
        const nestedMsg =
          rootMsg.viewOnceMessage?.message ||
          rootMsg.viewOnceMessageV2?.message ||
          rootMsg.ephemeralMessage?.message?.viewOnceMessage?.message ||
          rootMsg.ephemeralMessage?.message?.viewOnceMessageV2?.message ||
          rootMsg.ephemeralMessage?.message ||
          {};

        const tbrm = rootMsg.templateButtonReplyMessage || nestedMsg.templateButtonReplyMessage;
        const irm = rootMsg.interactiveResponseMessage || nestedMsg.interactiveResponseMessage;
        const brm = rootMsg.buttonsResponseMessage || nestedMsg.buttonsResponseMessage;
        const lrm = rootMsg.listResponseMessage || nestedMsg.listResponseMessage;

        let stanzaId: string | undefined =
          tbrm?.contextInfo?.stanzaId ||
          irm?.contextInfo?.stanzaId ||
          brm?.contextInfo?.stanzaId ||
          lrm?.contextInfo?.stanzaId;

        let selectedId: string | undefined =
          tbrm?.selectedId ||
          brm?.selectedButtonId ||
          lrm?.singleSelectReply?.selectedRowId;

        let selectedText: string | undefined = (
          tbrm?.selectedDisplayText ||
          brm?.selectedDisplayText ||
          lrm?.title ||
          ""
        ).toLowerCase().trim();

        if (irm?.nativeFlowResponseMessage?.paramsJson) {
          try {
            const p = JSON.parse(irm.nativeFlowResponseMessage.paramsJson);
            selectedId = selectedId || p?.id;
            selectedText = selectedText || String(p?.display_text || "").toLowerCase().trim();
          } catch {
            // ignore parse error
          }
        }

        if (!selectedText && selectedId) {
          selectedText = String(selectedId).toLowerCase().trim();
        }

        // Fallback: messageContextInfo (Baileys 7+), contextInfo raiz, quoted stanzaId
        if (!stanzaId) {
          stanzaId = rootMsg?.messageContextInfo?.stanzaId
            || rootMsg?.contextInfo?.stanzaId
            || (msg as any)?.contextInfo?.stanzaId;
        }

        // Fallback final: msg.message.extendedTextMessage?.contextInfo?.stanzaId
        if (!stanzaId) {
          stanzaId = rootMsg?.extendedTextMessage?.contextInfo?.stanzaId;
        }

        logger.debug(`[INTERACTIVE-QUEUE-DEBUG] msgType=${msgType}, stanzaId=${stanzaId || "NONE"}, selectedId=${selectedId || "NONE"}, selectedText="${selectedText || ""}", msgKeys=${JSON.stringify(Object.keys(rootMsg || {}))}`);

        // Ticket aguardando AVALIAÇÃO não é roteado por menu.
        //
        // Este bloco roda ANTES da checagem de avaliação (mais abaixo) e pode
        // mudar o status do ticket para "open"/"pending". Quando o cliente
        // responde a nota, a resposta costuma vir citando a mensagem anterior;
        // se sobrar no cache um mapeamento de menu daquele contato, o número
        // da nota ("1".."5") casa com uma opção do menu antigo, o ticket é
        // roteado para uma fila e sai do status "nps". Aí a avaliação não é
        // mais reconhecida e o atendimento REABRE — que é o defeito relatado.
        //
        // Em "nps" a única coisa que pode acontecer com a resposta é ser
        // tratada como nota.
        if (ticket.status === "nps") {
          logger.debug(
            `[INTERACTIVE-QUEUE] Ticket ${ticket.id} aguardando avaliação — roteamento por menu ignorado.`
          );
        } else if (stanzaId && (selectedId || selectedText)) {
          const cacheKey = `interactive:queueMap:${stanzaId}`;
          const mappingStr = await cacheLayer.get(cacheKey);
          logger.debug(`[INTERACTIVE-QUEUE-DEBUG] cacheKey=${cacheKey}, found=${!!mappingStr}`);
          if (mappingStr) {
            const mapping = JSON.parse(mappingStr);
            const queueMapping = mapping.queues || mapping;
            const userMapping = mapping.users || {};
            const targetQueueId = (selectedId && queueMapping[selectedId]) || (selectedText && queueMapping[selectedText]);
            const targetUserId = (selectedId && userMapping[selectedId]) || (selectedText && userMapping[selectedText]);
            
            logger.debug(`[INTERACTIVE-QUEUE-DEBUG] targetQueueId=${targetQueueId || "NONE"}, targetUserId=${targetUserId || "NONE"}, queueMapping=${JSON.stringify(queueMapping)}, userMapping=${JSON.stringify(userMapping)}`);

            if (targetQueueId || targetUserId) {
              const updateData: any = {};
              if (targetQueueId) updateData.queueId = targetQueueId;
              if (targetUserId) {
                updateData.userId = targetUserId;
                updateData.status = ticket.isGroup ? "group" : "open";
              }
              if (!targetUserId && ticket.status === "closed") {
                updateData.status = ticket.isGroup ? "group" : "pending";
              }

              logger.info(`[INTERACTIVE-QUEUE] Roteando ticket ${ticket.id} → fila=${targetQueueId || "N/A"}, user=${targetUserId || "N/A"} (msgType=${msgType}, selectedId="${selectedId}", selectedText="${selectedText}")`);
              await ticket.update(updateData);

              const io = getIO();
              io.of(String(companyId))
                .emit(`company-${companyId}-ticket`, {
                  action: "update",
                  ticket
                });
            }
          }
        } else if (!stanzaId) {
          // Se não achou stanzaId, tentar buscar por qualquer mapeamento recente do contato
          logger.warn(`[INTERACTIVE-QUEUE] stanzaId não encontrado! msgType=${msgType}, msg.key.id=${msg.key?.id}, dump contextInfo=${JSON.stringify(rootMsg?.contextInfo || rootMsg?.messageContextInfo || "NONE")}`);
        }
      } catch (queueRouteErr) {
        logger.error(`[INTERACTIVE-QUEUE] Erro ao rotear por botão: ${queueRouteErr}`);
      }
    }

    let bodyRollbackTag = "";
    let bodyNextTag = "";
    let rollbackTag;
    let nextTag;
    let ticketTag = undefined;
    if (ticket?.company?.plan?.useKanban) {
      ticketTag = await TicketTag.findOne({
        where: {
          ticketId: ticket.id
        }
      });

      if (ticketTag) {
        const tag = await Tag.findByPk(ticketTag.tagId);

        if (tag.nextLaneId) {
          nextTag = await Tag.findByPk(tag.nextLaneId);

          bodyNextTag = nextTag.greetingMessageLane;
        }
        if (tag.rollbackLaneId) {
          rollbackTag = await Tag.findByPk(tag.rollbackLaneId);

          bodyRollbackTag = rollbackTag.greetingMessageLane;
        }
      }
    }

    if (
      ticket.status === "closed" ||
      (unreadMessages === 0 &&
        whatsapp.complationMessage &&
        formatBody(whatsapp.complationMessage, ticket) === bodyMessage)
    ) {
      return;
    }

    if (
      rollbackTag &&
      formatBody(bodyNextTag, ticket) !== bodyMessage &&
      formatBody(bodyRollbackTag, ticket) !== bodyMessage
    ) {
      await TicketTag.destroy({
        where: { ticketId: ticket.id, tagId: ticketTag.tagId }
      });
      await TicketTag.create({ ticketId: ticket.id, tagId: rollbackTag.id });
    }

    if (isImported) {
      await ticket.update({
        queueId: whatsapp.queueIdImportMessages
      });
    }

    if (msgType === "editedMessage" || msgType === "protocolMessage") {
      const msgKeyIdEdited =
        msgType === "editedMessage"
          ? msg.message.editedMessage.message.protocolMessage.key.id
          : msg.message?.protocolMessage.key.id;
      let bodyEdited = findCaption(msg.message);

      const io = getIO();
      try {
        const messageToUpdate = await Message.findOne({
          where: {
            wid: msgKeyIdEdited,
            companyId,
            ticketId: ticket.id
          }
        });

        if (!messageToUpdate) return;

        await messageToUpdate.update({ isEdited: true, body: bodyEdited });

        await ticket.update({ lastMessage: bodyEdited });

        io.of(String(companyId))
          // .to(String(ticket.id))
          .emit(`company-${companyId}-appMessage`, {
            action: "update",
            message: messageToUpdate
          });

        io.of(String(companyId))
          // .to(ticket.status)
          // .to("notification")
          // .to(String(ticket.id))
          .emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket
          });
      } catch (err) {
        Sentry.captureException(err);
        logger.error(`Error handling message ack. Err: ${err}`);
      }
      return;
    }

    //const ticketTraking = await FindOrCreateATicketTrakingService({
    //  ticketId: ticket.id,
    //  companyId,
    //  userId,
    //  whatsappId: whatsapp?.id
    //});

    let useLGPD = false;

    try {
      if (!msg.key.fromMe) {
        //MENSAGEM DE FÉRIAS COLETIVAS

        if (!isNil(whatsapp.collectiveVacationMessage && !isGroup)) {
          const currentDate = moment();

          if (
            currentDate.isBetween(
              moment(whatsapp.collectiveVacationStart),
              moment(whatsapp.collectiveVacationEnd)
            )
          ) {
            if (hasMedia) {
              await verifyMediaMessage(
                msg,
                ticket,
                contact,
                ticketTraking,
                false,
                false,
                wbot
              );
            } else {
              await verifyMessage(msg, ticket, contact, ticketTraking);
            }

            wbot.sendMessage(getJidOf(ticket.contact), {
              text: whatsapp.collectiveVacationMessage
            });

            return;
          }
        }

        /**
         * Tratamento para avaliação do atendente
         */
        if (
          ticket.status === "nps" &&
          ticketTraking !== null &&
          verifyRating(ticketTraking)
        ) {
          if (hasMedia) {
            await verifyMediaMessage(
              msg,
              ticket,
              contact,
              ticketTraking,
              false,
              false,
              wbot
            );
          } else {
            await verifyMessage(msg, ticket, contact, ticketTraking);
          }

          if (!isNaN(parseFloat(bodyMessage))) {
            handleRating(parseFloat(bodyMessage), ticket, ticketTraking);

            await ticketTraking.update({
              ratingAt: moment().toDate(),
              finishedAt: moment().toDate(),
              rated: true
            });

            return;
          } else {
            if (ticket.amountUsedBotQueuesNPS < whatsapp.maxUseBotQueuesNPS) {
              let bodyErrorRating = `\u200eOpção inválida, tente novamente.\n`;
              const sentMessage = await wbot.sendMessage(getJidOf(ticket),
                {
                  text: bodyErrorRating
                }
              );

              await verifyMessage(sentMessage, ticket, contact, ticketTraking);

              await delay(1000);

              let bodyRatingMessage = `\u200e${whatsapp.ratingMessage}\n`;

              const msg = await SendWhatsAppMessage({
                body: bodyRatingMessage,
                ticket
              });

              await verifyMessage(msg, ticket, ticket.contact);

              await ticket.update({
                amountUsedBotQueuesNPS: ticket.amountUsedBotQueuesNPS + 1
              });
            }

            return;
          }
        }

        //TRATAMENTO LGPD
        if (
          enableLGPD &&
          ticket.status === "lgpd" &&
          !isImported &&
          !msg.key.fromMe
        ) {
          if (hasMedia) {
            await verifyMediaMessage(
              msg,
              ticket,
              contact,
              ticketTraking,
              false,
              false,
              wbot
            );
          } else {
            await verifyMessage(msg, ticket, contact, ticketTraking);
          }

          useLGPD = true;

          if (
            isNil(ticket.lgpdAcceptedAt) &&
            !isNil(ticket.lgpdSendMessageAt)
          ) {
            let choosenOption = parseFloat(bodyMessage);

            //Se digitou opção numérica
            if (
              !Number.isNaN(choosenOption) &&
              Number.isInteger(choosenOption) &&
              !isNull(choosenOption) &&
              choosenOption > 0
            ) {
              //Se digitou 1, aceitou o termo e vai pro bot
              if (choosenOption === 1) {
                await contact.update({
                  lgpdAcceptedAt: moment().toDate()
                });
                await ticket.update({
                  lgpdAcceptedAt: moment().toDate(),
                  amountUsedBotQueues: 0,
                  isBot: true
                  // status: "pending"
                });
                //Se digitou 2, recusou o bot e encerra chamado
              } else if (choosenOption === 2) {
                if (
                  whatsapp.complationMessage !== "" &&
                  whatsapp.complationMessage !== undefined
                ) {
                  const sentMessage = await wbot.sendMessage(getJidOf(ticket),
                    {
                      text: `\u200e ${whatsapp.complationMessage}`
                    }
                  );

                  await verifyMessage(
                    sentMessage,
                    ticket,
                    contact,
                    ticketTraking
                  );
                }

                await ticket.update({
                  status: "closed",
                  amountUsedBotQueues: 0
                });

                await ticketTraking.destroy;

                return;
                //se digitou qualquer opção que não seja 1 ou 2 limpa o lgpdSendMessageAt para
                //enviar de novo o bot respeitando o numero máximo de vezes que o bot é pra ser enviado
              } else {
                if (
                  ticket.amountUsedBotQueues < whatsapp.maxUseBotQueues &&
                  whatsapp.maxUseBotQueues > 0
                ) {
                  await ticket.update({
                    amountUsedBotQueues: ticket.amountUsedBotQueues + 1,
                    lgpdSendMessageAt: null
                  });
                }
              }
              //se digitou qualquer opção que não número o lgpdSendMessageAt para
              //enviar de novo o bot respeitando o numero máximo de vezes que o bot é pra ser enviado
            } else {
              if (
                (ticket.amountUsedBotQueues < whatsapp.maxUseBotQueues &&
                  whatsapp.maxUseBotQueues > 0) ||
                whatsapp.maxUseBotQueues === 0
              ) {
                await ticket.update({
                  amountUsedBotQueues: ticket.amountUsedBotQueues + 1,
                  lgpdSendMessageAt: null
                });
              }
            }
          }

          if (
            (contact.lgpdAcceptedAt === null ||
              settings?.lgpdConsent === "enabled") &&
            !contact.isGroup &&
            isNil(ticket.lgpdSendMessageAt) &&
            (whatsapp.maxUseBotQueues === 0 ||
              ticket.amountUsedBotQueues <= whatsapp.maxUseBotQueues) &&
            !isNil(settings?.lgpdMessage)
          ) {
            if (!isNil(settings?.lgpdMessage) && settings.lgpdMessage !== "") {
              const bodyMessageLGPD = formatBody(
                `\u200e ${settings?.lgpdMessage}`,
                ticket
              );

              const sentMessage = await wbot.sendMessage(getJidOf(ticket),
                {
                  text: bodyMessageLGPD
                }
              );

              wbot.store(sentMessage);

              await verifyMessage(sentMessage, ticket, contact, ticketTraking);
            }
            await delay(1000);

            if (!isNil(settings?.lgpdLink) && settings?.lgpdLink !== "") {
              const bodyLink = formatBody(
                `\u200e ${settings?.lgpdLink}`,
                ticket
              );
              const sentMessage = await wbot.sendMessage(getJidOf(ticket),
                {
                  text: bodyLink
                }
              );

              wbot.store(sentMessage);

              await verifyMessage(sentMessage, ticket, contact, ticketTraking);
            }

            await delay(1000);

            const bodyBot = formatBody(
              `\u200e Estou ciente sobre o tratamento dos meus dados pessoais. \n\n*[1]* Sim\n*[2]* Não`,
              ticket
            );

            const sentMessageBot = await wbot.sendMessage(getJidOf(ticket),
              {
                text: bodyBot
              }
            );

            wbot.store(sentMessageBot);

            await verifyMessage(sentMessageBot, ticket, contact, ticketTraking);

            await ticket.update({
              lgpdSendMessageAt: moment().toDate(),
              amountUsedBotQueues: ticket.amountUsedBotQueues + 1
            });

            await ticket.reload();

            return;
          }

          if (!isNil(ticket.lgpdSendMessageAt) && isNil(ticket.lgpdAcceptedAt))
            return;
        }
      }
    } catch (e) {
      Sentry.captureException(e);
    }
    const isMsgForwarded =
      msg.message?.extendedTextMessage?.contextInfo?.isForwarded ||
      msg.message?.imageMessage?.contextInfo?.isForwarded ||
      msg.message?.audioMessage?.contextInfo?.isForwarded ||
      msg.message?.videoMessage?.contextInfo?.isForwarded ||
      msg.message?.documentMessage?.contextInfo?.isForwarded;

    let mediaSent: Message | undefined;

    if (!useLGPD) {
      if (hasMedia) {
        mediaSent = await verifyMediaMessage(
          msg,
          ticket,
          contact,
          ticketTraking,
          isMsgForwarded,
          false,
          wbot
        );
        // Transferência automática para o agente ao receber imagem/foto
        const msgType = getTypeMessage(msg);
        // if (
        //   (msgType === "imageMessage" ||
        //     msgType === "videoMessage" ||
        //     msgType === "documentMessage" ||
        //     msgType === "documentWithCaptionMessage" ||
        //     // msgType === "audioMessage" ||
        //     msgType === "stickerMessage") &&
        //   whatsapp.prompt &&
        //   whatsapp.prompt.queueId
        // ) {
        //   await transferQueue(whatsapp.prompt.queueId, ticket, contact);
        // }
      } else {
        await verifyMessage(
          msg,
          ticket,
          contact,
          ticketTraking,
          false,
          isMsgForwarded
        );
      }
    }

    // Atualiza o ticket se a ultima mensagem foi enviada por mim, para que possa ser finalizado.
    try {
      await ticket.update({
        fromMe: msg.key.fromMe
      });
    } catch (e) {
      Sentry.captureException(e);
    }

    let currentSchedule;

    if (settings.scheduleType === "company") {
      currentSchedule = await VerifyCurrentSchedule(companyId, 0, 0);
    } else if (settings.scheduleType === "connection") {
      currentSchedule = await VerifyCurrentSchedule(companyId, 0, whatsapp.id);
    }

    try {
      if (
        !msg.key.fromMe &&
        settings.scheduleType &&
        (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
        !["open", "group"].includes(ticket.status)
      ) {
        /**
         * Tratamento para envio de mensagem quando a empresa está fora do expediente
         */
        if (
          (settings.scheduleType === "company" ||
            settings.scheduleType === "connection") &&
          !isNil(currentSchedule) &&
          (!currentSchedule || currentSchedule.inActivity === false)
        ) {
          // Se o agente de IA do Prompt cobre o horário atual, deixa seguir
          // o fluxo até o handleOpenAiFlow.
          const _queueForPrompt = ticket.queueId
            ? await Queue.findByPk(ticket.queueId)
            : null;
          if (await PromptCoversNow(whatsapp, _queueForPrompt, ticket.promptId)) {
            logger.debug(`[OUT-OF-HOURS BYPASS] Agente cobre o horário (company/connection) - ticket ${ticket.id}`);
          } else {
          if (
            whatsapp.maxUseBotQueues &&
            whatsapp.maxUseBotQueues !== 0 &&
            ticket.amountUsedBotQueues >= whatsapp.maxUseBotQueues
          ) {
            // await UpdateTicketService({
            //   ticketData: { queueId: queues[0].id },
            //   ticketId: ticket.id
            // });

            return;
          }

          if (whatsapp.timeUseBotQueues !== "0") {
            if (
              ticket.isOutOfHour === false &&
              ticketTraking.chatbotAt !== null
            ) {
              await ticketTraking.update({
                chatbotAt: null
              });
              await ticket.update({
                amountUsedBotQueues: 0
              });
            }

            //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
            let dataLimite = new Date();
            let Agora = new Date();

            if (ticketTraking.chatbotAt !== null) {
              dataLimite.setMinutes(
                ticketTraking.chatbotAt.getMinutes() +
                Number(whatsapp.timeUseBotQueues)
              );
              if (
                ticketTraking.chatbotAt !== null &&
                Agora < dataLimite &&
                whatsapp.timeUseBotQueues !== "0" &&
                ticket.amountUsedBotQueues !== 0
              ) {
                return;
              }
            }

            await ticketTraking.update({
              chatbotAt: null
            });
          }

          if (whatsapp.outOfHoursMessage !== "" && !ticket.imported) {
            const body = formatBody(`${whatsapp.outOfHoursMessage}`, ticket);

            const debouncedSentMessage = debounce(
              async () => {
                const sentMessage = await wbot.sendMessage(getJidOf(ticket),
                  {
                    text: body
                  }
                );

                wbot.store(sentMessage);
              },
              1000,
              `${ticket.id}:outOfHoursB`
            );
            debouncedSentMessage();
          }

          //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
          await ticket.update({
            isOutOfHour: true,
            amountUsedBotQueues: ticket.amountUsedBotQueues + 1
          });

          return;
          }
        }
      }
    } catch (e) {
      Sentry.captureException(e);
    }

    if (!msg.key.fromMe && !ticket.imported && !isGroup && ticket.isBot !== false) {
      const contactForCampaign = await ShowContactService(
        ticket.contactId,
        ticket.companyId
      );

      try {
        // Não re-avaliar keyword trigger se o ticket já está em modo agente de IA
        // (evita loop: nó aiAgent zera flowWebhook/lastFlowId ao entregar controle p/ IA,
        //  o que reabre a checagem de keyword a cada nova mensagem do cliente).
        const dataWebhookCheck = ticket.dataWebhook as any;
        const inAiMode = ticket.useIntegration && (
          dataWebhookCheck?.type === "aiAgent" ||
          dataWebhookCheck?.type === "openai" ||
          dataWebhookCheck?.type === "gemini"
        );

        if (!inAiMode && !ticket.flowWebhook && !ticket.lastFlowId && !ticket.flowStopped) {
          logger.debug(`[FLOWBUILDER-KEYWORD] Verificação global imediata para ticket ${ticket.id} sem depender de integrationId`);
          campaignExecuted = await executeFlowBuilderKeywordTrigger({
            msg,
            wbot,
            companyId,
            ticket,
            contact: contactForCampaign,
            messageBody: bodyMessage || getBodyMessage(msg) || ticket.lastMessage || ""
          });

          if (campaignExecuted) {
            logger.debug(`[FLOWBUILDER-KEYWORD] ✅ Fluxo global por palavra-chave executado para ticket ${ticket.id}`);
            return;
          }
        }

        // Verificar integração vinculada apenas para campanhas/integrações legadas.
        // Fluxo global por palavra-chave já foi verificado acima e não depende disso.
        if (!ticket.integrationId) {
          logger.info("[HANDLE MESSAGE] Ticket sem integração vinculada; campanhas por integração não serão verificadas");
        } else {
          const queueIntegrations = await ShowQueueIntegrationService(
            ticket.integrationId,
            companyId
          );

          // ✅ EXECUTAR CAMPANHA APENAS PARA INTEGRAÇÕES DO TIPO FLOWBUILDER
          // Typebot, n8n, dialogflow NÃO devem passar por aqui
          if (queueIntegrations.type === "flowbuilder") {
            campaignExecuted = await flowbuilderIntegration(
              msg,
              wbot,
              companyId,
              queueIntegrations,
              ticket,
              contactForCampaign,
              null,
              null
            );

            if (campaignExecuted) {
              return;
            }
          }
        }
      } catch (error) {
        console.error("[RDS-4125 HANDLE MESSAGE] Erro ao verificar campanhas:", error);
      }
    }


    // ✅ PRIORIDADE 1: Verificar se ticket está em modo IA (permanente ou temporário)
    // ✅ CORRIGIDO: IA deve parar quando ticket é aceito (status = "open" ou isBot = false)
    // ✅ CORREÇÃO: Recarregar ticket para garantir estado atualizado do dataWebhook
    await ticket.reload();
    if (!msg.key.fromMe && ticket.useIntegration && ticket.status !== "open" && ticket.isBot !== false) {
      const dataWebhook = ticket.dataWebhook as any;
      const isAIMode = dataWebhook?.type === "openai" || dataWebhook?.type === "gemini" || dataWebhook?.type === "aiAgent";

      if (isAIMode && dataWebhook?.settings) {
        logger.info(`[AI MODE] Processando mensagem em modo ${dataWebhook.type} - ticket ${ticket.id}`);

        try {
          // ✅ VERIFICAR SE É A PRIMEIRA RESPOSTA DO USUÁRIO APÓS BOAS-VINDAS
          if (dataWebhook.awaitingUserResponse) {
            logger.info(`[AI SERVICE] Primeira resposta do usuário para ${dataWebhook.type} - iniciando conversa - ticket ${ticket.id}`);

            // ✅ REMOVER FLAG - AGORA A CONVERSA ESTÁ ATIVA
            await ticket.update({
              dataWebhook: {
                ...dataWebhook,
                awaitingUserResponse: false
              }
            });
          }

          if (dataWebhook.type === "aiAgent" && !isNil(ticket.promptId)) {
            logger.info(`[AI MODE] Encaminhando mensagem para handleOpenAi (fila) - ticket ${ticket.id}, promptId=${ticket.promptId}`);
            const queuePrompt = await PromptModel.findOne({
              where: { id: ticket.promptId, companyId: ticket.companyId }
            });
            if (queuePrompt) {
              await handleOpenAi(msg, wbot, ticket, contact, mediaSent, ticketTraking, queuePrompt);
            } else {
              await handleAiAgent(msg, wbot, ticket, contact, mediaSent, ticketTraking);
            }
          } else {
            const aiSettings = {
              ...dataWebhook.settings,
              provider: dataWebhook.type === "aiAgent"
                ? (dataWebhook.settings?.model?.startsWith('gpt-') || dataWebhook.settings?.model?.startsWith('o') ? 'openai' : 'gemini')
                : dataWebhook.type
            };

            // ✅ PROCESSAR MENSAGEM ATRAVÉS DA IA
            await handleOpenAiFlow(
              aiSettings,
              msg,
              wbot,
              ticket,
              contact,
              mediaSent,
              ticketTraking
            );
          }

          return; // ✅ IMPORTANTE: RETORNAR PARA NÃO PROCESSAR OUTRAS LÓGICAS

        } catch (error) {
          logger.error("[AI MODE] Erro ao processar modo IA:", error);
        }
      }
    }

    const wasProcessedByTemporaryAI = await checkTemporaryAI(wbot, ticket, contact, msgContact, null, ticketTraking, msg);
    if (wasProcessedByTemporaryAI) {
      return;
    }

    // ✅ SAÍDA DE FLUXO — checagem ANTES do tratamento do nó de input.
    // O bloco logo abaixo consome a resposta do cliente e dá `return`, então
    // um "sair" digitado enquanto o fluxo espera um input nunca chegava no
    // flowbuilderIntegration (onde a checagem ficava). Resultado: no Baileys
    // a palavra de saída era engolida e virava o valor da variável do input.
    if (!msg.key.fromMe) {
      const textoDoCliente = getBodyMessage(msg);
      if (textoDoCliente) {
        const encerrouFluxo = await HandleFlowExitKeyword({
          ticket,
          contact,
          companyId,
          body: String(textoDoCliente),
          canal: "BAILEYS"
        });
        if (encerrouFluxo) return;
      }
    }

    if (
      !msg.key.fromMe &&
      (
        // Caminho padrão: aguardando input explicitamente
        ((ticket.dataWebhook as any)?.waitingInput === true &&
          (ticket.dataWebhook as any)?.inputVariableName)
        ||
        // Fallback resiliente: houve perda do flag, mas temos ponteiro de próximo nó e variável
        ((ticket.dataWebhook as any)?.nextNodeId &&
          (ticket.dataWebhook as any)?.inputVariableName)
      )
    ) {
      const hasActiveFlowState = Boolean(
        ticket.flowWebhook ||
        ticket.flowStopped ||
        ticket.lastFlowId ||
        (ticket.dataWebhook as any)?.flowId ||
        (ticket.dataWebhook as any)?.waitingInput
      );

      // Se foi realmente assumido por humano e não há fluxo ativo, limpa o input.
      // Quando o ticket ficou "open" por distribuição randômica, mas ainda está no
      // FlowBuilder, a resposta precisa continuar o fluxo normalmente.
      if (ticket.status === "open" && !hasActiveFlowState) {
        logger.debug(`[INPUT NODE] ⚠️ Ticket ${ticket.id} está OPEN - Parando fluxo e limpando dados do Input`);
        try {
          // Limpar os dados do webhook relacionados ao Input
          await ticket.update({
            dataWebhook: {
              ...ticket.dataWebhook,
              waitingInput: false,
              inputVariableName: null,
              inputIdentifier: null,
              nextNodeId: null
            }
          });
          logger.debug(`[INPUT NODE] Dados do Input limpos para ticket ${ticket.id}`);
        } catch (error) {
          logger.error(`[INPUT NODE] Erro ao limpar dados do Input para ticket ${ticket.id}:`, error);
        }
        return;
      }

      logger.debug(`[INPUT NODE] Processando resposta para nó de input - ticket ${ticket.id}`);
      try {
        const body = getBodyMessage(msg);
        // @ts-ignore
        const inputVariableName = (ticket.dataWebhook as any).inputVariableName;
        // @ts-ignore
        const inputIdentifier =
          (ticket.dataWebhook as any).inputIdentifier ||
          `${ticket.id}_${inputVariableName}`;

        global.flowVariables = global.flowVariables || {};
        global.flowVariables[inputVariableName] = body;
        global.flowVariables[inputIdentifier] = body; // Salvar com o identificador também

        const nextNode = global.flowVariables[`${inputIdentifier}_next`];
        // Fallback: se o ponteiro em memória não existir, usa o salvo no ticket
        // @ts-ignore
        const fallbackNextNode = (ticket.dataWebhook as any)?.nextNodeId;
        const resolvedNextNode = nextNode || fallbackNextNode;
        // delete global.flowVariables[`${inputIdentifier}_next`];

        await ticket.update({
          dataWebhook: {
            ...ticket.dataWebhook,
            waitingInput: false,
            inputProcessed: true,
            inputVariableName: null,
            inputIdentifier: null,
            lastInputValue: body
          }
        });

        // Fallback de flowId: se flowStopped estiver ausente, tenta pegar de dataWebhook.flowId
        // @ts-ignore
        const resolvedFlowId = ticket.flowStopped || (ticket.dataWebhook as any)?.flowId;

        if (resolvedNextNode && resolvedFlowId) {
          const flow = await FlowBuilderModel.findOne({
            where: { id: resolvedFlowId, company_id: ticket.companyId, active: true }
          });

          if (flow) {
            const nodes: INodes[] = flow.flow["nodes"];
            const connections: IConnections[] = flow.flow["connections"];

            const mountDataContact = {
              number: contact.number,
              name: contact.name,
              email: contact.email
            };

            await ActionsWebhookService(
              whatsapp.id,
              parseInt(String(resolvedFlowId)),
              ticket.companyId,
              nodes,
              connections,
              resolvedNextNode,
              null,
              ticket.dataWebhook || {},
              ticket.hashFlowId || "",
              null,
              ticket.id,
              mountDataContact,
              true // inputResponded true somete para node  input
            );

            return;
          }
        }

        // BUG relatado: "pergunta, recebe a resposta e repete a mesma
        // pergunta, não avança". Chegar aqui significa que a resposta foi
        // capturada (lastInputValue já salvo acima), mas não há próximo nó
        // pra continuar (nó Input sem conexão de saída ligada no editor do
        // FlowBuilder — ver aviso "[INPUT NODE] ⚠️" em
        // ActionsWebhookService.ts) ou o fluxo salvo não existe/foi
        // desativado. Antes, o código só fazia fallthrough silencioso pra
        // baixo com flowStopped/lastFlowId ainda setados — a próxima
        // mensagem do cliente caía no bloco "FLOW STOPPED" logo abaixo, que
        // tentava retomar o MESMO nó Input de novo, reenviando a mesma
        // pergunta. Agora encerra o fluxo explicitamente aqui: a resposta já
        // foi coletada, e sem próximo nó configurado não há o que continuar.
        logger.warn(`[INPUT NODE] Resposta do ticket ${ticket.id} capturada mas sem próximo nó configurado (nextNodeId="${resolvedNextNode || ""}", flowId="${resolvedFlowId || ""}") — encerrando o fluxo em vez de repetir a pergunta. Verifique a conexão de saída do nó Input no editor.`);
        await ticket.update({
          flowWebhook: false,
          flowStopped: null,
          lastFlowId: null,
          hashFlowId: null
        });
        return;
      } catch (error) {
        console.error(
          "[inputNode] Erro ao processar resposta do nó de input:",
          error
        );
      }
    }

    if (ticket.flowStopped && ticket.lastFlowId) {
      // ✅ CRÍTICO: Não processar mensagens do próprio bot
      if (msg && msg.key.fromMe) {
        logger.debug(`[FLOW STOPPED] ⚠️ Mensagem do bot (fromMe=true) - IGNORANDO para ticket ${ticket.id}`);
        return;
      }

      // ✅ CORRIGIDO: Se o ticket está "open" (aceito pelo atendente), parar o fluxo
      if (ticket.status === "open") {
        logger.debug(`[FLOW STOPPED] ⚠️ Ticket ${ticket.id} está OPEN - Parando fluxo`);
        return;
      }

      logger.debug(`[FLOW STOPPED] ========== CONTINUANDO FLUXO (SEGUNDA VERIFICAÇÃO) ==========`);
      logger.debug(`[FLOW STOPPED] Ticket ${ticket.id}, Mensagem do usuário: "${getBodyMessage(msg)}"`);
      await flowBuilderQueue(ticket, msg, wbot, whatsapp, companyId, contact, ticket);
      return;
    }

    // ✅ NOVO: Ignorar mensagens do usuário quando o fluxo está em execução (flowWebhook=true mas flowStopped=false)
    // Isso evita que mensagens durante a execução do SingleBlock reiniciem o fluxo
    if (ticket.flowWebhook && ticket.lastFlowId && !ticket.flowStopped && msg && !msg.key.fromMe) {
      logger.info(`[FLOW RUNNING] ⚠️ Ticket ${ticket.id} está executando fluxo (flowWebhook=true, lastFlowId=${ticket.lastFlowId}) - IGNORANDO mensagem do usuário durante execução`);
      logger.info(`[FLOW RUNNING] Mensagem ignorada: "${getBodyMessage(msg)}"`);
      return;
    }

    if (
      ticket.status !== "open" &&
      !isGroup &&
      !msg.key.fromMe &&
      !ticket.fromMe &&
      ticket.flowStopped &&
      ticket.flowWebhook &&
      !isNaN(parseInt(ticket.lastMessage))
    ) {
      await flowBuilderQueue(
        ticket,
        msg,
        wbot,
        whatsapp,
        companyId,
        contact,
        isFirstMsg
      );

      // O fluxo pode ter encerrado o atendimento (nó "Sair/Encerrar"). O objeto
      // `ticket` em memória ficou desatualizado, então recarregamos: sem isso o
      // restante do handleMessage seguia tratando o ticket como pendente e
      // reabria o atendimento com fila/saudação/chatbot.
      await ticket.reload();
      if (ticket.status === "closed" || ticket.status === "nps") {
        logger.info(`[FLOW] Ticket ${ticket.id} foi encerrado pelo fluxo (status=${ticket.status}) - interrompendo processamento`);
        return;
      }
    }



    //openai na conexao (só executa se o ticket NÃO tiver promptId próprio, para evitar duplicação)
    if (
      ticket.status !== "open" &&
      !ticket.imported &&
      !ticket.queue &&
      !isGroup &&
      !msg.key.fromMe &&
      !ticket.userId &&
      !isNil(whatsapp.promptId) &&
      isNil(ticket.promptId)
    ) {
      await handleOpenAi(msg, wbot, ticket, contact, mediaSent, ticketTraking);
    }

    // Agente de IA configurado no chatbot/fila (queueType: aiAgent)
    if (
      ticket.status !== "open" &&
      !ticket.imported &&
      !isGroup &&
      !msg.key.fromMe &&
      !ticket.userId &&
      !isNil(ticket.promptId)
    ) {
      const queuePrompt = await PromptModel.findOne({
        where: { id: ticket.promptId, companyId: ticket.companyId }
      });
      if (queuePrompt) {
        await handleOpenAi(msg, wbot, ticket, contact, mediaSent, ticketTraking, queuePrompt);
      } else {
        await handleAiAgent(msg, wbot, ticket, contact, mediaSent, ticketTraking);
      }
    }

    //integraçao na conexao
    if (
      ticket.status !== "open" &&
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.queue &&
      !ticket.user &&
      !isNil(whatsapp.integrationId)
      //ticket.isBot &&
      //!isNil(whatsapp.integrationId) &&
      //ticket.useIntegration
    ) {
      const integrations = await ShowQueueIntegrationService(
        whatsapp.integrationId,
        companyId
      );

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        integrations,
        ticket
      );

      if (msg.key.fromMe) {
        await ticket.update({
          typebotSessionTime: moment().toDate(),
          useIntegration: true,
          integrationId: integrations.id
        });
      } else {
        await ticket.update({
          useIntegration: true,
          integrationId: integrations.id
        });
      }

      return;
    }

    // *** FLUXO VINCULADO NA CONEXÃO (sem necessidade de integração externa) ***
    // Funciona quando a conexão tem flowIdWelcome ou flowIdNotPhrase configurado
    // e nenhuma integração externa (integrationId) está definida.
    if (
      ticket.status !== "open" &&
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.queue &&
      !ticket.user &&
      isNil(whatsapp.integrationId) &&
      !ticket.useIntegration &&
      (whatsapp.flowIdWelcome || whatsapp.flowIdNotPhrase)
    ) {
      logger.info(
        `[LINKED FLOW] 🔗 Disparando flowbuilderIntegration para ticket ${ticket.id} (flowIdWelcome=${whatsapp.flowIdWelcome}, flowIdNotPhrase=${whatsapp.flowIdNotPhrase})`
      );
      await flowbuilderIntegration(
        msg,
        wbot,
        companyId,
        null as any,
        ticket,
        contact,
        isFirstMsg,
        null
      );
      return;
    }

    if (
      !ticket.imported &&
      !msg.key.fromMe &&
      !ticket.isGroup &&
      !ticket.userId &&
      ticket.integrationId &&
      ticket.useIntegration
    ) {
      const integrations = await ShowQueueIntegrationService(
        ticket.integrationId,
        companyId
      );

      await handleMessageIntegration(
        msg,
        wbot,
        companyId,
        integrations,
        ticket
      );
      if (msg.key.fromMe) {
        await ticket.update({
          typebotSessionTime: moment().toDate()
        });
      }
    }

    // Estado atual do ticket antes de decidir fila/saudação/chatbot: qualquer
    // etapa acima (fluxos, integrações, IA) pode tê-lo encerrado. Sem este
    // reload o ticket encerrado pelo nó "Sair" voltava para "pending".
    try {
      await ticket.reload();
    } catch { /* best-effort */ }
    if (ticket.status === "closed" || ticket.status === "nps") {
      logger.info(`[HANDLE MESSAGE] Ticket ${ticket.id} já encerrado (status=${ticket.status}) - não reabrir com fila/saudação`);
      return;
    }

    if (

      !ticket.imported &&
      !ticket.queue &&
      (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
      !msg.key.fromMe &&
      !ticket.userId &&
      whatsapp.queues.length >= 1 &&
      !ticket.useIntegration
    ) {
      await verifyQueue(wbot, msg, ticket, contact, settings, ticketTraking);

      if (ticketTraking.chatbotAt === null) {
        await ticketTraking.update({
          chatbotAt: moment().toDate()
        });
      }

    // ✅ Se a fila aplicou um agente de IA, processar imediatamente sem aguardar próxima mensagem
      await ticket.reload();
      if (!isNil(ticket.promptId) && !msg.key.fromMe && ticket.status !== "open") {
        // Usa a MESMA lógica da conexão: carrega o Prompt e chama handleOpenAi
        const queuePrompt = await PromptModel.findOne({
          where: { id: ticket.promptId, companyId: ticket.companyId }
        });
        if (queuePrompt) {
          await handleOpenAi(msg, wbot, ticket, contact, mediaSent, ticketTraking, queuePrompt);
        } else {
          await handleAiAgent(msg, wbot, ticket, contact, mediaSent, ticketTraking);
        }
        return;
      }
    }

    if (ticket.queueId > 0) {
      await ticketTraking.update({
        queueId: ticket.queueId
      });
    }

    // Verificação se aceita audio do contato
    if (
      getTypeMessage(msg) === "audioMessage" &&
      !msg.key.fromMe &&
      (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
      (!contact?.acceptAudioMessage ||
        settings?.acceptAudioMessageContact === "disabled")
    ) {
      try {
        const sentMessage = await wbot.sendMessage(
          getJidOf(ticket.contact),
          {
            text: `\u200e*Asistente Virtual*:\nLamentablemente no podemos escuchar ni enviar audios por este canal de atención. Por favor, envíe un mensaje de *texto*.`
          },
          { quoted: msg }
        );

        if (sentMessage) {
          try { wbot.store?.(sentMessage); } catch (e) { /* noop */ }
          await verifyMessage(sentMessage, ticket, contact, ticketTraking);
        }
      } catch (err) {
        logger.error(`[acceptAudioMessage] Falha ao enviar aviso de áudio: ${err?.message || err}`);
      }
    }

    try {
      if (
        !msg.key.fromMe &&
        settings?.scheduleType &&
        ticket.queueId !== null &&
        (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
        ticket.status !== "open"
      ) {
        /**
         * Tratamento para envio de mensagem quando a empresa/fila está fora do expediente
         */
        const queue = await Queue.findByPk(ticket.queueId);

        if (settings?.scheduleType === "queue") {
          currentSchedule = await VerifyCurrentSchedule(companyId, queue.id, 0);
        }

        if (
          settings?.scheduleType === "queue" &&
          !isNil(currentSchedule) &&
          ticket.amountUsedBotQueues < whatsapp.maxUseBotQueues &&
          (!currentSchedule || currentSchedule.inActivity === false) &&
          !ticket.imported
        ) {
          if (await PromptCoversNow(whatsapp, queue, ticket.promptId)) {
            logger.debug(`[OUT-OF-HOURS BYPASS] Agente cobre o horário (queue) - ticket ${ticket.id}`);
          } else {
          if (Number(whatsapp.timeUseBotQueues) > 0) {
            if (
              ticket.isOutOfHour === false &&
              ticketTraking.chatbotAt !== null
            ) {
              await ticketTraking.update({
                chatbotAt: null
              });
              await ticket.update({
                amountUsedBotQueues: 0
              });
            }

            //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
            let dataLimite = new Date();
            let Agora = new Date();

            if (ticketTraking.chatbotAt !== null) {
              dataLimite.setMinutes(
                ticketTraking.chatbotAt.getMinutes() +
                Number(whatsapp.timeUseBotQueues)
              );

              if (
                ticketTraking.chatbotAt !== null &&
                Agora < dataLimite &&
                whatsapp.timeUseBotQueues !== "0" &&
                ticket.amountUsedBotQueues !== 0
              ) {
                return;
              }
            }

            await ticketTraking.update({
              chatbotAt: null
            });
          }

          const outOfHoursMessage = queue.outOfHoursMessage;

          if (outOfHoursMessage !== "") {
            const body = formatBody(`${outOfHoursMessage}`, ticket);

            const debouncedSentMessage = debounce(
              async () => {
                const sentMessage = await wbot.sendMessage(
                  getJidOf(ticket),
                  {
                    text: body
                  }
                );

                wbot.store(sentMessage);
              },
              1000,
              `${ticket.id}:outOfHoursQueue`
            );
            debouncedSentMessage();
          }
          //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
          await ticket.update({
            isOutOfHour: true,
            amountUsedBotQueues: ticket.amountUsedBotQueues + 1
          });
          return;
          }
        }
      }
    } catch (e) {
      Sentry.captureException(e);
    }

    if (
      ticket.queue &&
      ticket.queueId &&
      !msg.key.fromMe &&
      !ticket.useIntegration &&
      !ticket.integrationId
    ) {
      // ✅ CORRIGIDO: Executar ChatBot apenas se ticket não estiver "open" (aceito por atendente)
      if (ticket.status !== "open" && ticket.queue?.chatbots?.length > 0) {
        await sayChatbot(
          ticket.queueId,
          wbot,
          ticket,
          contact,
          msg,
          ticketTraking
        );
      }

      //atualiza mensagem para indicar que houve atividade e aí contar o tempo novamente para enviar mensagem de inatividade
      await ticket.update({
        sendInactiveMessage: false
      });
    }

    if (
      !campaignExecuted && // ✅ NOVA CONDIÇÃO
      !msg.key.fromMe &&
      !ticket.imported &&
      !isGroup &&
      ticket.status === "pending"
    ) {
      // Aguardar um pouco para garantir que outros processamentos terminaram
      setTimeout(async () => {
        try {
          logger.debug(`[TICKET RELOAD] ========== ANTES DO RELOAD ==========`);
          logger.debug(`[TICKET RELOAD] Ticket ${ticket.id} - flowWebhook: ${ticket.flowWebhook}, lastFlowId: ${ticket.lastFlowId}, hashFlowId: ${ticket.hashFlowId}`);
          
          await ticket.reload({
            include: [{ model: Contact, as: "contact" }]
          });

          logger.debug(`[TICKET RELOAD] ========== DEPOIS DO RELOAD ==========`);
          logger.debug(`[TICKET RELOAD] Ticket ${ticket.id} - flowWebhook: ${ticket.flowWebhook}, lastFlowId: ${ticket.lastFlowId}, hashFlowId: ${ticket.hashFlowId}`);

          // Só verificar se não entrou em fluxo
          if (!ticket.flowWebhook || !ticket.lastFlowId) {
            logger.debug(`[TICKET RELOAD] Condição (!flowWebhook || !lastFlowId) = TRUE - vai executar flowbuilderIntegration`);
          } else {
            logger.debug(`[TICKET RELOAD] Condição (!flowWebhook || !lastFlowId) = FALSE - NÃO vai executar flowbuilderIntegration`);
            logger.debug(`[TICKET RELOAD] Ticket já está em fluxo - ignorando`);
            return;
          }

          if (!ticket.flowWebhook || !ticket.lastFlowId) {
            const contactForCampaign = await ShowContactService(
              ticket.contactId,
              ticket.companyId
            );

            try {
              logger.debug(`[FLOWBUILDER-KEYWORD] Verificação global sem integrationId para ticket ${ticket.id}`);
              const keywordFlowExecuted = await executeFlowBuilderKeywordTrigger({
                msg,
                wbot,
                companyId,
                ticket,
                contact: contactForCampaign,
                messageBody: bodyMessage || getBodyMessage(msg) || ticket.lastMessage || ""
              });

              if (keywordFlowExecuted) {
                logger.debug(`[FLOWBUILDER-KEYWORD] ✅ Fluxo global por palavra-chave executado para ticket ${ticket.id}`);
                return;
              }

              if (!whatsapp.integrationId) {
                logger.info("[RDS-4573 - DEBUG] whatsapp.integrationId não está definido para a conexão WhatsApp ID: " + whatsapp.id);
                return;
              }

              const queueIntegrations = await ShowQueueIntegrationService(
                whatsapp.integrationId,
                companyId
              );

              // DEBUG - Verificar tipo de integração para diagnóstico
              logger.debug(`[RDS-FLOW-DEBUG] Iniciando flowbuilder para ticket ${ticket.id}, integração tipo: ${queueIntegrations?.type || 'indefinido'}`);

              // ✅ VERIFICAÇÃO FINAL APENAS SE NECESSÁRIO
              await flowbuilderIntegration(
                msg,
                wbot,
                companyId,
                queueIntegrations,
                ticket,
                contactForCampaign
              );

              // DEBUG - Verificar se flowbuilder foi executado com sucesso
              logger.debug(`[RDS-FLOW-DEBUG] flowbuilderIntegration executado para ticket ${ticket.id}`);
            } catch (integrationError) {
              logger.error("[RDS-4573 - INTEGRATION ERROR] Erro ao processar integração:", integrationError);
            }
          }
        } catch (error) {
          logger.error("[RDS-4573 - CAMPAIGN MESSAGE] Erro ao verificar campanhas:", error);
        }
      }, 1000);
    }

    await ticket.reload();

  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling whatsapp message: Err: ${err}`);
  }
};

const handleMsgAck = async (
  msg: WAMessage,
  chat: number | null | undefined
) => {
  await new Promise(r => setTimeout(r, 500));
  const io = getIO();

  try {
    // ✅ Otimizado: primeiro busca leve só para verificar se precisa atualizar
    const messageToUpdate = await Message.findOne({
      where: {
        wid: msg.key.id,
        fromMe: msg.key.fromMe
      },
      attributes: ["id", "ack", "ticketId", "companyId"]
    });
    if (!messageToUpdate || messageToUpdate.ack >= chat) return;

    await messageToUpdate.update({ ack: chat });

    // ✅ Só carrega os includes pesados DEPOIS de confirmar que precisa emitir
    const fullMessage = await Message.findByPk(messageToUpdate.id, {
      include: [
        "contact",
        {
          model: Ticket,
          as: "ticket",
          include: [
            {
              model: Contact,
              attributes: ["id", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "urlPicture", "companyId"],
              include: ["extraInfo", "tags"]
            },
            { model: Queue, attributes: ["id", "name", "color"] },
            { model: Whatsapp, attributes: ["id", "name", "groupAsTicket", "color"] },
            { model: User, attributes: ["id", "name"] },
            { model: Tag, as: "tags", attributes: ["id", "name", "color"] }
          ]
        },
        { model: Message, as: "quotedMsg", include: ["contact"] }
      ]
    });

    if (fullMessage) {
      io.of(fullMessage.companyId.toString())
        .emit(`company-${fullMessage.companyId}-appMessage`, {
          action: "update",
          message: fullMessage
        });
    }
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack. Err: ${err}`);
  }
};

const verifyRecentCampaign = async (
  message: proto.IWebMessageInfo,
  companyId: number
) => {
  if (!isValidMsg(message)) {
    return;
  }
  if (!message.key.fromMe) {
    const number = message.key.remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
    const campaigns = await Campaign.findAll({
      where: { companyId, status: "EM_ANDAMENTO", confirmation: true }
    });
    if (campaigns) {
      const ids = campaigns.map(c => c.id);
      const campaignShipping = await CampaignShipping.findOne({
        where: {
          campaignId: { [Op.in]: ids },
          number,
          confirmation: null,
          deliveredAt: { [Op.ne]: null }
        }
      });

      if (campaignShipping) {
        await campaignShipping.update({
          confirmedAt: moment(),
          confirmation: true
        });
        await campaignQueue.add(
          "DispatchCampaign",
          {
            campaignShippingId: campaignShipping.id,
            campaignId: campaignShipping.campaignId
          },
          {
            delay: parseToMilliseconds(randomValue(0, 10))
          }
        );
      }
    }
  }
};

const verifyCampaignMessageAndCloseTicket = async (
  message: proto.IWebMessageInfo,
  companyId: number,
  wbot: Session
) => {
  if (!isValidMsg(message)) {
    return;
  }

  const io = getIO();
  const body = await getBodyMessage(message);
  const isCampaign = /\u200c/.test(body);

  if (message.key.fromMe && isCampaign) {
    let msgContact: IMe;
    msgContact = await getContactMessage(message, wbot);
    const contact = await verifyContact(msgContact, wbot, companyId);

    const messageRecord = await Message.findOne({
      where: {
        [Op.or]: [{ wid: message.key.id! }, { contactId: contact.id }],
        companyId
      }
    });

    if (
      !isNull(messageRecord) ||
      !isNil(messageRecord) ||
      messageRecord !== null
    ) {
      const ticket = await Ticket.findByPk(messageRecord.ticketId);
      await ticket.update({ status: "closed", amountUsedBotQueues: 0 });

      io.of(String(companyId))
        // .to("open")
        .emit(`company-${companyId}-ticket`, {
          action: "delete",
          ticket,
          ticketId: ticket.id
        });

      io.of(String(companyId))
        // .to(ticket.status)
        // .to(ticket.id.toString())
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket,
          ticketId: ticket.id
        });
    }
  }
};

const filterMessages = (msg: WAMessage): boolean => {
  // msgDB.save(msg);

  if (msg.message?.protocolMessage?.editedMessage) return true;
  if (msg.message?.protocolMessage) return false;

  if (
    [
      WAMessageStubType.REVOKE,
      WAMessageStubType.E2E_DEVICE_CHANGED,
      WAMessageStubType.E2E_IDENTITY_CHANGED,
      WAMessageStubType.CIPHERTEXT
    ].includes(msg.messageStubType)
  )
    return false;

  return true;
};

// Logs de debug de eventos Baileys removidos para produção
/**
 * Tipos de "mensagem de sistema" que representam ENTRADA em grupo.
 *
 * POR QUE ISTO EXISTE
 *
 * A saudação dependia só do evento `group-participants.update`. Em produção
 * esse evento não chegou nenhuma vez em nenhuma conexão Baileys, enquanto as
 * mensagens chegavam normalmente — inclusive as de sistema ("Fulano entrou
 * usando um link de convite"), que o WhatsApp entrega como mensagem comum com
 * um `messageStubType`.
 *
 * Então passamos a reconhecer a entrada também por aqui, pelo caminho que
 * comprovadamente funciona. Os dois caminhos convivem: o que chegar primeiro
 * saúda, e o outro é descartado pelo controle de repetição.
 *
 * Os nomes são resolvidos na enumeração em tempo de execução porque ela muda
 * entre versões do Baileys — o que não existir vira `undefined` e é
 * descartado, sem quebrar nada.
 */
const TIPOS_DE_ENTRADA_EM_GRUPO: number[] = [
  "GROUP_PARTICIPANT_ADD",
  "GROUP_PARTICIPANT_INVITE",
  "GROUP_PARTICIPANT_ADD_REQUEST_JOIN",
  "GROUP_PARTICIPANT_LINKED_GROUP_JOIN",
  "GROUP_PARTICIPANT_JOINED_GROUP_BY_INVITE_LINK"
]
  .map(nome => (WAMessageStubType as any)?.[nome])
  .filter(valor => typeof valor === "number");

/**
 * Saúda quem entrou, a partir da mensagem de sistema do grupo.
 * Nunca lança: saudação é acessório e não pode atrapalhar a recepção.
 */
const saudarPelaMensagemDeSistema = async (
  message: proto.IWebMessageInfo,
  wbot: Session,
  companyId: number
): Promise<void> => {
  try {
    const grupoJid = String(message?.key?.remoteJid || "");
    if (!grupoJid.endsWith("@g.us")) return;

    const tipo = message?.messageStubType;
    if (typeof tipo !== "number" || !TIPOS_DE_ENTRADA_EM_GRUPO.includes(tipo)) return;

    // Os JIDs de quem entrou vêm nos parâmetros da mensagem de sistema.
    const entraram = (message.messageStubParameters || [])
      .map(p => String(p || ""))
      .filter(p => p.includes("@"));

    if (entraram.length === 0) return;

    logger.info(
      `[GROUP] entrada por mensagem de sistema (tipo ${tipo}) em ${grupoJid}: ${entraram.length} participante(s)`
    );

    // Controle de repetição: o mesmo ingresso pode chegar pelo evento
    // `group-participants.update` E por esta mensagem. Sem isto a pessoa
    // receberia a saudação duas vezes.
    const novos: string[] = [];
    for (const jid of entraram) {
      const chave = `saudacao_grupo_${companyId}_${grupoJid}_${jid}`;
      // eslint-disable-next-line no-await-in-loop
      const jaSaudado = await cacheLayer.get(chave);
      if (jaSaudado) continue;
      // eslint-disable-next-line no-await-in-loop
      await cacheLayer.set(chave, "1", "EX", 120);
      novos.push(jid);
    }

    if (novos.length === 0) return;

    const mod = await import("../GroupServices/GroupGreetingService");
    await mod.default({
      companyId,
      whatsappId: wbot.id,
      groupJid: grupoJid,
      participantJids: novos
    });
  } catch (err: any) {
    logger.warn(
      `[GroupGreeting] falha ao saudar pela mensagem de sistema: ${err?.message}`
    );
  }
};

const wbotMessageListener = (wbot: Session, companyId: number): void => {
  wbot.ev.on("messages.upsert", async (messageUpsert: ImessageUpsert) => {
    // ✅ Registrar atividade da sessão ao receber mensagens
    if (wbot.id) {
      const { touchSessionActivity } = await import("../../libs/wbot");
      touchSessionActivity(wbot.id);
    }

    const messages = messageUpsert.messages
      .filter(filterMessages)
      .map(msg => msg);

    if (!messages) return;

    // Entrada em grupo detectada pela mensagem de sistema. Fica antes do
    // processamento normal e é independente dele: mesmo que a mensagem seja
    // descartada adiante (mensagem de sistema não vira ticket), a saudação
    // acontece.
    for (const m of messages) {
      saudarPelaMensagemDeSistema(m, wbot, companyId);
    }

    messages.forEach(async (message: proto.IWebMessageInfo) => {
      try {
        if (
          message?.messageStubParameters?.length &&
          message.messageStubParameters[0].includes("absent")
        ) {
          const msg = {
            companyId: companyId,
            whatsappId: wbot.id,
            message: message
          };
          logger.warn("MENSAGEM PERDIDA", JSON.stringify(msg));
        }
        // ✅ findOne com attributes mínimos é mais rápido que count() — evita full scan
        const messageExists = await Message.findOne({
          where: { wid: message.key.id!, companyId },
          attributes: ["id"],
          raw: true
        });

        if (!messageExists) {
          let isCampaign = false;
          let body = await getBodyMessage(message);
          const fromMe = message?.key?.fromMe;
          if (fromMe) {
            isCampaign = /\u200c/.test(body);
          } else {
            if (/\u200c/.test(body)) body = body.replace(/\u200c/, "");
            logger.debug(
              "Validação de mensagem de campanha enviada por terceiros: " + body
            );
          }

          if (!isCampaign) {
            if (REDIS_URI_MSG_CONN !== "") {
              try {
                await BullQueues.add(
                  `${process.env.DB_NAME}-handleMessage`,
                  { message, wbot: wbot.id, companyId },
                  {
                    priority: 1,
                    jobId: `${wbot.id}-handleMessage-${message.key.id}`
                  }
                );
              } catch (e) {
                Sentry.captureException(e);
              }
            } else {
              await handleMessage(message, wbot, companyId);
            }
          }

          await verifyRecentCampaign(message, companyId);
          await verifyCampaignMessageAndCloseTicket(message, companyId, wbot);
        }

        if (message.key.remoteJid?.endsWith("@g.us")) {
          if (REDIS_URI_MSG_CONN !== "") {
            BullQueues.add(
              `${process.env.DB_NAME}-handleMessageAck`,
              { msg: message, chat: 2 },
              {
                priority: 1,
                jobId: `${wbot.id}-handleMessageAck-${message.key.id}`
              }
            );
          } else {
            handleMsgAck(message as any, 2);
          }
        }
      } catch (err) {
        logger.warn(`[messages.upsert] Erro silencioso ao processar mensagem ${message?.key?.id}: ${err?.message || err}`);
      }
    });

    // messages.forEach(async (message: proto.IWebMessageInfo) => {
    //   const messageExists = await Message.count({
    //     where: { id: message.key.id!, companyId }
    //   });

    //   if (!messageExists) {
    //     await handleMessage(message, wbot, companyId);
    //     await verifyRecentCampaign(message, companyId);
    //     await verifyCampaignMessageAndCloseTicket(message, companyId);
    //   }
    // });
  });

  wbot.ev.on("messages.update", (messageUpdate: WAMessageUpdate[]) => {
    if (messageUpdate.length === 0) return;
    messageUpdate.forEach(async (message: WAMessageUpdate) => {
      try {
        (wbot as WASocket)!.readMessages([message.key]);

        const msgUp = { ...messageUpdate };

        if (
          msgUp["0"]?.update.messageStubType === 1 &&
          msgUp["0"]?.key.remoteJid !== "status@broadcast"
        ) {
          MarkDeleteWhatsAppMessage(
            msgUp["0"]?.key.remoteJid,
            null,
            msgUp["0"]?.key.id,
            companyId
          );
        }

        let ack: number = message.update.status || 1;

        if (REDIS_URI_MSG_CONN !== "") {
          BullQueues.add(
            `${process.env.DB_NAME}-handleMessageAck`,
            { msg: message, chat: ack },
            {
              priority: 1,
              jobId: `${wbot.id}-handleMessageAck-${message.key.id}`
            }
          );
        } else {
          handleMsgAck(message, ack);
        }
      } catch (err) {
        logger.warn(`[messages.update] Erro silencioso ao processar update ${message?.key?.id}: ${err?.message || err}`);
      }
    });
  });

  // ✅ Baileys v7: Escutar evento lid-mapping.update e persistir no WhatsappLidMap
  //
  // BUG CORRIGIDO: crash "TypeError: mappings is not iterable" recorrente ao
  // conectar. A doc oficial do Baileys descreve esse evento como retornando
  // "a new LID/PN mapping if found" (singular) — o payload real pode chegar
  // como UM objeto solto {lid, pn}, não necessariamente um array. Como
  // `mappings.length` de um objeto solto é `undefined` (não `0`), o guard
  // antigo (`!mappings || mappings.length === 0`) deixava passar, e o
  // `for...of` quebrava em cima de algo não-iterável. Normaliza o payload
  // pra array sempre, aceitando tanto array quanto objeto único, antes de
  // iterar — resolve o crash independente do formato exato usado pelo fork.
  wbot.ev.on("lid-mapping.update" as any, async (rawMappings: any) => {
    const mappings: Array<{ lid: string; pn: string }> = Array.isArray(rawMappings)
      ? rawMappings
      : rawMappings && typeof rawMappings === "object" && (rawMappings.lid || rawMappings.pn)
        ? [rawMappings]
        : [];

    if (mappings.length === 0) return;
    logger.debug(`[LID-V7] Recebidos ${mappings.length} mapeamentos LID ↔ PN`);

    for (const { lid, pn } of mappings) {
      if (!lid || !pn) continue;
      try {
        // ✅ Alimentar cache global LID↔PN
        addLidPnMapping(lid, pn);
        
        // Normalizar o número do telefone (remover @s.whatsapp.net se presente)
        const phoneNumber = pn.includes("@") ? pn.split("@")[0] : pn;
        // Normalizar o LID (manter formato completo com @lid se presente)
        const normalizedLid = lid.includes("@") ? lid : `${lid}@lid`;

        // Buscar contato pelo número de telefone
        const contact = await Contact.findOne({
          where: { companyId, number: phoneNumber }
        });

        if (contact) {
          // Atualizar o campo lid no contato
          if (!contact.lid || contact.lid !== normalizedLid) {
            await contact.update({ lid: normalizedLid });
            logger.debug(`[LID-V7] Atualizado LID do contato ${contact.id}: ${normalizedLid}`);
          }

          // Criar/atualizar mapeamento no WhatsappLidMap
          const existingMap = await WhatsappLidMap.findOne({
            where: { companyId, contactId: contact.id }
          });

          if (!existingMap) {
            await WhatsappLidMap.create({
              companyId,
              lid: normalizedLid,
              contactId: contact.id
            });
            logger.debug(`[LID-V7] Criado mapeamento LID para contato ${contact.id}: ${normalizedLid}`);
          } else if (existingMap.lid !== normalizedLid) {
            await existingMap.update({ lid: normalizedLid });
            logger.debug(`[LID-V7] Atualizado mapeamento LID para contato ${contact.id}: ${normalizedLid}`);
          }
        } else {
          logger.debug(`[LID-V7] Contato não encontrado para PN ${phoneNumber}, mapeamento será criado quando o contato for registrado`);
        }
      } catch (error) {
        logger.error(`[LID-V7] Erro ao persistir mapeamento LID ${lid} → ${pn}: ${error.message}`);
      }
    }
  });

  // wbot.ev.on('message-receipt.update', (events: any) => {
  //   events.forEach(async (msg: any) => {
  //     const ack = msg?.receipt?.receiptTimestamp ? 3 : msg?.receipt?.readTimestamp ? 4 : 0;
  //     if (!ack) return;
  //     await handleMsgAck(msg, ack);
  //   });
  // })

  // ✅ Presence updates: emite "digitando..." e "online" para o frontend em tempo real
  wbot.ev.on("presence.update", async (presenceData: any) => {
    try {
      const { id: jid, presences } = presenceData;
      logger.info(`[PRESENCE-EVENT] presence.update bruto company=${companyId} wbot=${wbot.id} data=${JSON.stringify(presenceData)}`);
      if (!jid || !presences) {
        logger.warn(`[PRESENCE-EVENT] ignorado sem jid/presences company=${companyId} wbot=${wbot.id}`);
        return;
      }

      logger.debug(`[PRESENCE] Recebido de ${jid} → ${JSON.stringify(presences)}`);

      const presenceEntries = Object.entries(presences);
      if (!presenceEntries.length) {
        logger.warn(`[PRESENCE-EVENT] sem presenças jid=${jid} presences=${JSON.stringify(presences)}`);
        return;
      }

      for (const [participantJid, firstPresence] of presenceEntries) {
        const presence = firstPresence as any;
        const possibleJids = Array.from(new Set([jid, participantJid].filter(Boolean).map(String)));
        let contact = null;
        let matchedJid = possibleJids[0];
        let matchedRawNumber = "";
        let matchedResolvedNumber = null;

        for (const currentJid of possibleJids) {
          const rawNumber = currentJid.replace(/[@:].*/g, "");
          if (!rawNumber) continue;

          const resolvedNumber = currentJid.includes("@lid") ? resolvePN(currentJid) : null;
          const contactWhere: any[] = [
            { companyId, number: rawNumber },
            { companyId, remoteJid: currentJid },
            { companyId, lid: rawNumber },
            { companyId, lid: `${rawNumber}@lid` }
          ];

          if (resolvedNumber) {
            contactWhere.push({ companyId, number: resolvedNumber });
            contactWhere.push({ companyId, remoteJid: `${resolvedNumber}@s.whatsapp.net` });
          }

          contact = await Contact.findOne({
            where: { [Op.or]: contactWhere },
            attributes: ["id", "number", "remoteJid", "lid"]
          });

          if (!contact && currentJid.includes("@lid")) {
            const lidMap = await WhatsappLidMap.findOne({
              where: { companyId, lid: { [Op.in]: [rawNumber, currentJid, `${rawNumber}@lid`] } },
              attributes: ["contactId"]
            });
            if (lidMap) {
              contact = await Contact.findOne({
                where: { id: lidMap.contactId, companyId },
                attributes: ["id", "number", "remoteJid", "lid"]
              });
            }
          }

          if (contact) {
            matchedJid = currentJid;
            matchedRawNumber = rawNumber;
            matchedResolvedNumber = resolvedNumber;
            break;
          }
        }

        if (!contact) {
          logger.warn(`[PRESENCE] Contato não encontrado para jid=${jid} participant=${participantJid}`);
          continue;
        }

        const ticket = await Ticket.findOne({
          where: {
            contactId: contact.id,
            companyId,
            whatsappId: wbot.id,
            status: { [Op.or]: ["open", "pending", "group", "chatbot", "nps", "lgpd"] }
          },
          attributes: ["id"],
          order: [["updatedAt", "DESC"]]
        });

        if (!ticket) {
          logger.warn(`[PRESENCE] Ticket aberto não encontrado para contato ${contact.id} (${contact.number}) wbot=${wbot.id}`);
          continue;
        }

        // "paused" significa que o contato parou de digitar, não que ficou offline.
        // Mapear para "available" para manter o "Online" visível.
        const rawPresence = presence?.lastKnownPresence || "unavailable";
        const presenceState = rawPresence === "paused" ? "available" : rawPresence;

        logger.debug(`[PRESENCE] → emitindo ticket=${ticket.id} contact=${contact.id} jid=${matchedJid} raw=${matchedRawNumber} resolved=${matchedResolvedNumber || "null"} state=${presenceState} lastSeen=${presence?.lastSeen || "null"}`);

        const io = getIO();
        io.of(String(companyId)).emit(`company-${companyId}-presence`, {
          ticketId: ticket.id,
          contactId: contact.id,
          presence: presenceState, // "composing" | "recording" | "available" | "unavailable" | "paused"
          lastSeen: presence?.lastSeen || null,
        });
        logger.info(`[PRESENCE-EVENT] emitido no socket namespace=/${companyId} event=company-${companyId}-presence`);

        // Salvar último estado em cache para reenviar após refresh de página.
        try {
          const { setLastPresence } = await import("../../libs/socket");
          setLastPresence(
            companyId,
            ticket.id,
            presenceState,
            presence?.lastSeen || null,
            contact.id
          );
        } catch (cacheErr) {
          logger.warn(`[PRESENCE] falha ao cachear última presença: ${(cacheErr as Error)?.message || cacheErr}`);
        }
      }
    } catch (err) {
      logger.error(`[PRESENCE] Erro ao processar presence.update: ${err}`);
    }
  });

  wbot.ev.on("contacts.update", async (contacts: any) => {
    // TRAVA DE IMPORTAÇÃO AUTOMÁTICA DE AGENDA
    //
    // Ao conectar, o WhatsApp despeja a agenda inteira do celular via
    // contacts.update. Sem esta trava, todos viravam contato no sistema mesmo
    // sem o operador ter marcado importação na conexão. Agora só importamos a
    // agenda quando há pedido explícito (importOldMessages/importRecentMessages).
    //
    // Isto NÃO afeta a criação de contato de quem realmente interage: essa
    // acontece via verifyContact no fluxo de mensagem recebida, noutro caminho.
    let importSolicitado = false;
    try {
      const wppFlags = await Whatsapp.findByPk(wbot.id, {
        attributes: ["importOldMessages", "importRecentMessages"]
      });
      importSolicitado =
        !!wppFlags?.importOldMessages || !!wppFlags?.importRecentMessages;
    } catch (e) {
      importSolicitado = false;
    }
    if (!importSolicitado) {
      return;
    }

    contacts.forEach(async (contact: any) => {

      if (!contact?.id) return;

      // ✅ FIX: Extrair mapeamento LID↔PN de contacts.update
      if (contact.lid && contact.id) {
        extractMappingsFromContacts([contact]);
      }

      // Aceitar @lid contacts se tiverem um LID mapeável
      if (!contact.id.includes("@s.whatsapp.net") && !contact.id.includes("@g.us")) {
        // Se é um @lid, tentar resolver via cache
        if (contact.id.includes("@lid")) {
          const lidNum = contact.id.split('@')[0].split(':')[0].replace(/\D/g, '');
          const cachedPn = resolvePN(lidNum);
          if (cachedPn) {
            contact.id = `${cachedPn}@s.whatsapp.net`;
            logger.info(`[CONTACTS-UPDATE] ✅ @lid resolvido via cache: ${lidNum} → ${cachedPn}`);
          } else {
            return; // Não conseguimos resolver, ignorar
          }
        } else {
          return;
        }
      }

      const isGroup = contact.id.includes("@g.us");
      const number = isGroup
        ? contact.id.replace("@g.us", "")
        : contact.id.replace("@s.whatsapp.net", "");

      if (!/^\d{10,15}$/.test(number)) {

        return;
      }

      // ✅ Usar nome real do contato (notify/verifiedName/name) ao invés do número
      const contactName = contact.notify || contact.verifiedName || contact.name || number;

      let profilePicUrl: string = "";
      try {
        // imgUrl pode ser undefined, null ou string vazia
        if (contact.imgUrl && contact.imgUrl !== "" && contact.imgUrl !== "changed") {
          profilePicUrl = contact.imgUrl;
        } else {
          profilePicUrl = await wbot.profilePictureUrl(contact.id, "image");
        }
      } catch (e) {
        profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
      }

      const contactData = {
        name: contactName,
        number,
        isGroup,
        companyId,
        remoteJid: contact.id,
        profilePicUrl,
        whatsappId: wbot.id,
        wbot
      };

      await CreateOrUpdateContactService(contactData);
    });
  });


  // Handlers extras removidos para produção

  wbot.ev.on('group-participants.update', async (event) => {
    const { id, participants, action, author } = event
    logger.info(`[GROUP] group-participants.update: ${action} em ${id}`);

    // Saudação de novos membros ANTES de qualquer outra coisa.
    //
    // Estava depois do early-return de metadata logo abaixo — e esse return
    // dispara sempre que o grupo não está no cache de metadados, que é
    // justamente o caso comum logo após um restart do backend. Resultado: a
    // saudação simplesmente não acontecia, sem erro nenhum no log. A
    // saudação não depende do cache pra nada, então não tem por que ficar
    // refém dele.
    if (action === 'add' && Array.isArray(participants) && participants.length) {
      // Passa pelo mesmo controle de repetição da mensagem de sistema, para
      // ninguém receber a saudação duas vezes quando os dois caminhos
      // detectarem o mesmo ingresso.
      const aindaNaoSaudados: string[] = [];
      for (const jid of participants) {
        const chave = `saudacao_grupo_${companyId}_${id}_${jid}`;
        // eslint-disable-next-line no-await-in-loop
        const jaSaudado = await cacheLayer.get(chave);
        if (jaSaudado) continue;
        // eslint-disable-next-line no-await-in-loop
        await cacheLayer.set(chave, "1", "EX", 120);
        aindaNaoSaudados.push(jid);
      }
      if (aindaNaoSaudados.length === 0) return;
      // Import dinâmico: este arquivo é o coração da recepção de mensagens e
      // não pode depender, no carregamento, de nenhum módulo que volte a
      // importá-lo. Carregar a saudação só quando alguém entra num grupo
      // mantém a inicialização deste módulo livre de qualquer ciclo.
      import("../GroupServices/GroupGreetingService")
        .then(mod =>
          mod.default({
            companyId,
            whatsappId: wbot.id,
            groupJid: id,
            participantJids: aindaNaoSaudados
          })
        )
        .catch(err => {
          logger.warn(`[GroupGreeting] Falha na saudação do grupo ${id}: ${err?.message}`);
        });
    }

    const metadata = await getGroupMetadataCache(wbot.id, id)

    if (!Array.isArray(metadata?.participants)) {
      return
    }

    if (action === 'add') {
      logger.info(`Adicionando participantes ao grupo ${id}, atualizando cache`)
      metadata.participants.push(...participants.map(p => ({
        id: p,
        admin: null
      })))
    } else if (action === 'demote' || action === 'promote') {
      logger.info(`Atualizando ${action === 'promote' ? 'admin' : 'participante'} do grupo ${id}, atualizando cache`)
      metadata.participants = metadata.participants.map(p => participants.includes(p.id) ? ({
        id: p.id,
        admin: action === 'promote' ? 'admin' : null
      }) : p)
    } else if (action === 'remove') {
      logger.info(`Removendo participante do grupo ${id}, atualizando cache`)
      metadata.participants = metadata.participants.filter(p => !participants.includes(p.id))
    } else if (action === 'modify') {
      logger.info(`Modificando participante do grupo ${id}, atualizando cache`)
      metadata.participants = metadata.participants.filter(p => p.id !== author)
      metadata.participants.push(...participants.map(p => ({
        id: p,
        admin: null
      })))
    }

    await groupMetadataCache.set(id, wbot.id, {
      timestamp: metadata.timestamp,
      data: metadata,
    })
  })

  wbot.ev.on("groups.update", (groupUpdate: GroupMetadata[]) => {
    // Logs de debug de grupos removidos para produção

    if (!groupUpdate[0]?.id) return;
    if (groupUpdate.length === 0) return;
    groupUpdate.forEach(async (group: GroupMetadata) => {
      const number = group.id.substr(0, group.id.indexOf("@"));
      const nameGroup = group.subject || number;

      let profilePicUrl: string = "";
      try {
        profilePicUrl = await wbot.profilePictureUrl(group.id, "image");
      } catch (e) {
        profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
      }
      const contactData = {
        name: nameGroup,
        number: number,
        isGroup: true,
        companyId: companyId,
        remoteJid: group.id,
        profilePicUrl,
        whatsappId: wbot.id,
        wbot: wbot
      };

      const contact = await CreateOrUpdateContactService(contactData);
    });
  });
};

export {
  wbotMessageListener,
  handleMessage,
  isValidMsg,
  getTypeMessage,
  handleMsgAck
};

// Função helper para mapear corretamente o mediaType baseado no MIME type completo
const getMediaTypeFromMimeType = (mimetype: string): string => {
  // Mapeamento específico para tipos de documento que devem ser tratados como "document"
  const documentMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
    "application/vnd.oasis.opendocument.graphics",
    "application/rtf",
    "text/plain",
    "text/csv",
    "text/html",
    "text/xml",
    "application/xml",
    "application/json",
    "application/ofx",
    "application/vnd.ms-outlook",
    "application/vnd.apple.keynote",
    "application/vnd.apple.numbers",
    "application/vnd.apple.pages"
  ];

  // Mapeamento para tipos de arquivo compactado
  const archiveMimeTypes = [
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/x-tar",
    "application/gzip",
    "application/x-bzip2"
  ];

  if (documentMimeTypes.includes(mimetype)) {
    return "document";
  }

  if (archiveMimeTypes.includes(mimetype)) {
    return "document"; // Tratar como documento para download
  }

  // Para outros tipos, usar a lógica padrão
  return mimetype.split("/")[0];
};
