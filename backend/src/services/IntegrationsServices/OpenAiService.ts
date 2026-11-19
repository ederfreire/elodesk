import { MessageUpsertType, proto, WASocket } from "@whiskeysockets/baileys";
import {
  getBodyMessage,
  keepOnlySpecifiedChars,
  transferQueue,
  verifyMediaMessage,
  verifyMessage,
} from "../WbotServices/wbotMessageListener";
import { isNil } from "lodash";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { GoogleGenerativeAI, Part, Content } from "@google/generative-ai";
import axios from "axios";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import TicketTraking from "../../models/TicketTraking";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import Queue from "../../models/Queue";
import User from "../../models/User";
import UserQueue from "../../models/UserQueue";
import Schedule from "../../models/Schedule";
import PromptKnowledgeBase from "../../models/PromptKnowledgeBase";
import { Op } from "sequelize";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { IConnections, INodes } from "../WebhookService/DispatchWebHookService";
import logger from "../../utils/logger";
import trackTokenUsage from "../../helpers/TrackTokenUsage";
import { getWbot } from "../../libs/wbot";
import { getJidOf } from "../WbotServices/getJidOf";
import formatBody from "../../helpers/Mustache";
import getCachedOnWhatsApp from "../../utils/onWhatsAppCache";
import { normalizeJid } from "../../utils";
import { obterClienteIA, janelaDeHistorico, executarComControle } from "../../helpers/ControleDeIA";

type Session = WASocket & {
  id?: number;
};

interface IOpenAi {
  name: string;
  prompt: string;
  voice: string;
  voiceKey: string;
  voiceRegion: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  queueId: number;
  maxMessages: number;
  model: string;
  provider?: "openai" | "gemini";
  
  // Campos para controle de fluxo
  flowMode?: "permanent" | "temporary";
  maxInteractions?: number;
  continueKeywords?: string[];
  completionTimeout?: number;
  objective?: string;
  autoCompleteOnObjective?: boolean;

  // Novos campos do agente de IA
  transferKeywords?: string;
  responseDelay?: number;
  charLimit?: number;
  humanizeConversation?: boolean;
  allowTransfer?: boolean;
  transferMessage?: string;
  transferQueueId?: number | null;
  transferUserId?: number | null;
  transferStatus?: string;
  transcribeAudio?: boolean;
  audioEnabled?: boolean;
  responseMode?: string;
  agentVoice?: string;
  sendAsPTT?: boolean;

  // Idiomas configurados no agente (JSON array string ou array)
  languages?: string | string[];

  // ── Ferramentas configuráveis do Agente ──
  toolOpenTicket?: boolean;
  toolOpenTicketConfig?: string | Record<string, any>;
  toolNotifyHuman?: boolean;
  toolNotifyHumanConfig?: string | Record<string, any>;
  toolHttpRequest?: boolean;
  toolHttpRequestConfig?: string | Record<string, any>;
  toolScheduling?: boolean;
  toolSchedulingConfig?: string | Record<string, any>;

  // ── Turno / Horário de atendimento ──
  workingHoursEnabled?: boolean;
  workingHoursTimezone?: string;
  workingHoursOutOfMessage?: string;
  workingHoursSchedule?: string | Record<string, any>;
}

interface SessionOpenAi extends OpenAI {
  id?: number;
}

interface SessionGemini extends GoogleGenerativeAI {
  id?: number;
}

// Estado para debounce/agregação de mensagens em rajada por ticket.
// Armazena o timestamp (ms) da última mensagem recebida para cada ticket.
// Se uma execução, ao acordar do timer, perceber que o valor mudou,
// significa que uma mensagem mais nova chegou e ela deve abortar.
const pendingAiRuns: Map<string, number> = new Map();

const buildNotifyNumberCandidates = (number: string): string[] => {
  const clean = String(number || "").replace(/\D/g, "");
  const candidates = [clean];

  if (clean.startsWith("55") && clean.length === 13 && clean[4] === "9") {
    candidates.push(`${clean.slice(0, 4)}${clean.slice(5)}`);
  }

  if (clean.startsWith("55") && clean.length === 12) {
    candidates.push(`${clean.slice(0, 4)}9${clean.slice(4)}`);
  }

  return Array.from(new Set(candidates.filter(n => n.length >= 10)));
};

const resolveNotifyJid = async (wbot: any, number: string): Promise<string> => {
  const candidates = buildNotifyNumberCandidates(number);

  for (const candidate of candidates) {
    const rawJid = normalizeJid(`${candidate}@s.whatsapp.net`);
    // 1) Mesma lógica do chat: getCachedOnWhatsApp
    try {
      const validation = await getCachedOnWhatsApp(wbot, rawJid);
      if (validation?.exists && validation.jid) {
        return validation.jid;
      }
    } catch (err: any) {
      logger.warn(`[AI TOOL] getCachedOnWhatsApp falhou para ${candidate}: ${err?.message}`);
    }
    // 2) Fallback direto no socket
    try {
      if (typeof wbot?.onWhatsApp === "function") {
        const result = await wbot.onWhatsApp(`${candidate}@s.whatsapp.net`);
        const match = Array.isArray(result) ? result.find((r: any) => r?.exists && r?.jid) : null;
        if (match?.jid) return match.jid;
      }
    } catch (err: any) {
      logger.warn(`[AI TOOL] Falha ao validar WhatsApp ${candidate}: ${err?.message}`);
    }
  }

  return `${candidates[0]}@s.whatsapp.net`;
};

const sessionsOpenAi: SessionOpenAi[] = [];
const sessionsGemini: SessionGemini[] = [];

// Detecta o idioma do cliente a partir das últimas mensagens recebidas no ticket.
// Retorna um código simples: "pt" | "es" | "en" | "fr" | "it" | "de".
const detectContactLanguage = async (ticket: any): Promise<string> => {
  try {
    if (!ticket?.id) return "pt";
    const msgs = await Message.findAll({
      where: { ticketId: ticket.id, fromMe: false },
      order: [["createdAt", "DESC"]],
      limit: 10
    });
    const text = (msgs || [])
      .map((m: any) => String(m?.body || ""))
      .join(" ")
      .toLowerCase();
    if (!text.trim()) return "pt";

    // Heurística por palavras/marcas comuns de cada idioma.
    const score: Record<string, number> = { pt: 0, es: 0, en: 0, fr: 0, it: 0, de: 0 };
    const has = (re: RegExp, lang: string, w = 1) => { if (re.test(text)) score[lang] += w; };

    // Português
    has(/\b(você|voce|obrigado|obrigada|atendente|por favor|bom dia|boa tarde|boa noite|olá|ola|quero|preciso|falar com|gostaria|não|sim)\b/, "pt", 2);
    has(/ção\b|ções\b|ãe|õe/, "pt");
    // Espanhol
    has(/\b(hola|gracias|por favor|buenos días|buenas tardes|buenas noches|quiero|necesito|hablar con|señor|señora|sí|no)\b/, "es", 2);
    has(/ñ|¿|¡/, "es");
    // Inglês
    has(/\b(hello|hi|thanks|thank you|please|good morning|good afternoon|good evening|i want|i need|speak to|agent|support)\b/, "en", 2);
    // Francês
    has(/\b(bonjour|merci|s'il vous plaît|svp|bonsoir|salut|je veux|je voudrais|parler avec|agent|s'il te plaît)\b/, "fr", 2);
    has(/ç|œ|è|ê|à|î/, "fr");
    // Italiano
    has(/\b(ciao|grazie|per favore|buongiorno|buonasera|voglio|vorrei|parlare con|operatore|sì)\b/, "it", 2);
    // Alemão
    has(/\b(hallo|danke|bitte|guten morgen|guten tag|guten abend|ich möchte|ich will|sprechen mit|kundenservice|ja|nein)\b/, "de", 2);
    has(/ß|ä|ö|ü/, "de");

    let best = "pt";
    let bestScore = 0;
    for (const k of Object.keys(score)) {
      if (score[k] > bestScore) { bestScore = score[k]; best = k; }
    }
    return bestScore === 0 ? "pt" : best;
  } catch {
    return "pt";
  }
};

// Template do alerta de notificação ao humano, traduzido por idioma.
const buildNotificationText = (
  lang: string,
  urgencyTxt: string,
  contactName: string,
  ticketId: any,
  reason: string
): string => {
  const tpl: Record<string, { title: string; contact: string; ticket: string; reason: string; noReason: string }> = {
    pt: { title: "Alerta do Agente IA", contact: "Contato", ticket: "Ticket", reason: "Motivo", noReason: "(sem motivo)" },
    es: { title: "Alerta del Agente IA", contact: "Contacto", ticket: "Ticket", reason: "Motivo", noReason: "(sin motivo)" },
    en: { title: "AI Agent Alert", contact: "Contact", ticket: "Ticket", reason: "Reason", noReason: "(no reason)" },
    fr: { title: "Alerte de l'Agent IA", contact: "Contact", ticket: "Ticket", reason: "Motif", noReason: "(sans motif)" },
    it: { title: "Avviso dell'Agente IA", contact: "Contatto", ticket: "Ticket", reason: "Motivo", noReason: "(nessun motivo)" },
    de: { title: "KI-Agenten-Benachrichtigung", contact: "Kontakt", ticket: "Ticket", reason: "Grund", noReason: "(kein Grund)" }
  };
  const t = tpl[lang] || tpl.pt;
  return `🔔 *${t.title}* (${urgencyTxt})\n\n${t.contact}: ${contactName}\n${t.ticket}: #${ticketId}\n\n${t.reason}: ${reason || t.noReason}`;
};

// Traduz o "motivo" para o idioma detectado, se necessário, usando o provider configurado.
// Falha silenciosamente e retorna o texto original.
const translateReasonIfNeeded = async (
  reason: string,
  lang: string,
  aiSettings: any
): Promise<string> => {
  try {
    const txt = String(reason || "").trim();
    if (!txt) return txt;
    if (!lang || lang === "pt") return txt;
    const apiKey = aiSettings?.apiKey;
    if (!apiKey) return txt;
    const langNames: Record<string, string> = {
      es: "Spanish", en: "English", fr: "French", it: "Italian", de: "German"
    };
    const target = langNames[lang];
    if (!target) return txt;

    const provider = aiSettings?.provider === "gemini" ? "gemini" : "openai";
    if (provider === "openai") {
      const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
      const resp = await client.chat.completions.create({
        model: aiSettings?.model || "gpt-4o-mini",
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: "system", content: `Translate the user text to ${target}. Reply ONLY with the translation, no quotes, no extra words.` },
          { role: "user", content: txt }
        ]
      }, { timeout: 30_000 });
      const out = resp?.choices?.[0]?.message?.content?.trim();
      return out || txt;
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: aiSettings?.model || "gemini-1.5-flash" });
      const r = await model.generateContent(
        `Translate the following text to ${target}. Reply ONLY with the translation:\n\n${txt}`
      );
      const out = r?.response?.text?.()?.trim();
      return out || txt;
    }
  } catch (e: any) {
    logger.warn(`[AI TOOL] notify_human - falha ao traduzir motivo: ${e?.message}`);
    return reason;
  }
};

// Envia alerta WhatsApp aos responsáveis configurados em toolNotifyHumanConfig.
// Reutilizado pela tool notify_human e pelos fluxos de transferência por palavra-chave / texto da IA.
const sendHumanNotification = async (
  wbot: any,
  ticket: any,
  aiSettings: any,
  reason: string,
  urgency: "low" | "medium" | "high" | string = "medium"
): Promise<{ success: boolean; notified: string[]; failed: { number: string; error: string }[]; error?: string }> => {
  try {
    const cfgRaw = aiSettings?.toolNotifyHumanConfig;
    let cfg: any = {};
    if (typeof cfgRaw === "string") { try { cfg = JSON.parse(cfgRaw); } catch { cfg = {}; } }
    else if (cfgRaw && typeof cfgRaw === "object") cfg = cfgRaw;

    let numbers: string[] = [];
    if (Array.isArray(cfg.whatsappNumbers)) {
      numbers = cfg.whatsappNumbers;
    } else if (cfg.whatsappNumber || cfg.number || cfg.phone) {
      numbers = [cfg.whatsappNumber || cfg.number || cfg.phone];
    }
    numbers = numbers
      .map((n: any) => String(n || "").replace(/\D/g, ""))
      .filter((n) => n.length >= 10);
    numbers = Array.from(new Set(numbers));

    if (numbers.length === 0) {
      return { success: false, notified: [], failed: [], error: "Nenhum número válido configurado em toolNotifyHumanConfig." };
    }
    if (!wbot) {
      return { success: false, notified: [], failed: [], error: "Sessão WhatsApp indisponível." };
    }

    const urgencyTxt = String(urgency || "medium").toUpperCase();
    const contactName = ticket?.contact?.name || "Cliente";
    const lang = await detectContactLanguage(ticket);
    const translatedReason = await translateReasonIfNeeded(reason, lang, aiSettings);
    const text = buildNotificationText(lang, urgencyTxt, contactName, ticket?.id, translatedReason);
    logger.info(`[AI TOOL] notify_human - idioma detectado: ${lang} (ticket ${ticket?.id})`);

    const notified: string[] = [];
    const failed: { number: string; error: string }[] = [];
    for (const num of numbers) {
      try {
        const jid = await resolveNotifyJid(wbot, num);
        logger.info(`[AI TOOL] notify_human - enviando para ${num} (jid=${jid}) ticket ${ticket?.id}`);
        const sent = await wbot.sendMessage(jid, {
          text,
          contextInfo: { forwardingScore: 0, isForwarded: false }
        });
        try { (wbot as any).store?.(sent); } catch { /* opcional */ }
        notified.push(num);
        logger.info(`[AI TOOL] notify_human - OK ${num} (jid=${jid})`);
      } catch (e: any) {
        logger.error(`[AI TOOL] notify_human - FALHA ${num}: ${e?.message}`);
        failed.push({ number: num, error: e?.message || "send failed" });
      }
    }
    logger.info(`[AI TOOL] notify_human enviado para ${notified.length}/${numbers.length} número(s) - ticket ${ticket?.id}`);
    return { success: notified.length > 0, notified, failed };
  } catch (err: any) {
    logger.error(`[AI TOOL] Erro em sendHumanNotification: ${err?.message}`);
    return { success: false, notified: [], failed: [], error: err?.message || "Falha ao notificar humano." };
  }
};

// Respeita flag opcional notifyOnTransfer (default: true)
const shouldNotifyOnTransfer = (aiSettings: any): boolean => {
  try {
    const cfgRaw = aiSettings?.toolNotifyHumanConfig;
    let cfg: any = {};
    if (typeof cfgRaw === "string") { try { cfg = JSON.parse(cfgRaw); } catch { cfg = {}; } }
    else if (cfgRaw && typeof cfgRaw === "object") cfg = cfgRaw;
    if (cfg && cfg.notifyOnTransfer === false) return false;
    return true;
  } catch { return true; }
};

// ── Turno / Horário de atendimento ──
type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const parseHM = (s: string): number | null => {
  if (!s || typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
};

const getNowInTimezone = (timezone: string): { day: DayKey; minutes: number } => {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const wd = (parts.find(p => p.type === "weekday")?.value || "").toLowerCase().slice(0, 3) as DayKey;
    const hh = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const mm = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    const day = (DAY_KEYS.includes(wd) ? wd : "mon") as DayKey;
    return { day, minutes: (isNaN(hh) ? 0 : hh) * 60 + (isNaN(mm) ? 0 : mm) };
  } catch {
    const d = new Date();
    return { day: DAY_KEYS[d.getDay()], minutes: d.getHours() * 60 + d.getMinutes() };
  }
};

export const isWithinWorkingHours = (aiSettings: any): boolean => {
  try {
    if (!aiSettings?.workingHoursEnabled) return true;
    const raw = aiSettings.workingHoursSchedule;
    let schedule: any = {};
    if (typeof raw === "string") { try { schedule = JSON.parse(raw); } catch { schedule = {}; } }
    else if (raw && typeof raw === "object") schedule = raw;

    const { day, minutes } = getNowInTimezone(aiSettings.workingHoursTimezone || "America/Sao_Paulo");
    const intervals = Array.isArray(schedule[day]) ? schedule[day] : [];
    if (intervals.length === 0) return false;

    for (const itv of intervals) {
      const start = parseHM(itv?.start);
      const end = parseHM(itv?.end);
      if (start === null || end === null) continue;
      if (start <= end) {
        if (minutes >= start && minutes < end) return true;
      } else {
        // intervalo que cruza meia-noite (ex: 22:00 - 02:00)
        if (minutes >= start || minutes < end) return true;
      }
    }
    return false;
  } catch (e: any) {
    logger.warn(`[AI SERVICE] Falha ao avaliar workingHours: ${e?.message}`);
    return true; // em caso de erro, não bloqueia
  }
};

const deleteFileSync = (path: string): void => {
  try {
    fs.unlinkSync(path);
  } catch (error) {
    console.error("Erro ao deletar o arquivo:", error);
  }
};

const sanitizeName = (name: string): string => {
  let sanitized = name.split(" ")[0];
  sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  return sanitized.substring(0, 60);
};

// =====================================================================
// FUNCTION CALLING - Ferramentas disponíveis para o agente de IA
// =====================================================================

const normalize = (str: string): string =>
  (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

// Lista todas as filas da empresa (com atendentes vinculados)
const listAvailableQueues = async (companyId: number) => {
  const queues = await Queue.findAll({
    where: { companyId },
    order: [["orderQueue", "ASC"]],
    include: [
      {
        model: User,
        attributes: ["id", "name", "email"],
        through: { attributes: [] }
      }
    ]
  });

  return queues.map(q => ({
    id: q.id,
    name: q.name,
    greetingMessage: q.greetingMessage || "",
    attendants: (q.users || []).map(u => ({ id: u.id, name: u.name }))
  }));
};

// Encontra fila por id ou nome (fuzzy)
const findQueueByIdOrName = async (
  companyId: number,
  queueId?: number,
  queueName?: string
): Promise<Queue | null> => {
  if (queueId) {
    const q = await Queue.findOne({ where: { id: queueId, companyId } });
    if (q) return q;
  }
  if (queueName) {
    // Limpa termos genéricos comuns ("setor de", "fila", "departamento", "atendimento")
    const cleaned = normalize(queueName)
      .replace(/\b(setor( de)?|fila|departamento|atendimento|equipe|time)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const target = cleaned || normalize(queueName);
    const queues = await Queue.findAll({ where: { companyId } });
    // 1) match exato
    let found = queues.find(q => normalize(q.name) === target);
    // 2) inclusão bidirecional
    if (!found) found = queues.find(q => normalize(q.name).includes(target) || target.includes(normalize(q.name)));
    // 3) match por palavras (qualquer palavra do alvo bate com o nome da fila)
    if (!found) {
      const words = target.split(" ").filter(w => w.length >= 3);
      found = queues.find(q => {
        const qn = normalize(q.name);
        return words.some(w => qn.includes(w));
      });
    }
    return found || null;
  }
  return null;
};

// Encontra atendente por nome dentro de uma fila (com fallback para empresa)
const findUserInQueue = async (
  queueId: number,
  companyId: number,
  userName?: string,
  userId?: number
): Promise<User | null> => {
  if (userId) {
    const user = await User.findOne({ where: { id: userId, companyId } });
    if (user) return user;
  }
  if (!userName) return null;

  const target = normalize(userName);
  const links = await UserQueue.findAll({ where: { queueId } });
  const userIds = links.map(l => l.userId);

  // 1) Tenta primeiro entre os atendentes vinculados à fila
  if (userIds.length > 0) {
    const usersInQueue = await User.findAll({ where: { id: userIds, companyId } });
    let found = usersInQueue.find(u => normalize(u.name) === target);
    if (!found) found = usersInQueue.find(u => normalize(u.name).includes(target) || target.includes(normalize(u.name)));
    if (found) return found;
  }

  // 2) Fallback: busca em todos os atendentes da empresa
  const allUsers = await User.findAll({ where: { companyId } });
  let found = allUsers.find(u => normalize(u.name) === target);
  if (!found) found = allUsers.find(u => normalize(u.name).includes(target) || target.includes(normalize(u.name)));
  return found || null;
};

// Definições das tools (OpenAI function calling) — montadas dinamicamente conforme os toggles
const buildAiTools = (aiSettings: IOpenAi): any[] => {
  const tools: any[] = [];
  // A transferência para humano agora é controlada apenas via palavras-chave
  // (configuradas em "Permitir transferência para atendente"). A ferramenta
  // "Abrir Atendimento" (transfer_ticket/list_queues) foi removida.

  if (aiSettings.toolNotifyHuman === true) {
    tools.push({
      type: "function",
      function: {
        name: "notify_human",
        description:
          "Envia uma notificação via WhatsApp ao número configurado para alertar um responsável humano, SEM transferir o atendimento. Use em casos de urgência, reclamação grave ou oportunidade comercial.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Resumo curto do motivo." },
            urgency: { type: "string", enum: ["low", "medium", "high"], description: "Nível de urgência." }
          },
          required: ["reason"]
        }
      }
    });
  }

  if (aiSettings.toolHttpRequest === true) {
    tools.push({
      type: "function",
      function: {
        name: "http_request",
        description:
          "Faz uma requisição HTTP (GET/POST/PUT/DELETE/PATCH) a uma API externa para consultar ou enviar dados a sistemas integrados (CEP, CRM, ERP, status de pedido, etc).",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL completa (https://...)." },
            method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH"] },
            headers: { type: "object", description: "Cabeçalhos opcionais." },
            body: { type: "object", description: "Corpo (POST/PUT/PATCH)." },
            query: { type: "object", description: "Parâmetros de query string." }
          },
          required: ["url", "method"]
        }
      }
    });
  }

  if (aiSettings.toolScheduling === true) {
    tools.push({
      type: "function",
      function: {
        name: "schedule_message",
        description:
          "Agenda o envio de uma mensagem ao cliente em uma data/hora futura. Use quando o cliente pedir lembrete, retorno ou combinar follow-up.",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string", description: "Texto da mensagem ao cliente." },
            sendAt: { type: "string", description: "Data/hora ISO 8601 (ex: '2026-05-20T14:30:00-03:00')." }
          },
          required: ["message", "sendAt"]
        }
      }
    });
  }

  return tools;
};

// Resultado da execução de uma tool
interface ToolExecutionResult {
  output: any;
  transferred?: boolean;
  transferQueueId?: number;
  transferUserId?: number;
  transferQueueName?: string;
  transferUserName?: string;
}

// Executa uma tool chamada pelo modelo
const executeAiTool = async (
  toolName: string,
  argsJson: string,
  ticket: Ticket,
  extras?: { aiSettings?: IOpenAi; wbot?: any }
): Promise<ToolExecutionResult> => {
  let args: any = {};
  try { args = JSON.parse(argsJson || "{}"); } catch { args = {}; }

  if (toolName === "list_queues") {
    const queues = await listAvailableQueues(ticket.companyId);
    return { output: { queues } };
  }

  if (toolName === "transfer_ticket") {
    const queue = await findQueueByIdOrName(ticket.companyId, args.queueId, args.queueName);
    if (!queue) {
      const available = await listAvailableQueues(ticket.companyId);
      return {
        output: {
          success: false,
          error: `Fila "${args.queueName}" não encontrada.`,
          available_queues: available.map(q => q.name)
        }
      };
    }

    let user: User | null = null;
    if (args.userName || args.userId) {
      user = await findUserInQueue(queue.id, ticket.companyId, args.userName, args.userId);
      if (!user && args.userName) {
        const links = await UserQueue.findAll({ where: { queueId: queue.id } });
        const users = await User.findAll({ where: { id: links.map(l => l.userId) } });
        return {
          output: {
            success: false,
            error: `Atendente "${args.userName}" não encontrado na fila ${queue.name}.`,
            available_users: users.map(u => u.name)
          }
        };
      }
    }

    return {
      output: {
        success: true,
        message: `Transferência preparada para fila ${queue.name}${user ? ` com atendente ${user.name}` : ""}.`,
        queueId: queue.id,
        queueName: queue.name,
        userId: user?.id || null,
        userName: user?.name || null
      },
      transferred: true,
      transferQueueId: queue.id,
      transferUserId: user?.id,
      transferQueueName: queue.name,
      transferUserName: user?.name
    };
  }

  if (toolName === "notify_human") {
    const result = await sendHumanNotification(
      extras?.wbot,
      ticket,
      extras?.aiSettings,
      String(args.reason || "(sem motivo)"),
      String(args.urgency || "medium")
    );
    return {
      output: {
        success: result.success,
        notified: result.notified,
        failed: result.failed.length ? result.failed : undefined,
        totalSent: result.notified.length,
        ...(result.error ? { error: result.error } : {})
      }
    };
  }

  if (toolName === "http_request") {
    try {
      const method = String(args.method || "GET").toUpperCase();
      if (!args.url || typeof args.url !== "string" || !/^https?:\/\//i.test(args.url)) {
        return { output: { success: false, error: "URL inválida. Use https://..." } };
      }
      // Aplica configuração (domínios permitidos + headers padrão)
      let httpCfg: any = {};
      try {
        const raw = extras?.aiSettings?.toolHttpRequestConfig;
        httpCfg = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
      } catch { /* noop */ }
      const allowed: string[] = Array.isArray(httpCfg.allowedDomains)
        ? httpCfg.allowedDomains.filter(Boolean)
        : String(httpCfg.allowedDomains || "")
            .split(/[\s,;\n]+/).map(s => s.trim()).filter(Boolean);
      if (allowed.length > 0) {
        let host = "";
        try { host = new URL(args.url).hostname.toLowerCase(); } catch { /* noop */ }
        const ok = allowed.some(d => {
          const dom = String(d).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
          return host === dom || host.endsWith("." + dom);
        });
        if (!ok) {
          return { output: { success: false, error: `Domínio não permitido. Permitidos: ${allowed.join(", ")}` } };
        }
      }
      const defaultHeaders = (httpCfg.defaultHeaders && typeof httpCfg.defaultHeaders === "object")
        ? httpCfg.defaultHeaders : {};
      const resp = await axios.request({
        url: args.url,
        method: method as any,
        headers: { ...defaultHeaders, ...(args.headers || {}) },
        params: args.query || undefined,
        data: ["POST", "PUT", "PATCH"].includes(method) ? args.body : undefined,
        timeout: 15000,
        validateStatus: () => true
      });
      let data: any = resp.data;
      try {
        const str = typeof data === "string" ? data : JSON.stringify(data);
        if (str && str.length > 4000) data = str.slice(0, 4000) + "...[truncado]";
      } catch { /* noop */ }
      logger.info(`[AI TOOL] http_request ${method} ${args.url} -> ${resp.status} - ticket ${ticket.id}`);
      return { output: { success: resp.status < 400, status: resp.status, data } };
    } catch (err: any) {
      logger.error(`[AI TOOL] Erro em http_request: ${err?.message}`);
      return { output: { success: false, error: err?.message || "Falha na requisição HTTP." } };
    }
  }

  if (toolName === "schedule_message") {
    try {
      if (!args.message || !args.sendAt) {
        return { output: { success: false, error: "Campos 'message' e 'sendAt' são obrigatórios." } };
      }
      const sendAt = new Date(args.sendAt);
      if (isNaN(sendAt.getTime())) {
        return { output: { success: false, error: "sendAt inválido. Use ISO 8601." } };
      }
      if (sendAt.getTime() <= Date.now()) {
        return { output: { success: false, error: "sendAt precisa ser data futura." } };
      }
      // Aplica configuração de agendamento (limite de dias no futuro)
      let schedCfg: any = {};
      try {
        const raw = extras?.aiSettings?.toolSchedulingConfig;
        schedCfg = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
      } catch { /* noop */ }
      const maxDays = Number(schedCfg.maxDaysAhead) > 0 ? Number(schedCfg.maxDaysAhead) : 0;
      if (maxDays > 0) {
        const maxMs = Date.now() + maxDays * 24 * 60 * 60 * 1000;
        if (sendAt.getTime() > maxMs) {
          return { output: { success: false, error: `Agendamento permitido só até ${maxDays} dia(s) no futuro.` } };
        }
      }
      const sched = await Schedule.create({
        body: String(args.message),
        sendAt,
        contactId: ticket.contactId,
        ticketId: ticket.id,
        companyId: ticket.companyId,
        userId: ticket.userId || undefined,
        whatsappId: ticket.whatsappId,
        status: "PENDENTE",
        openTicket: "disabled"
      } as any);
      logger.info(`[AI TOOL] schedule_message #${sched.id} agendado para ${sendAt.toISOString()} - ticket ${ticket.id}`);
      return { output: { success: true, scheduleId: sched.id, sendAt: sendAt.toISOString() } };
    } catch (err: any) {
      logger.error(`[AI TOOL] Erro em schedule_message: ${err?.message}`);
      return { output: { success: false, error: err?.message || "Falha ao agendar mensagem." } };
    }
  }

  return { output: { error: `Tool desconhecida: ${toolName}` } };
};

// Função para detectar solicitação de transferência para atendente
const detectTransferRequest = (message: string, customKeywords?: string): boolean => {
  const defaultKeywords = [
    'falar com atendente',
    'quero um atendente', 
    'atendente humano',
    'pessoa real',
    'sair do bot',
    'parar bot',
    'atendimento humano',
    'falar com alguém',
    'não estou conseguindo',
    'isso não funciona',
    'não entendi',
    'preciso de ajuda real',
    'quero falar com uma pessoa',
    'me transfere',
    'atendente por favor'
  ];

  // Mesclar palavras-chave personalizadas com as padrão
  let allKeywords = [...defaultKeywords];
  if (customKeywords) {
    const custom = customKeywords.split(",").map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    allKeywords = [...new Set([...allKeywords, ...custom])];
  }

  const lowerMessage = message.toLowerCase();
  return allKeywords.some(keyword => lowerMessage.includes(keyword));
};

const hasTransferIntent = (text: string, customKeywords?: string): boolean => {
  const normalizedText = normalize(text);
  if (!normalizedText) return false;

  return detectTransferRequest(normalizedText, customKeywords) || [
    "transferir",
    "transfere",
    "transferencia",
    "encaminhar",
    "encaminhe",
    "passar para",
    "falar com",
    "setor",
    "fila",
    "departamento",
    "atendente",
    "humano"
  ].some(term => normalizedText.includes(term));
};

const inferTransferTargetFromText = async (
  companyId: number,
  text: string,
  customKeywords?: string
): Promise<{ queue: Queue; user?: User | null } | null> => {
  if (!hasTransferIntent(text, customKeywords)) return null;

  const normalizedText = normalize(text)
    .replace(/\b(setor( de)?|fila|departamento|atendimento|equipe|time)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const queues = await Queue.findAll({ where: { companyId } });
  const matches = queues
    .map(queue => {
      const queueName = normalize(queue.name);
      const queueWords = queueName.split(" ").filter(word => word.length >= 3);
      let score = 0;

      if (normalizedText.includes(queueName)) score += 100;
      if (queueName.includes(normalizedText)) score += 70;
      score += queueWords.filter(word => normalizedText.includes(word)).length * 20;

      return { queue, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (matches.length === 0) return null;
  if (matches.length > 1 && matches[0].score === matches[1].score) {
    logger.warn(`[AI SERVICE] Transferência inferida ambígua. Filas candidatas: ${matches.map(m => m.queue.name).join(", ")}`);
    return null;
  }

  const queue = matches[0].queue;
  let user: User | null = null;
  const usersInQueue = await User.findAll({
    where: { companyId },
    include: [{ model: Queue, where: { id: queue.id }, through: { attributes: [] }, required: true }]
  });
  const allUsers = await User.findAll({ where: { companyId } });
  const users = [...usersInQueue, ...allUsers.filter(userItem => !usersInQueue.some(linked => linked.id === userItem.id))];
  const userMatches = users
    .map(userItem => {
      const userName = normalize(userItem.name);
      const firstName = userName.split(" ")[0];
      let score = 0;

      if (normalizedText.includes(userName)) score += 100;
      if (firstName && firstName.length >= 3 && normalizedText.includes(firstName)) score += 40;

      return { user: userItem, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (userMatches.length > 0 && (userMatches.length === 1 || userMatches[0].score > userMatches[1].score)) {
    user = userMatches[0].user;
  }

  return { queue, user };
};

// Função para detectar solicitação de continuação do fluxo
const detectFlowContinuation = (message: string, continueKeywords: string[]): boolean => {
  if (!continueKeywords || continueKeywords.length === 0) {
    return false;
  }
  
  const lowerMessage = message.toLowerCase().trim();
  return continueKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
};

// Função para detectar se o objetivo foi completado (usando IA)
const checkObjectiveCompletion = async (
  objective: string,
  conversation: Message[],
  openai: SessionOpenAi
): Promise<boolean> => {
  if (!objective || !openai) return false;

  try {
    // Preparar histórico da conversa para análise
    const conversationText = conversation
      .slice(-5) // Últimas 5 mensagens
      .map(msg => `${msg.fromMe ? 'Bot' : 'User'}: ${msg.body}`)
      .join('\n');

    const analysisPrompt = `
Objetivo: ${objective}

Conversa:
${conversationText}

Pergunta: O objetivo foi completado com sucesso? Responda apenas "SIM" ou "NÃO".
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: analysisPrompt }],
      max_tokens: 10,
      temperature: 0
    });

    const result = response.choices[0]?.message?.content?.trim().toUpperCase();
    return result === "SIM";
    
  } catch (error) {
    logger.error("[AI SERVICE] Erro ao verificar completude do objetivo:", error);
    return false;
  }
};

// Função para retornar ao fluxo
const returnToFlow = async (ticket: Ticket, reason: string): Promise<void> => {
  try {
    const flowContinuation = (ticket.dataWebhook && typeof ticket.dataWebhook === "object" && "flowContinuation" in ticket.dataWebhook)
      ? (ticket.dataWebhook as any).flowContinuation
      : undefined;

    if (!flowContinuation || !flowContinuation.nextNodeId) {
      logger.warn(`[FLOW CONTINUATION] Informações de continuação não encontradas - ticket ${ticket.id}`);
      await ticket.update({
        useIntegration: false,
        isBot: false,
        dataWebhook: null
      });
      return;
    }

    logger.info(`[FLOW CONTINUATION] Retornando ao fluxo - ticket ${ticket.id}, razão: ${reason}`);

    // Enviar mensagem de transição
    const transitionMessages = {
      user_requested: "Perfeito! Vou prosseguir com o atendimento.",
      max_interactions: "Obrigado pelas informações! Vou continuar com o próximo passo.",
      timeout: "Vou prosseguir com o atendimento.",
      objective_completed: "Ótimo! Completamos essa etapa. Vamos continuar!"
    };

    const transitionMessage = transitionMessages[reason] || "Continuando...";
    
    // Enviar mensagem de transição
    const wbot = getWbot(ticket.whatsappId);
    const sentMessage = await wbot.sendMessage(getJidOf(ticket.contact), {
      text: transitionMessage
    });
    await verifyMessage(sentMessage!, ticket, ticket.contact);

    // Restaurar estado do fluxo
    await ticket.update({
      useIntegration: false,
      isBot: false,
      dataWebhook: flowContinuation.originalDataWebhook
    });

    // Continuar fluxo no próximo nó
    if (flowContinuation.nextNodeId) {
      logger.info(`[FLOW CONTINUATION] Continuando fluxo no nó ${flowContinuation.nextNodeId} - ticket ${ticket.id}`);
      
      const { ActionsWebhookService } = await import("../WebhookService/ActionsWebhookService");
      
      const flow = await FlowBuilderModel.findOne({
        where: { id: ticket.flowStopped, company_id: ticket.companyId }
      });
      
      if (flow) {
        const nodes: INodes[] = flow.flow["nodes"];
        const connections: IConnections[] = flow.flow["connections"];
        
        await ActionsWebhookService(
          ticket.whatsappId,
          parseInt(ticket.flowStopped),
          ticket.companyId,
          nodes,
          connections,
          flowContinuation.nextNodeId,
          flowContinuation.originalDataWebhook,
          "",
          ticket.hashFlowId || "",
          null,
          ticket.id,
          {
            number: ticket.contact.number,
            name: ticket.contact.name,
            email: ticket.contact.email || ""
          }
        );
      }
    }

  } catch (error) {
    logger.error(`[FLOW CONTINUATION] Erro ao retornar ao fluxo:`, error);
    
    await ticket.update({
      useIntegration: false,
      isBot: false,
      dataWebhook: null
    });
  }
};

// Prepara as mensagens de IA a partir das mensagens passadas
const prepareMessagesAI = (pastMessages: Message[], isGeminiModel: boolean, promptSystem: string): any[] => {
  const messagesAI: any[] = [];

  // Para OpenAI, incluir o prompt do sistema como 'system' role
  // Para Gemini, passamos o prompt do sistema separadamente
  if (!isGeminiModel) {
    messagesAI.push({ role: "system", content: promptSystem });
  }

  // Mapear mensagens passadas para formato da IA
  for (const message of pastMessages) {
    if (message.mediaType === "conversation" || message.mediaType === "extendedTextMessage") {
      if (message.fromMe) {
        messagesAI.push({ role: "assistant", content: message.body });
      } else {
        messagesAI.push({ role: "user", content: message.body });
      }
    }
  }

  return messagesAI;
};

// Processa a resposta da IA (texto ou áudio)
const processResponse = async (
  responseText: string,
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  aiSettings: IOpenAi,
  ticketTraking: TicketTraking,
  skipLegacyTransfer: boolean = false
): Promise<void> => {
  let response = responseText;

  // ✅ Tag [[SILENT]] = não enviar nada (resposta a "ok", "obrigado" etc.)
  if (response && /\[\[\s*SILENT\s*\]\]/i.test(response)) {
    logger.info(`[AI SERVICE] Resposta SILENT - não enviando mensagem ao cliente - ticket ${ticket.id}`);
    return;
  }

  // Aplicar limite de caracteres (charLimit)
  if (aiSettings.charLimit && aiSettings.charLimit > 0 && response.length > aiSettings.charLimit) {
    // Truncar no último espaço antes do limite para não cortar palavras
    const truncated = response.substring(0, aiSettings.charLimit);
    const lastSpace = truncated.lastIndexOf(" ");
    response = lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
  }

  // Humanizar conversa (adicionar variações naturais)
  if (aiSettings.humanizeConversation) {
    // Pequenas variações para parecer mais natural
    response = response
      .replace(/\. /g, () => Math.random() > 0.7 ? ".\n" : ". ")  // Quebrar linha ocasionalmente
      .replace(/!$/g, () => Math.random() > 0.5 ? "! 😊" : "!");    // Emoji ocasional no fim
  }

  // Verificar se o usuário pediu para falar com atendente (usando keywords configuráveis)
  // OBS: só aplicamos o fluxo legado se houver uma fila padrão (aiSettings.queueId).
  // Sem fila padrão, deixamos a IA decidir a fila correta via tools/marker.
  const userMessage = getBodyMessage(msg) || "";
  const transferTargetQueueId = (aiSettings.transferQueueId && aiSettings.transferQueueId > 0)
    ? aiSettings.transferQueueId
    : (aiSettings.queueId && aiSettings.queueId > 0 ? aiSettings.queueId : null);
  const transferTargetUserId = aiSettings.transferUserId && aiSettings.transferUserId > 0
    ? aiSettings.transferUserId
    : null;
  const transferTargetStatus = (aiSettings.transferStatus === "open" && transferTargetUserId)
    ? "open"
    : "pending";
  const hasTransferTarget = !!transferTargetQueueId;
  const hasDefaultQueue = !!(aiSettings.queueId && aiSettings.queueId > 0);
  const userRequestedTransfer = !skipLegacyTransfer && aiSettings.allowTransfer !== false && hasTransferTarget
    ? detectTransferRequest(userMessage, aiSettings.transferKeywords)
    : false;

  if (userRequestedTransfer) {
    logger.info(`[AI SERVICE] Usuário solicitou transferência para atendente - ticket ${ticket.id}`);

    // Notifica responsáveis configurados (não bloqueia transferência se falhar)
    if (shouldNotifyOnTransfer(aiSettings)) {
      try {
        await sendHumanNotification(
          wbot,
          ticket,
          aiSettings,
          `Cliente solicitou atendente humano: "${userMessage}"`,
          "high"
        );
      } catch (e: any) {
        logger.error(`[AI SERVICE] Falha ao notificar humano na transferência: ${e?.message}`);
      }
    }

    // Desabilitar modo IA e mover para fila/atendente configurados
    await ticket.update({
      useIntegration: false,
      isBot: false,
      dataWebhook: null,
      queueId: transferTargetQueueId,
      userId: transferTargetUserId,
      status: transferTargetStatus
    });

    const transferMessage = aiSettings.transferMessage || "Entendi que você gostaria de falar com um atendente humano. Estou transferindo você agora. Aguarde um momento!";
    
    // Aplicar delay antes de enviar
    if (aiSettings.responseDelay && aiSettings.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, aiSettings.responseDelay! * 1000));
    }

    const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
      text: `\u200e ${transferMessage}`,
    });
    
    await verifyMessage(sentMessage!, ticket, contact);

    if (transferTargetQueueId) {
      await transferQueue(transferTargetQueueId, ticket, contact);
    }

    logger.info(`[AI SERVICE] Ticket ${ticket.id} transferido para queueId=${transferTargetQueueId} userId=${transferTargetUserId || "-"} status=${transferTargetStatus}`);
    return;
  }

  // Verificar ação de transferência da IA (legado, baseado em texto)
  if (!skipLegacyTransfer && hasDefaultQueue && response?.toLowerCase().includes("ação: transferir para o setor de atendimento")) {
    logger.info(`[AI SERVICE] IA solicitou transferência para atendente - ticket ${ticket.id}`);

    if (shouldNotifyOnTransfer(aiSettings)) {
      try {
        await sendHumanNotification(
          wbot,
          ticket,
          aiSettings,
          "IA solicitou transferência para atendimento humano",
          "medium"
        );
      } catch (e: any) {
        logger.error(`[AI SERVICE] Falha ao notificar humano na transferência (IA): ${e?.message}`);
      }
    }

    await ticket.update({
      useIntegration: false,
      isBot: false,
      dataWebhook: null,
      status: "pending"
    });

    if (aiSettings.queueId && aiSettings.queueId > 0) {
      await transferQueue(aiSettings.queueId, ticket, contact);
    }
    
    response = response.replace(/ação: transferir para o setor de atendimento/i, "").trim();
    
    logger.info(`[AI SERVICE] Ticket ${ticket.id} transferido por solicitação da IA`);
  }

  if (!response && !userRequestedTransfer) {
    return;
  }

  const publicFolder: string = path.resolve(__dirname, "..", "..", "..", "public", `company${ticket.companyId}`);

  // Aplicar delay de resposta (responseDelay)
  if (aiSettings.responseDelay && aiSettings.responseDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, aiSettings.responseDelay! * 1000));
  }

  // responseMode: "text" = só texto, "audio" = só áudio, "both" = texto + áudio (mesclado)
  const responseMode = aiSettings.responseMode || "text";
  const shouldSendAudio = responseMode === "audio" || responseMode === "both";
  const shouldSendText = responseMode === "text" || responseMode === "both";

  if (shouldSendText) {
    const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
      text: `\u200e ${response}`,
    });
    await verifyMessage(sentMessage!, ticket, contact);
  }

  if (shouldSendAudio) {
    try {
      const { generateOpenAiTTS, isValidOpenAiVoice } = await import("../../helpers/OpenAiTTS");
      const agentVoice = isValidOpenAiVoice(aiSettings.agentVoice || "") ? aiSettings.agentVoice! : "nova";
      const fileNameTTS = `${ticket.id}_tts_${Date.now()}`;
      const outputPath = `${publicFolder}/${fileNameTTS}`;

      const mp3Path = await generateOpenAiTTS(
        keepOnlySpecifiedChars(response),
        outputPath,
        aiSettings.apiKey,
        agentVoice as any
      );

      // ✅ Converter MP3 -> OGG/Opus para compatibilidade com WhatsApp Mobile
      let audioToSend = mp3Path;
      let audioMime = "audio/mpeg";
      try {
        const { convertToMobileAudio } = await import("../../utils/AudioUtils");
        audioToSend = await convertToMobileAudio(mp3Path, publicFolder);
        audioMime = "audio/ogg; codecs=opus";
      } catch (convErr) {
        logger.error("[AI SERVICE] Falha ao converter TTS para OGG/Opus, enviando MP3:", convErr);
      }

      const sendMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        audio: { url: audioToSend },
        mimetype: audioMime,
        ptt: aiSettings.sendAsPTT !== false,
      });
      await verifyMediaMessage(sendMessage!, ticket, contact, ticketTraking, false, false, wbot);
      deleteFileSync(mp3Path);
      if (audioToSend !== mp3Path) deleteFileSync(audioToSend);

      logger.info(`[AI SERVICE] Resposta TTS OpenAI enviada (voz: ${agentVoice}) - ticket ${ticket.id}`);
    } catch (ttsError) {
      logger.error("[AI SERVICE] Erro no OpenAI TTS, fallback para texto:", ttsError);
      if (!shouldSendText) {
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: `\u200e ${response}`,
        });
        await verifyMessage(sentMessage!, ticket, contact);
      }
    }
  }
};

// Manipula requisição OpenAI
const handleOpenAIRequest = async (
  openai: SessionOpenAi,
  messagesAI: any[],
  aiSettings: IOpenAi,
  promptId?: number,
  ticket?: Ticket,
  toolContext?: { transferred?: boolean; transferQueueId?: number; transferUserId?: number; transferQueueName?: string; transferUserName?: string },
  wbot?: any
): Promise<string> => {
  try {
    const aiTools = ticket ? buildAiTools(aiSettings) : [];
    const enableTools = !!ticket && aiTools.length > 0;
    const maxToolLoops = 4;
    let loops = 0;

    while (true) {
      // Safety net: per-request timeout (60s) e Promise.race contra hang infinito.
      const reqPromise = openai.chat.completions.create({
        model: aiSettings.model,
        messages: messagesAI as any,
        max_tokens: aiSettings.maxTokens,
        temperature: aiSettings.temperature,
        ...(enableTools ? { tools: aiTools, tool_choice: "auto" } : {})
      }, { timeout: 60_000, maxRetries: 1 });
      const chat: any = await Promise.race([
        reqPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("openai_request_timeout_75s")), 75_000)
        )
      ]);

      trackTokenUsage(promptId, {
        promptTokens: chat.usage?.prompt_tokens,
        completionTokens: chat.usage?.completion_tokens,
        totalTokens: chat.usage?.total_tokens,
      });

      const choice = chat.choices[0];
      const message: any = choice?.message;

      const toolCalls = message?.tool_calls;
      if (enableTools && toolCalls && toolCalls.length > 0 && loops < maxToolLoops) {
        loops++;
        // Adicionar a mensagem do assistente com tool_calls ao histórico
        messagesAI.push({
          role: "assistant",
          content: message.content || "",
          tool_calls: toolCalls
        });

        for (const call of toolCalls) {
          const fnName = call.function?.name;
          const fnArgs = call.function?.arguments || "{}";
          logger.info(`[AI TOOL] ${fnName} args=${fnArgs} - ticket ${ticket?.id}`);

          const result = await executeAiTool(fnName, fnArgs, ticket!, { aiSettings, wbot });

          if (result.transferred && toolContext) {
            toolContext.transferred = true;
            toolContext.transferQueueId = result.transferQueueId;
            toolContext.transferUserId = result.transferUserId;
            toolContext.transferQueueName = result.transferQueueName;
            toolContext.transferUserName = result.transferUserName;
          }

          messagesAI.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result.output)
          });
        }
        continue; // Loop para enviar resultado das tools de volta ao modelo
      }

      return message?.content || "";
    }
  } catch (error) {
    console.error("OpenAI request error:", error);
    throw error;
  }
};

// Manipula requisição Gemini
const handleGeminiRequest = async (
  gemini: SessionGemini,
  messagesAI: any[],
  aiSettings: IOpenAi,
  newMessage: string,
  promptSystem: string
): Promise<string> => {
  try {
    const model = gemini.getGenerativeModel({
      model: aiSettings.model,
      systemInstruction: promptSystem,
    });

    // Converte o histórico para o formato do Gemini
    const geminiHistory: Content[] = messagesAI.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(newMessage);
    return result.response.text();
  } catch (error) {
    console.error("Gemini request error:", error);
    throw error;
  }
};

// Função principal para manipular interações de IA
export const handleOpenAiFlow = async (
  aiSettings: IOpenAi,
  msg: proto.IWebMessageInfo,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  mediaSent?: Message | undefined,
  ticketTraking?: TicketTraking
): Promise<void> => {
  try {
    if (!aiSettings) {
      logger.error("[AI SERVICE] Configurações da IA não fornecidas");
      return;
    }

    if (contact.disableBot) {
      logger.info("[AI SERVICE] Bot desabilitado para este contato");
      return;
    }

    // ── Debounce por ticket: agrega mensagens em rajada ──
    // Quando o cliente envia várias mensagens em sequência (ex: "1", "2", "3"),
    // não geramos uma resposta para cada uma. Aguardamos uma janela curta de
    // inatividade; se uma nova mensagem chegar, cancelamos a execução atual e
    // só a última (mais recente) processa. O histórico do banco já contém
    // todas as mensagens do cliente, então a IA responde considerando o
    // conjunto e gera UMA única resposta.
    try {
      const ticketIdKey = String(ticket.id);
      const now = Date.now();
      // janela de agregação: 4s (suficiente para o cliente terminar de digitar/colar)
      const aggregateWindowMs = 4000;
      pendingAiRuns.set(ticketIdKey, now);

      await new Promise(resolve => setTimeout(resolve, aggregateWindowMs));

      // Se uma mensagem mais recente foi registrada durante a espera,
      // abortamos esta execução para que apenas a última prossiga.
      const latest = pendingAiRuns.get(ticketIdKey);
      if (latest && latest !== now) {
        logger.info(`[AI SERVICE] Debounce: mensagem mais recente recebida, abortando execução anterior - ticket ${ticket.id}`);
        return;
      }
      pendingAiRuns.delete(ticketIdKey);
    } catch (debErr) {
      logger.warn(`[AI SERVICE] Falha no debounce - ticket ${ticket.id}: ${(debErr as any)?.message}`);
    }

    // ── Fallback de responseDelay vindo do Prompt salvo ──
    // Quando handleOpenAiFlow é invocado via flow node (dataWebhook.settings)
    // o objeto aiSettings pode não conter responseDelay configurado no Agente.
    // Carregamos do Prompt vinculado ao ticket para respeitar o tempo escolhido.
    try {
      const needsPromptFallback =
        (aiSettings.responseDelay === undefined || aiSettings.responseDelay === null) ||
        (aiSettings as any).workingHoursEnabled === undefined;
      if (needsPromptFallback && (ticket as any).promptId) {
        const PromptModel = (await import("../../models/Prompt")).default;
        const promptRecord = await PromptModel.findOne({
          where: { id: (ticket as any).promptId, companyId: ticket.companyId }
        });
        if (promptRecord) {
          const pv: any = (promptRecord as any).dataValues || promptRecord;
          if (pv.responseDelay !== undefined && pv.responseDelay !== null) {
            (aiSettings as any).responseDelay = pv.responseDelay;
          }
          if (pv.charLimit && !(aiSettings as any).charLimit) {
            (aiSettings as any).charLimit = pv.charLimit;
          }
          if (pv.humanizeConversation !== undefined && (aiSettings as any).humanizeConversation === undefined) {
            (aiSettings as any).humanizeConversation = pv.humanizeConversation;
          }
          if (pv.transferMessage && !(aiSettings as any).transferMessage) {
            (aiSettings as any).transferMessage = pv.transferMessage;
          }
          // Horário de atendimento (turno) — vital para o bloqueio fora do turno
          if (pv.workingHoursEnabled !== undefined && (aiSettings as any).workingHoursEnabled === undefined) {
            (aiSettings as any).workingHoursEnabled = pv.workingHoursEnabled;
          }
          if (pv.workingHoursTimezone && !(aiSettings as any).workingHoursTimezone) {
            (aiSettings as any).workingHoursTimezone = pv.workingHoursTimezone;
          }
          if (pv.workingHoursOutOfMessage && !(aiSettings as any).workingHoursOutOfMessage) {
            (aiSettings as any).workingHoursOutOfMessage = pv.workingHoursOutOfMessage;
          }
          if (pv.workingHoursSchedule && !(aiSettings as any).workingHoursSchedule) {
            (aiSettings as any).workingHoursSchedule = pv.workingHoursSchedule;
          }
        }
      }
      logger.info(`[AI SERVICE] responseDelay aplicado=${(aiSettings as any).responseDelay ?? 0}s - ticket ${ticket.id}`);
    } catch (delayErr) {
      logger.warn(`[AI SERVICE] Falha ao carregar responseDelay do prompt - ticket ${ticket.id}: ${(delayErr as any)?.message}`);
    }

    // ── Verificação de Turno (Horário de atendimento) ──
    if (aiSettings.workingHoursEnabled && !isWithinWorkingHours(aiSettings)) {
      logger.info(`[AI SERVICE] Fora do turno - ticket ${ticket.id}`);
      if ((ticket as any).queueId != null) return;
      const outMsg = (aiSettings.workingHoursOutOfMessage || "").trim();
      if (outMsg) {
        try {
          const sent = await wbot.sendMessage(msg.key.remoteJid!, { text: `\u200e ${outMsg}` });
          await verifyMessage(sent!, ticket, contact);
        } catch (e: any) {
          logger.error(`[AI SERVICE] Falha ao enviar mensagem fora-do-turno: ${e?.message}`);
        }
      }
      return;
    }

    // Verificar modo temporário e continuação de fluxo
    const isTemporaryMode = aiSettings.flowMode === "temporary";
    const flowContinuation = (ticket.dataWebhook && typeof ticket.dataWebhook === "object" && "flowContinuation" in ticket.dataWebhook)
      ? (ticket.dataWebhook as any).flowContinuation
      : undefined;

    // Verificações para voltar ao fluxo (apenas no modo temporário)
    if (isTemporaryMode && flowContinuation) {
      const bodyMessage = getBodyMessage(msg) || "";
      
      // 1. Verificar palavras-chave de continuação
      if (detectFlowContinuation(bodyMessage, aiSettings.continueKeywords || [])) {
        logger.info(`[AI SERVICE] Usuário solicitou continuação do fluxo - ticket ${ticket.id}`);
        return await returnToFlow(ticket, "user_requested");
      }

      // 2. Verificar limite de interações
      if (aiSettings.maxInteractions && flowContinuation.interactionCount >= aiSettings.maxInteractions) {
        logger.info(`[AI SERVICE] Limite de interações atingido - ticket ${ticket.id}`);
        return await returnToFlow(ticket, "max_interactions");
      }

      // 3. Verificar timeout
      if (aiSettings.completionTimeout) {
        const startTime = new Date(flowContinuation.startTime);
        const now = new Date();
        const minutesElapsed = (now.getTime() - startTime.getTime()) / (1000 * 60);
        
if (minutesElapsed >= aiSettings.completionTimeout) {
          logger.info(`[AI SERVICE] Timeout atingido - ticket ${ticket.id}`);
          return await returnToFlow(ticket, "timeout");
        }
      }

      // Incrementar contador de interações
      await ticket.update({
        dataWebhook: {
          ...ticket.dataWebhook,
          flowContinuation: {
            ...flowContinuation,
            interactionCount: flowContinuation.interactionCount + 1
          }
        }
      });
    }

    // Validação da estrutura da mensagem
    let bodyMessage = "";
    
    try {
      if (msg && msg.message) {
        bodyMessage = getBodyMessage(msg) || "";
      } else if (msg && msg.key) {
        const messageFromDB = await Message.findOne({
          where: { wid: msg.key.id },
          order: [['createdAt', 'DESC']]
        });
        
        if (messageFromDB) {
          bodyMessage = messageFromDB.body || "";
          logger.info(`[AI SERVICE] Usando mensagem do banco: "${bodyMessage}"`);
        }
      }
    } catch (error) {
      logger.warn("[AI SERVICE] Erro ao extrair bodyMessage, tentando buscar última mensagem:", error);
      
      const lastMessage = await Message.findOne({
        where: {
          ticketId: ticket.id,
          fromMe: false
        },
        order: [['createdAt', 'DESC']]
      });
      
      if (lastMessage) {
        bodyMessage = lastMessage.body || "";
        logger.info(`[AI SERVICE] Usando última mensagem como fallback: "${bodyMessage}"`);
      }
    }

    // Se não tem bodyMessage e não é áudio, não processar
    if (!bodyMessage && !msg.message?.audioMessage) {
      logger.warn("[AI SERVICE] Nenhum conteúdo de texto ou áudio encontrado");
      return;
    }

    if (!aiSettings.model) {
      logger.error("[AI SERVICE] Modelo não definido nas configurações");
      return;
    }

    if (msg.messageStubType) {
      logger.info("[AI SERVICE] Ignorando evento de grupo (messageStubType)");
      return;
    }

    const publicFolder: string = path.resolve(__dirname, "..", "..", "..", "public", `company${ticket.companyId}`);

    // Definir se é OpenAI ou Gemini baseado no provider
    const provider = aiSettings.provider || (aiSettings.model.startsWith('gpt-') ? 'openai' : 'gemini');
    const isOpenAIModel = provider === 'openai';
    const isGeminiModel = provider === 'gemini';

    if (!isOpenAIModel && !isGeminiModel) {
      logger.error(`[AI SERVICE] Provider não suportado: ${provider}`);
      await wbot.sendMessage(msg.key.remoteJid!, { 
        text: "Desculpe, o modelo de IA configurado não é suportado." 
      });
      return;
    }

    let openai: SessionOpenAi | null = null;
    let gemini: SessionGemini | null = null;

    // Inicializar provedor de IA
    //
    // Um cliente por CHAVE, não por atendimento.
    //
    // Antes, `sessionsOpenAi` era um array que só crescia: um cliente OpenAI
    // por ticket, guardado para sempre, inclusive de atendimentos fechados há
    // meses. Três problemas no mesmo bloco:
    //
    //   1. vazamento de memória (nada nunca saía do array);
    //   2. `findIndex` é varredura linear — com alguns milhares de tickets
    //      atendidos desde o restart, cada mensagem varria o array inteiro
    //      antes de falar com a IA;
    //   3. cada `new OpenAI()` cria o PRÓPRIO agente HTTP, com o próprio pool
    //      de sockets. Ou seja: um pool de conexões por atendimento, em vez
    //      de um compartilhado. Sob movimento eram centenas de conexões TLS
    //      simultâneas para a api.openai.com.
    //
    // O cliente não guarda estado de conversa — o histórico vai inteiro em
    // cada chamada — então nada é perdido ao compartilhá-lo.
    if (isOpenAIModel) {
      openai = obterClienteIA(aiSettings.apiKey) as SessionOpenAi;
    } else if (isGeminiModel) {
      const geminiIndex = sessionsGemini.findIndex(s => s.id === ticket.id);
      if (geminiIndex === -1) {
        gemini = new GoogleGenerativeAI(aiSettings.apiKey) as SessionGemini;
        gemini.id = ticket.id;
        sessionsGemini.push(gemini);
      } else {
        gemini = sessionsGemini[geminiIndex];
      }
    }

    // Buscar mensagens passadas para contexto
    //
    // ATENÇÃO: a ordem aqui é DESC de propósito.
    //
    // Antes era `ASC` com `limit`, o que devolve as N mensagens MAIS ANTIGAS
    // do atendimento — não as N últimas. Enquanto a conversa tinha menos que
    // o limite, funcionava por acidente. Passando disso, a IA congelava no
    // começo: recebia para sempre as primeiras mensagens e nunca via o que o
    // cliente tinha acabado de escrever. Daí o agente repetir pergunta já
    // respondida e não avançar no menu.
    //
    // DESC + limit pega as mais recentes; o `.reverse()` devolve a ordem
    // cronológica que o modelo espera.
    //
    // `janelaDeHistorico` normaliza o valor configurado: `maxMessages <= 0`
    // virava `limit: undefined` e mandava o ATENDIMENTO INTEIRO ao modelo em
    // toda resposta — um ticket com 500 mensagens custava 500 mensagens de
    // token por réplica.
    const messages = (await Message.findAll({
      where: { ticketId: ticket.id },
      order: [["createdAt", "DESC"]],
      limit: janelaDeHistorico(aiSettings.maxMessages)
    })).reverse();

    // Formatar prompt do sistema
    const clientName = sanitizeName(contact.name || "Amigo(a)");

    // Construir instrução de idioma a partir de aiSettings.languages
    let languageInstruction = "";
    try {
      const rawLangs: any = (aiSettings as any).languages;
      const langs: string[] = Array.isArray(rawLangs)
        ? rawLangs
        : (rawLangs ? JSON.parse(rawLangs) : ["pt-BR"]);
      const langMap: Record<string, string> = {
        "pt-BR": "Português do Brasil (pt-BR). Use expressões e vocabulário do português brasileiro, NUNCA use português de Portugal.",
        "pt-PT": "Português de Portugal (pt-PT).",
        "en-US": "English (US)",
        "en-GB": "English (UK)",
        "es-ES": "Español (España)",
        "es-MX": "Español (México)",
        "fr-FR": "Français",
        "de-DE": "Deutsch",
        "it-IT": "Italiano",
        "ar": "العربية",
        "tr-TR": "Türkçe"
      };
      if (langs.includes("auto")) {
        languageInstruction = "IDIOMA OBRIGATÓRIO: Detecte o idioma da mensagem do cliente e responda SEMPRE no MESMO idioma do cliente.\n";
      } else if (langs.length > 0) {
        const primaryLang = langMap[langs[0]] || langs[0];
        if (langs.length === 1) {
          languageInstruction = `IDIOMA OBRIGATÓRIO: Você DEVE responder SEMPRE e EXCLUSIVAMENTE em ${primaryLang}, INDEPENDENTEMENTE do idioma em que o cliente escreva. NUNCA mude de idioma. Mesmo que o cliente envie mensagens em português, inglês ou qualquer outro idioma, sua resposta DEVE ser em ${primaryLang}.\n`;
        } else {
          const allLangs = langs.map((l: string) => langMap[l] || l).join(", ");
          languageInstruction = `IDIOMA OBRIGATÓRIO: Você DEVE responder EXCLUSIVAMENTE em um destes idiomas: ${allLangs}. Idioma preferencial: ${primaryLang}. Se o cliente escrever claramente em outro idioma da lista, você pode responder nesse idioma. NUNCA responda em idiomas fora desta lista.\n`;
        }
      }
    } catch (e) {
      languageInstruction = "";
    }

    // Listar filas disponíveis na empresa para que a IA possa transferir
    // mesmo para filas NÃO vinculadas ao agente.
    let availableQueuesBlock = "      (nenhuma fila cadastrada)";
    try {
      const allQueues = await listAvailableQueues(ticket.companyId);
      if (allQueues.length > 0) {
        availableQueuesBlock = allQueues
          .map(q => {
            const atts = q.attendants && q.attendants.length > 0
              ? ` — atendentes: ${q.attendants.map(a => a.name).join(", ")}`
              : "";
            return `      • ${q.name}${atts}`;
          })
          .join("\n");
      }
    } catch (e) {
      logger.error("[AI SERVICE] Falha ao listar filas para o prompt:", e);
    }

    // ✅ Carregar base de conhecimento ativa do prompt
    let knowledgeContext = "";
    try {
      // Antes usava só o PRIMEIRO id que existisse (ticket.promptId ||
      // aiSettings.id || aiSettings.promptId). Quando esse primeiro id não
      // era o mesmo sob o qual a base foi cadastrada — caso comum quando a
      // IA é acionada por um nó do fluxo, onde aiSettings.id é o id da
      // integração e não do prompt — a consulta voltava vazia e a IA
      // respondia SEM a base, parecendo que a estava "ignorando". Agora
      // procura por todos os ids possíveis de uma vez.
      const candidateIds = [
        (ticket as any).promptId,
        (aiSettings as any).id,
        (aiSettings as any).promptId
      ]
        .map(v => Number(v))
        .filter(v => Number.isFinite(v) && v > 0);
      const promptIdsForKB = Array.from(new Set(candidateIds));

      if (promptIdsForKB.length) {
        const knowledgeItems = await PromptKnowledgeBase.findAll({
          where: {
            promptId: { [Op.in]: promptIdsForKB },
            companyId: ticket.companyId,
            active: true
          }
        });
        // Log explícito: sem isso não havia como saber, olhando o log, se a
        // base entrou no prompt ou se a IA a ignorou de fato.
        logger.info(
          `[AI SERVICE] Base de conhecimento: ${knowledgeItems?.length || 0} item(ns) ativo(s) para promptId(s)=${promptIdsForKB.join(",")} (empresa ${ticket.companyId}, ticket ${ticket.id})`
        );
        if (knowledgeItems && knowledgeItems.length > 0) {
          const textParts: string[] = [];
          const mediaParts: string[] = [];
          for (const item of knowledgeItems) {
            if (item.mediaUrl) {
              mediaParts.push(`- id=${item.id} | nome="${item.originalName || item.name}" | tipo=${item.type}${item.content ? ` | descrição: ${String(item.content).slice(0, 200)}` : ""}`);
            } else {
              textParts.push(`[${item.name}] (${item.type}):\n${item.content || ""}`);
            }
          }
          knowledgeContext = "\n\n=== BASE DE CONHECIMENTO (FONTE OFICIAL — TEM PRIORIDADE) ===\nAs informações abaixo foram cadastradas pela empresa e são a fonte oficial de verdade. Elas PREVALECEM sobre qualquer suposição sua e sobre conhecimento geral. Se a resposta estiver aqui, responda com base nela, literalmente quando for preço, prazo, link ou condição.\n";
          if (textParts.length) knowledgeContext += textParts.join("\n\n---\n\n");
          if (mediaParts.length) {
            knowledgeContext += `\n\nARQUIVOS DISPONÍVEIS NA BASE:\n${mediaParts.join("\n")}\n\nQuando o cliente pedir/precisar de algum desses arquivos, inclua na sua resposta o marcador exato [ENVIAR_ARQUIVO:<id>] usando o id correto da lista acima.\n`;
          }
          knowledgeContext += "\nIMPORTANTE: Sempre que a pergunta do cliente puder ser respondida com base nas informações acima (incluindo links, preços, descrições de produtos), USE essas informações. NUNCA diga que não tem o link/informação se ele estiver listado acima.\n";
        }
      }
    } catch (err) {
      logger.warn("[AI SERVICE] Erro ao carregar base de conhecimento:", err);
    }

    const promptSystem = `${languageInstruction}Instruções do Sistema:
    - REGRA DE USO DO NOME: O nome do cliente é "${clientName}". Use o nome APENAS na primeira saudação da conversa (a primeira resposta do agente). Nas mensagens seguintes, NÃO repita o nome do cliente — converse de forma natural e humanizada, como uma pessoa real faria. Só volte a citar o nome em momentos pontuais e importantes (ex.: confirmar um agendamento, encerrar o atendimento, chamar atenção em algo crítico). Nunca comece toda mensagem com "Olá, [nome]" — isso soa robótico e repetitivo.
    - CONTINUIDADE DA CONVERSA: Esta é UMA conversa contínua com o mesmo cliente. NUNCA cumprimente novamente ("Olá", "Oi", "Bom dia", "Como posso te ajudar?", "Atendimento ao cliente como posso ajudar?" etc.) após a primeira mensagem do atendimento — você já está conversando com ele. Mantenha o contexto e o histórico anteriores.
    - RESPOSTAS A CONFIRMAÇÕES CURTAS: Quando o cliente enviar apenas uma confirmação ou acknowledgement curto (ex: "ok", "okay", "blz", "beleza", "valeu", "obrigado", "obrigada", "vlw", "tá", "tá bom", "entendi", "👍", "🙏", "certo", "perfeito"), você DEVE responder com a tag exata [[SILENT]] (sem nenhum texto adicional). NÃO mande mensagens como "Se precisar de mais alguma coisa, é só avisar" nem cumprimente de novo. Aguarde o cliente fazer uma nova pergunta para voltar a responder.
    - NUNCA envie duas mensagens em sequência reabrindo o atendimento. Só responda quando houver de fato uma pergunta ou solicitação nova do cliente.
    - Certifique-se de que a resposta tenha até ${aiSettings.maxTokens} tokens e termine de forma completa, sem cortes.
    - Você possui ferramentas (function calling) para consultar filas/setores e transferir o atendimento:
      • list_queues: lista todas as filas disponíveis e os atendentes vinculados.
      • transfer_ticket: transfere o ticket para a fila (e opcionalmente atendente) informada.
      • notify_human: avisa os responsáveis configurados via WhatsApp, sem transferir o atendimento.
    - Quando o cliente pedir para falar com um setor (ex: "financeiro", "suporte", "comercial") ou com um atendente humano específico, use list_queues para descobrir o nome correto e em seguida chame transfer_ticket com o queueName (e userName se ele citou um atendente).
    - Quando houver urgência, reclamação grave, risco de perda de venda, pedido explícito de responsável/gerente ou situação que exija acompanhamento humano sem interromper a IA, chame notify_human com um motivo claro.
    - Se o cliente mencionar uma fila/atendente que não existe, informe as opções disponíveis retornadas por list_queues e peça para ele escolher.
    - Após chamar transfer_ticket com sucesso, apenas confirme a transferência de forma curta e amigável; não invente filas que não existam.
    - Filas/setores disponíveis na empresa (use EXATAMENTE estes nomes ao transferir, mesmo que não estejam vinculados a este agente):
${availableQueuesBlock}
    - IMPORTANTE: Você DEVE conseguir transferir para QUALQUER fila listada acima, independentemente da fila estar vinculada a este agente ou não.
    - Para Gemini (sem function calling): se for transferir, encerre sua resposta com uma linha exatamente neste formato (será removida antes de enviar ao cliente):
      [[TRANSFER:NomeExatoDaFila]]
      ou, se quiser direcionar a um atendente:
      [[TRANSFER:NomeExatoDaFila|NomeDoAtendente]]
    - NUNCA escreva no corpo da mensagem rótulos de ação como "Ação:", "Action:", "Acao:", "Transferir para ...", "Transferindo para ...", "Encaminhando para ...", "Vou transferir você para ...", nem qualquer descrição em texto da operação que você vai executar. Essas frases confundem o cliente e quebram a experiência.
    - REGRA CRÍTICA DE TRANSFERÊNCIA: Você SÓ pode transferir (chamar transfer_ticket ou emitir [[TRANSFER:...]]) quando o CLIENTE pedir EXPLICITAMENTE nesta última mensagem para falar com humano/atendente/setor específico (ex.: "quero falar com atendente", "me passa pro financeiro", "quero um humano", "fala com suporte"). PROIBIDO transferir por iniciativa própria, por dúvida, por não saber responder, por saudação, por confirmação ("ok", "obrigado"), por reclamação genérica ou porque "acha melhor". Se estiver em dúvida, responda normalmente e pergunte se o cliente deseja falar com um atendente — NÃO transfira. NUNCA ofereça e execute transferência na mesma mensagem.
    - Se decidir transferir (após confirmação clara do cliente), faça isso APENAS chamando a ferramenta transfer_ticket (ou, no Gemini, encerrando com o marcador [[TRANSFER:Fila]] na ÚLTIMA linha). O texto visível ao cliente deve ser apenas uma frase curta e natural confirmando, sem prefixos como "Ação:".
    
    Prompt Específico:
    ${aiSettings.prompt}
    ${knowledgeContext}
    Siga essas instruções com cuidado para garantir um atendimento claro e amigável em todas as respostas.${
      knowledgeContext
        ? "\n\n    LEMBRETE FINAL: antes de responder que não sabe, não tem a informação, ou que vai verificar, releia a BASE DE CONHECIMENTO acima — se a resposta estiver lá, use-a. Só diga que não tem a informação quando ela realmente não constar na base."
        : ""
    }`;

    // Processar mensagem de texto
    if (bodyMessage) {
      const messagesAI = prepareMessagesAI(messages, isGeminiModel, promptSystem);

      try {
        let responseText: string | null = null;
        const toolContext: any = {};

        // A chamada ao modelo passa pelo controle central (ControleDeIA):
        // trava por conversa, teto de concorrência global e disjuntor por
        // chave. Ver o comentário no topo daquele arquivo.
        //
        // A trava por conversa é o que faltava aqui: o debounce logo acima
        // agrega a rajada, mas se libera ANTES da chamada. Com uma resposta de
        // 20s em andamento, a mensagem seguinte passava pela janela e abria
        // uma SEGUNDA chamada em paralelo para o mesmo contato — duas
        // respostas enviadas e dois custos de token.
        const chaveTicket = `${ticket.companyId}:${ticket.id}`;
        const execucao = await executarComControle(
          { apiKey: aiSettings.apiKey, chaveTicket, rotulo: `texto ticket ${ticket.id}` },
          async () => {
            if (isOpenAIModel && openai) {
              messagesAI.push({ role: "user", content: bodyMessage });
              return handleOpenAIRequest(openai, messagesAI, aiSettings, ticket.promptId, ticket, toolContext, wbot);
            }
            if (isGeminiModel && gemini) {
              return handleGeminiRequest(gemini, messagesAI, aiSettings, bodyMessage, promptSystem);
            }
            return null;
          }
        );

        if (execucao.ok) {
          responseText = execucao.valor;
        } else if (execucao.motivo === "ocupado") {
          // Já existe uma resposta sendo gerada para esta conversa. Sair em
          // silêncio é o certo: a resposta em andamento já vai considerar
          // esta mensagem, porque o histórico é lido na hora da chamada.
          return;
        } else if (execucao.motivo === "erro") {
          throw execucao.erro;
        } else {
          // disjuntor aberto ou fila de IA cheia. Não é erro de código — é o
          // sistema se protegendo. Não responde nada e deixa o atendimento
          // seguir para humano pelo caminho normal.
          logger.warn(
            `[AI SERVICE] Resposta não gerada para o ticket ${ticket.id}: ${execucao.motivo}`
          );
          return;
        }

        if (!responseText) {
          logger.error("[AI SERVICE] Nenhuma resposta do provedor de IA");
          if (!toolContext?.transferred) return;
        }

        // Parsing de instrução textual de transferência [[TRANSFER:Fila|Atendente]]
        // (necessário para Gemini que não suporta function calling neste fluxo,
        // e útil como fallback para qualquer modelo)
        if (responseText && !toolContext?.transferred) {
          const transferMatch = responseText.match(/\[\[TRANSFER:\s*([^\]|]+?)(?:\s*\|\s*([^\]]+?))?\s*\]\]/i);
          if (transferMatch) {
            const _userAskedTransfer = hasTransferIntent(bodyMessage, aiSettings.transferKeywords);
            if (!_userAskedTransfer) {
              logger.warn(`[AI SERVICE] Marcador [[TRANSFER]] ignorado: cliente não pediu transferência - ticket ${ticket.id}. Msg: "${(bodyMessage || "").slice(0, 120)}"`);
              responseText = responseText.replace(transferMatch[0], "").trim();
            } else {
              const queueName = transferMatch[1].trim();
              const userName = transferMatch[2]?.trim();
              const queue = await findQueueByIdOrName(ticket.companyId, undefined, queueName);
              if (queue) {
                let user: User | null = null;
                if (userName) {
                  user = await findUserInQueue(queue.id, ticket.companyId, userName);
                }
                toolContext.transferred = true;
                toolContext.transferQueueId = queue.id;
                toolContext.transferUserId = user?.id;
                toolContext.transferQueueName = queue.name;
                toolContext.transferUserName = user?.name;
                logger.info(`[AI SERVICE] Transferência detectada via marcador textual - ticket ${ticket.id} -> ${queue.name}${user ? ` / ${user.name}` : ""}`);
              } else {
                logger.warn(`[AI SERVICE] IA pediu transferência para fila inexistente: "${queueName}" - ticket ${ticket.id}`);
              }
              responseText = responseText.replace(transferMatch[0], "").trim();
            }
          }
        }

        // Fallback para OpenAI/Gemini: alguns modelos respondem apenas em texto natural
        // (ex: "vou transferir para o financeiro") sem function-call nem marcador.
        // IMPORTANTE: só inferimos transferência quando A MENSAGEM DO USUÁRIO
        // tem intenção explícita de transferência. Caso contrário, ofertas do
        // próprio bot (ex: "posso transferir você ao Suporte?") seriam
        // interpretadas como confirmação e disparariam transferência sem o
        // usuário ter aceitado.
        if (!toolContext?.transferred && hasTransferIntent(bodyMessage, aiSettings.transferKeywords)) {
          const inferred = await inferTransferTargetFromText(ticket.companyId, bodyMessage, aiSettings.transferKeywords);
          if (inferred?.queue) {
            toolContext.transferred = true;
            toolContext.transferQueueId = inferred.queue.id;
            toolContext.transferUserId = inferred.user?.id;
            toolContext.transferQueueName = inferred.queue.name;
            toolContext.transferUserName = inferred.user?.name;
            logger.info(`[AI SERVICE] Transferência inferida por texto natural - ticket ${ticket.id} -> ${inferred.queue.name}${inferred.user ? ` / ${inferred.user.name}` : ""}`);
          }
        }

        // Sanitiza rótulos de ação que a IA às vezes vaza no texto do cliente
        // (ex: "Ação: Transferir para Suporte", "Action: notify_human", etc.).
        // Esses rótulos não devem aparecer para o usuário final.
        if (responseText) {
          responseText = responseText
            .replace(/^\s*(?:[-*•]\s*)?(?:a[cç][aã]o|action|acao)\s*[:：]\s*.*$/gim, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        }

        // Aplicar transferência solicitada via function calling ANTES de processar a resposta,
        // para evitar que a transferência legada (por keywords / "ação: transferir") sobrescreva
        // a fila/atendente escolhidos pela IA.
        if (toolContext?.transferred && toolContext.transferQueueId) {
          logger.info(`[AI SERVICE] Aplicando transferência via tool - ticket ${ticket.id} -> fila ${toolContext.transferQueueName}${toolContext.transferUserName ? `, atendente ${toolContext.transferUserName}` : ""}`);

          // SEMPRE envia a "Mensagem ao transferir" configurada no agente
          // (com fallback padrão), substituindo a resposta natural da IA para
          // evitar que rótulos tipo "Ação: Transferir para X" cheguem ao cliente.
          const configuredTransferMsg =
            (aiSettings.transferMessage || "").toString().trim() ||
            "Estou transferindo você para um atendente. Aguarde um momento!";
          try {
            if (aiSettings.responseDelay && aiSettings.responseDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, aiSettings.responseDelay * 1000));
            }
            let formatted = configuredTransferMsg;
            try {
              formatted = formatBody(configuredTransferMsg, ticket);
            } catch (fmtErr) {
              logger.warn(`[AI SERVICE] formatBody falhou na transferMessage - ticket ${ticket.id}:`, fmtErr);
            }
            const sentTransferMsg = await wbot.sendMessage(msg.key.remoteJid!, {
              text: `\u200e ${formatted}`
            });
            await verifyMessage(sentTransferMsg!, ticket, contact);
            logger.info(`[AI SERVICE] transferMessage enviada - ticket ${ticket.id} (configurada=${!!(aiSettings.transferMessage || "").toString().trim()})`);
          } catch (sendErr) {
            logger.error(`[AI SERVICE] Falha ao enviar transferMessage - ticket ${ticket.id}:`, sendErr);
          }
          // SEMPRE suprime a resposta da IA na transferência para não duplicar
          // nem vazar rótulos de ação ("Ação: Transferir para ...").
          responseText = "";

          // Limpa flags de IA antes da transferência para que o fluxo de update
          // não trate como continuação do bot.
          await ticket.update({
            useIntegration: false,
            isBot: false,
            dataWebhook: null
          });

          try {
            await UpdateTicketService({
              ticketData: {
                queueId: toolContext.transferQueueId,
                userId: toolContext.transferUserId || null,
                status: toolContext.transferUserId ? "open" : "pending",
                isBot: false,
                useIntegration: false,
                isTransfered: true
              },
              ticketId: ticket.id,
              companyId: ticket.companyId
            });
            await ticket.reload();
            logger.info(`[AI SERVICE] Transferência aplicada com sucesso - ticket ${ticket.id} (queueId=${toolContext.transferQueueId}, userId=${toolContext.transferUserId || "null"})`);
          } catch (transferErr) {
            logger.error(`[AI SERVICE] Erro ao aplicar transferência via UpdateTicketService - ticket ${ticket.id}:`, transferErr);
            // Fallback: garante ao menos a fila no ticket
            await ticket.update({
              queueId: toolContext.transferQueueId,
              ...(toolContext.transferUserId ? { userId: toolContext.transferUserId, status: "open" } : { status: "pending" })
            });
          }
        }

        if (responseText) {
          await processResponse(responseText, wbot, msg, ticket, contact, aiSettings, ticketTraking, !!toolContext?.transferred);
        }
        
        logger.info(`[AI SERVICE] Resposta processada com sucesso para ticket ${ticket.id}`);

        // APÓS RESPOSTA: Verificar se deve continuar fluxo por objetivo completado
        if (isTemporaryMode && aiSettings.autoCompleteOnObjective && aiSettings.objective && openai) {
          const recentMessages = await Message.findAll({
            where: { ticketId: ticket.id },
            order: [["createdAt", "DESC"]],
            limit: 10
          });

          const objectiveCompleted = await checkObjectiveCompletion(
            aiSettings.objective,
            recentMessages,
            openai
          );

          if (objectiveCompleted) {
            logger.info(`[AI SERVICE] Objetivo completado automaticamente - ticket ${ticket.id}`);
            return await returnToFlow(ticket, "objective_completed");
          }
        }

      } catch (error: any) {
        logger.error("[AI SERVICE] Falha na requisição para IA:", error);
        
        const errorMessage = "Desculpe, estou com dificuldades técnicas para processar sua solicitação no momento. Por favor, tente novamente mais tarde.";
        
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: errorMessage
        });
        
        await verifyMessage(sentMessage!, ticket, contact);
      }
    }
    // Processar áudio
    else if (msg.message?.audioMessage && mediaSent) {
      // ✅ Verificar se transcrição está habilitada
      if (!aiSettings.transcribeAudio) {
        logger.info(`[AI SERVICE] Transcrição de áudio desabilitada - ticket ${ticket.id}`);
        await wbot.sendMessage(msg.key.remoteJid!, { 
          text: "Desculpe, no momento só consigo processar mensagens de texto. Por favor, envie sua pergunta por escrito." 
        });
        return;
      }

      if (!openai && isOpenAIModel) {
        logger.error("[AI SERVICE] Sessão OpenAI necessária para transcrição mas não inicializada");
        await wbot.sendMessage(msg.key.remoteJid!, { 
          text: "Desculpe, a transcrição de áudio não está configurada corretamente." 
        });
        return;
      }

      try {
        const mediaUrl = mediaSent.mediaUrl!.split("/").pop();
        const audioFilePath = `${publicFolder}/${mediaUrl}`;

        if (!fs.existsSync(audioFilePath)) {
          logger.error(`[AI SERVICE] Arquivo de áudio não encontrado: ${audioFilePath}`);
          await wbot.sendMessage(msg.key.remoteJid!, { 
            text: "Desculpe, não foi possível processar seu áudio. Por favor, tente novamente." 
          });
          return;
        }

        let transcription = "";

        // ✅ Tentar TRANSCRIBE_URL local primeiro, fallback para OpenAI Whisper
        if (process.env.TRANSCRIBE_URL) {
          try {
            const FormData = require("form-data");
            const axios = require("axios");
            const formData = new FormData();
            formData.append("audio", fs.createReadStream(audioFilePath));

            const res = await axios.request({
              method: "post",
              maxBodyLength: Infinity,
              url: `${process.env.TRANSCRIBE_URL}/transcrever`,
              headers: {
                ...(process.env.TRANSCRIBE_API_KEY
                  ? { Authorization: `Bearer ${process.env.TRANSCRIBE_API_KEY}` }
                  : {}),
                ...formData.getHeaders(),
              },
              data: formData,
            });
            transcription = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
            logger.info(`[AI SERVICE] Transcrição local bem-sucedida - ticket ${ticket.id}`);
          } catch (localError) {
            logger.warn(`[AI SERVICE] Falha na transcrição local, tentando OpenAI Whisper - ticket ${ticket.id}`);
            if (openai) {
              const file = fs.createReadStream(audioFilePath);
              const result = await openai.audio.transcriptions.create({ model: "whisper-1", file });
              transcription = result.text;
            }
          }
        } else if (openai) {
          const file = fs.createReadStream(audioFilePath);
          const transcriptionResult = await openai.audio.transcriptions.create({ model: "whisper-1", file });
          transcription = transcriptionResult.text;
        }

        if (!transcription) {
          logger.warn("[AI SERVICE] Transcrição vazia recebida");
          await wbot.sendMessage(msg.key.remoteJid!, { 
            text: "Desculpe, não consegui entender o áudio. Tente novamente ou envie uma mensagem de texto." 
          });
          return;
        }

        // Enviar transcrição para o usuário
        const sentTranscriptMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: `🎤 *Sua mensagem de voz:* ${transcription}`,
        });
        await verifyMessage(sentTranscriptMessage!, ticket, contact);

        // Obter resposta da IA para a transcrição
        const messagesAI = prepareMessagesAI(messages, isGeminiModel, promptSystem);
        let responseText: string | null = null;
        
        // Mesmo controle do caminho de texto (trava por conversa, teto de
        // concorrência e disjuntor). Ver ControleDeIA.ts.
        const execucaoAudio = await executarComControle(
          {
            apiKey: aiSettings.apiKey,
            chaveTicket: `${ticket.companyId}:${ticket.id}`,
            rotulo: `áudio ticket ${ticket.id}`
          },
          async () => {
            if (isOpenAIModel) {
              messagesAI.push({ role: "user", content: transcription });
              return handleOpenAIRequest(openai, messagesAI, aiSettings, ticket.promptId, ticket, undefined, wbot);
            }
            if (isGeminiModel && gemini) {
              return handleGeminiRequest(gemini, messagesAI, aiSettings, transcription, promptSystem);
            }
            return null;
          }
        );

        if (execucaoAudio.ok) {
          responseText = execucaoAudio.valor;
        } else if (execucaoAudio.motivo === "erro") {
          throw execucaoAudio.erro;
        } else {
          logger.warn(
            `[AI SERVICE] Resposta de áudio não gerada para o ticket ${ticket.id}: ${execucaoAudio.motivo}`
          );
          return;
        }
        
        if (responseText) {
          await processResponse(responseText, wbot, msg, ticket, contact, aiSettings, ticketTraking);
        }

      } catch (error: any) {
        logger.error("[AI SERVICE] Erro no processamento de áudio:", error);
        const errorMessage = error?.response?.error?.message || error.message || "Erro desconhecido";
        const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
          text: `Desculpe, houve um erro ao processar seu áudio: ${errorMessage}`,
        });
        await verifyMessage(sentMessage!, ticket, contact);
      }
    }

  } catch (error) {
    logger.error("[AI SERVICE] Erro geral no serviço:", error);
    
    try {
      const sentMessage = await wbot.sendMessage(msg.key.remoteJid!, {
        text: "Desculpe, ocorreu um erro interno. Por favor, tente novamente mais tarde.",
      });
      await verifyMessage(sentMessage!, ticket, contact);
    } catch (sendError) {
      logger.error("[AI SERVICE] Erro ao enviar mensagem de erro:", sendError);
    }
  }
};

export default handleOpenAiFlow;