import fs from "fs/promises"
import * as Sentry from "@sentry/node";
// Tipos puros vêm do pacote base (apenas para tipagem em tempo de compilação).
import type {
  WAMessage,
  WAMessageContent,
  WAMessageKey,
  WASocket,
} from "@whiskeysockets/baileys";
// WAMessageStubType é usado como VALOR (enum) — precisa de import de runtime.
import { WAMessageStubType } from "@whiskeysockets/baileys";
// Runtime (socket + helpers de auth/jid) vem do shim que prioriza o fork
// @itsliaaa/baileys — fork que renderiza botões/listas (buttons/sections/nativeFlow)
// no WhatsApp moderno via API de alto nível. Manter o socket e o key-store na
// MESMA implementação (via compat/baileys) evita incompatibilidade de criptografia/proto.
import makeWASocket, {
  Browsers,
  DisconnectReason,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  proto,
  makeInMemoryStore,
} from "../compat/baileys";
import { FindOptions } from "sequelize/types";
import Whatsapp from "../models/Whatsapp";
import Setting from "../models/Setting";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import WhatsappLidMap from "../models/WhatsapplidMap";
import logger from "../utils/logger";
import pino from "pino";
import { useMultiFileAuthState } from "../helpers/useMultiFileAuthState";
import { Boom } from "@hapi/boom";
import AppError from "../errors/AppError";
import { getIO } from "./socket";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import cacheLayer from "../libs/cache";
import ImportWhatsAppMessageService from "../services/WhatsappService/ImportWhatsAppMessageService";
import { add } from "date-fns";
import moment from "moment";
import { getTypeMessage, isValidMsg } from "../services/WbotServices/wbotMessageListener";
import { addLogs } from "../helpers/addLogs";
import NodeCache from 'node-cache';
import Message from "../models/Message";
import { getVersionByIndexFromUrl } from "../utils/versionHelper";
import path from "path";
import { getGroupMetadataCache } from "../utils/RedisGroupCache";
import { Op } from "sequelize";
import { resolvePN } from "../utils/LidPnCache";

const loggerBaileys = pino({ level: "error" });

export type Session = WASocket & {
  id?: number;
  myJid?: string;
  myLid?: string;
  store?: (msg: proto.IWebMessageInfo) => void;
};

const sessions: Session[] = [];

// ✅ Armazena mensagens capturadas durante sincronização de histórico para importação
export var dataMessages: any = {};
// ✅ Mapa global de stores do Baileys por whatsappId — para acesso aos contatos sincronizados
const inMemoryStores = new Map<number, ReturnType<typeof makeInMemoryStore>>();

// ✅ Mutex: evita sessões duplicadas com o mesmo JID (inspirado no Ticketz)
const jidSessionMap = new Map<number, string>(); // whatsappId -> JID conectado

export const getInMemoryStore = (whatsappId: number) => inMemoryStores.get(whatsappId);

// ─── PODA DO IN-MEMORY STORE ────────────────────────────────────────────────
//
// `makeInMemoryStore` do Baileys guarda em RAM todo chat, todo contato e toda
// mensagem que passa pelo socket. Sem TTL, sem teto, sem descarte — e é UM
// store POR CONEXÃO. Junto com a sincronização de histórico, o histórico
// inteiro da conta entrava na memória e ficava lá enquanto o processo vivesse.
//
// Quem realmente lê esse store (verificado):
//   - WhatsAppLabelSyncService  -> store.labels
//   - ImportContactsService     -> store.contacts
//   - ImportMessagesService     -> store.contacts e store.messages[jid]
//
// `contacts` e `labels` são pequenos e ficam intocados. O peso está em
// `messages`. E o próprio consumidor já faz `storeChat.array.slice(-100)`, ou
// seja, só usa as últimas 100 de cada conversa — guardar mais do que isso
// nunca serviu para nada.
//
// Além disso, o ImportMessagesService já tem (e documenta) um caminho
// alternativo que lê a mensagem-âncora do NOSSO banco quando o store está
// vazio, justamente porque ele é volátil e nasce vazio a cada restart. Ou
// seja: podar aqui não tira nenhuma capacidade que o sistema já não
// precisasse sobreviver sem.
const MAX_MSGS_POR_CHAT = Math.max(
  10,
  parseInt(process.env.WBOT_STORE_MAX_MSGS_POR_CHAT || "100", 10) || 100
);
const MAX_CHATS_POR_STORE = Math.max(
  50,
  parseInt(process.env.WBOT_STORE_MAX_CHATS || "500", 10) || 500
);
const PODA_INTERVALO_MS = Math.max(
  60_000,
  parseInt(process.env.WBOT_STORE_PODA_MS || "600000", 10) || 600_000
);

const podarInMemoryStores = (): void => {
  let chatsRemovidos = 0;
  let mensagensRemovidas = 0;

  for (const [whatsappId, st] of inMemoryStores) {
    const msgs = (st as any)?.messages;
    if (!msgs || typeof msgs !== "object") continue;

    try {
      const jids = Object.keys(msgs);

      // 1. Corta o excesso dentro de cada conversa.
      for (const jid of jids) {
        const dict = msgs[jid];
        const arr = dict?.array;
        if (!Array.isArray(arr) || arr.length <= MAX_MSGS_POR_CHAT) continue;

        const manter = new Set(
          arr.slice(-MAX_MSGS_POR_CHAT).map((m: any) => m?.key?.id)
        );
        const antes = arr.length;

        if (typeof dict.filter === "function") {
          // `filter` é a API pública do dicionário ordenado do Baileys e
          // muta no lugar. Preferida a mexer na estrutura interna.
          dict.filter((m: any) => manter.has(m?.key?.id));
          mensagensRemovidas += antes - (dict.array?.length || 0);
        }
      }

      // 2. Corta o excesso de conversas. Mantém as que têm mensagem mais
      // recente — são as que o operador tem chance de querer importar.
      const jidsAtuais = Object.keys(msgs);
      if (jidsAtuais.length > MAX_CHATS_POR_STORE) {
        const carimbo = (jid: string): number => {
          const arr = msgs[jid]?.array;
          const ultima = Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
          const ts = ultima?.messageTimestamp;
          if (typeof ts === "number") return ts;
          if (ts && typeof ts.toNumber === "function") return ts.toNumber();
          if (ts && typeof ts.low === "number") return ts.low;
          return 0;
        };

        const ordenados = jidsAtuais.sort((a, b) => carimbo(b) - carimbo(a));
        for (const jid of ordenados.slice(MAX_CHATS_POR_STORE)) {
          delete msgs[jid];
          chatsRemovidos += 1;
        }
      }
    } catch (err: any) {
      logger.warn(
        `[WBOT] Falha ao podar o store da sessão ${whatsappId}: ${err?.message}`
      );
    }
  }

  if (chatsRemovidos > 0 || mensagensRemovidas > 0) {
    logger.info(
      `[WBOT] Store podado: ${mensagensRemovidas} mensagem(ns) e ${chatsRemovidos} conversa(s) liberadas da memória.`
    );
  }
};

const podaTimer = setInterval(podarInMemoryStores, PODA_INTERVALO_MS);
if (podaTimer.unref) podaTimer.unref();

const retriesQrCodeMap = new Map<number, number>();
// ✅ Backoff exponencial: rastreia tentativas de reconexão por whatsapp id
const reconnectAttemptsMap = new Map<number, number>();
const MAX_RECONNECT_ATTEMPTS = 50;
const BASE_RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 3 * 60 * 1000;

// Quantos QR Codes uma conexão pode gerar sem ninguém ler antes de o sistema
// desistir. O Baileys renova o QR a cada 60s (qrTimeout), então 3 dá cerca de
// três minutos para alguém pegar o celular — depois disso a conexão para, e só
// volta por ação na tela. Ajustável por env para quem quiser mais folga.
const MAX_QRCODE_RETRIES = Math.max(
  1,
  parseInt(process.env.WBOT_MAX_QRCODE_RETRIES || "3", 10) || 3
);

// ✅ Reset estável: só reseta o backoff após a sessão ficar conectada por um período mínimo
const STABILITY_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutos
const stabilityTimerMap = new Map<number, NodeJS.Timeout>();

// ✅ Tolerância para conflitos transitórios (stream replaced/conflict)
const conflictDisconnectMap = new Map<number, { count: number; firstAt: number }>();
const CONFLICT_WINDOW_MS = 5 * 60 * 1000;
const MAX_CONFLICT_RECONNECTS = 10;

// ✅ IDLE_RELEASE DESATIVADO — causava desconexões prematuras de sessões ativas
// Sessões WhatsApp devem permanecer conectadas indefinidamente.
const lastActivityMap = new Map<number, number>(); // Mantido apenas para telemetria

/**
 * Registra atividade em uma sessão (chamado quando mensagens são enviadas/recebidas)
 */
export const touchSessionActivity = (whatsappId: number): void => {
  lastActivityMap.set(whatsappId, Date.now());
};

// ✅ IDLE_RELEASE DESATIVADO — funções mantidas como no-op para não quebrar chamadas existentes
export const startIdleCheck = (): void => { /* desativado */ };
export const stopIdleCheck = (): void => { /* desativado */ };

const scheduleBackoffReset = (whatsappId: number, sessionName: string): void => {
  // Cancelar timer anterior se existir
  const existingTimer = stabilityTimerMap.get(whatsappId);
  if (existingTimer) clearTimeout(existingTimer);

  const currentAttempts = reconnectAttemptsMap.get(whatsappId) || 0;
  if (currentAttempts === 0) return; // Já está resetado

  logger.info(`[BACKOFF] ${sessionName} conectou. Backoff será resetado em ${STABILITY_THRESHOLD_MS / 60000}min se permanecer estável (tentativas atuais: ${currentAttempts})`);

  const timer = setTimeout(() => {
    reconnectAttemptsMap.delete(whatsappId);
    stabilityTimerMap.delete(whatsappId);
    logger.info(`[BACKOFF] ✅ ${sessionName} estável por ${STABILITY_THRESHOLD_MS / 60000}min — backoff resetado`);
  }, STABILITY_THRESHOLD_MS);

  // Não bloquear o event loop
  if (timer.unref) timer.unref();
  stabilityTimerMap.set(whatsappId, timer);
};

const cancelStabilityTimer = (whatsappId: number): void => {
  const timer = stabilityTimerMap.get(whatsappId);
  if (timer) {
    clearTimeout(timer);
    stabilityTimerMap.delete(whatsappId);
  }
};

const getReconnectDelay = (whatsappId: number): number => {
  const attempts = reconnectAttemptsMap.get(whatsappId) || 0;
  // Exponencial: 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s... max 5min
  const delay = Math.min(
    BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts),
    MAX_RECONNECT_DELAY_MS
  );
  // Adicionar jitter de ±20% para evitar thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
};

// ✅ Health Check simplificado — apenas verifica se o WebSocket está aberto
// NÃO usa sendPresenceUpdate (pode causar rate limiting e conflitos)
const HEALTH_CHECK_INTERVAL_MS = 10 * 60 * 1000; // ✅ 10 min — reduz falsos positivos em redes instáveis
const lastPongMap = new Map<number, number>();
const failedPingCountMap = new Map<number, number>();
const ZOMBIE_FAILED_PINGS = 5; // ✅ Aumentado de 3 para 5 — mais tolerante a oscilações de rede
let healthCheckTimer: NodeJS.Timer | null = null;

const performHealthCheck = async (): Promise<void> => {
  if (sessions.length === 0) return;

  for (const session of sessions) {
    if (!session?.id || !session?.ws) continue;

    const whatsappId = session.id;

    try {
      const wsAny = session.ws as any;
      const isWsOpen = typeof wsAny?.readyState === 'number'
        ? wsAny.readyState === 1
        : typeof wsAny?.isClosed === 'boolean'
          ? !wsAny.isClosed
          : !!session.user?.id;

      if (!isWsOpen) {
        const failedPings = (failedPingCountMap.get(whatsappId) || 0) + 1;
        failedPingCountMap.set(whatsappId, failedPings);
        logger.warn(`[HEALTH-CHECK] Sessão ${whatsappId} - WS fechado (${failedPings}/${ZOMBIE_FAILED_PINGS})`);

        if (failedPings >= ZOMBIE_FAILED_PINGS) {
          logger.error(`[HEALTH-CHECK] Sessão ${whatsappId} - CONEXÃO ZUMBI! Forçando reconexão.`);
          try {
            const whatsapp = await Whatsapp.findByPk(whatsappId);
            if (whatsapp && whatsapp.status === "CONNECTED") {
              await whatsapp.update({ status: "OPENING" });
              removeWbot(whatsappId, false);
              failedPingCountMap.delete(whatsappId);

              const { StartWhatsAppSession } = await import("../services/WbotServices/StartWhatsAppSession");
              setTimeout(() => StartWhatsAppSession(whatsapp, whatsapp.companyId), 3000);
            }
          } catch (restartErr) {
            logger.error(`[HEALTH-CHECK] Erro ao reiniciar sessão ${whatsappId}: ${(restartErr as any).message}`);
          }
        }
        continue;
      }

      // WS está aberto — resetar contadores
      failedPingCountMap.set(whatsappId, 0);
      lastPongMap.set(whatsappId, Date.now());
    } catch (err) {
      logger.error(`[HEALTH-CHECK] Erro ao verificar sessão ${whatsappId}: ${(err as any).message}`);
    }
  }
};

export const startHealthCheck = (): void => {
  if (healthCheckTimer) return; // Já está rodando

  logger.info(`[HEALTH-CHECK] Iniciando monitoramento periódico (intervalo: ${HEALTH_CHECK_INTERVAL_MS / 1000}s)`);
  healthCheckTimer = setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL_MS);
};

export const stopHealthCheck = (): void => {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
    logger.info("[HEALTH-CHECK] Monitoramento periódico parado");
  }
};

// ✅ Variável global para armazenar a versão do WhatsApp Web
let cachedWhatsAppVersion: [number, number, number] | null = null;

/**
 * Busca e cacheia a versão do WhatsApp Web
 * Esta função é chamada uma única vez no início da aplicação
 */
export const initializeWhatsAppVersion = async (): Promise<void> => {
  try {
    if (!cachedWhatsAppVersion) {
      cachedWhatsAppVersion = await getVersionByIndexFromUrl(2);
    }
  } catch (error) {
    console.error("❌ [WBOT] Erro ao buscar versão do WhatsApp Web:", error);
    // Fallback para versão padrão
    cachedWhatsAppVersion = [2, 3000, 1024710243];
  }
};

/**
 * Retorna a versão do WhatsApp Web cacheada
 * Se não estiver cacheada, usa a versão padrão
 */
const getWhatsAppVersion = (): [number, number, number] => {
  if (!cachedWhatsAppVersion) {
    console.warn("⚠️ [WBOT] Versão não inicializada, usando versão padrão");
    return [2, 3000, 1024710243];
  }
  return cachedWhatsAppVersion;
};

// export default function msg() {
//   return {
//     get: (key: WAMessageKey) => {
//       const { id } = key;
//       if (!id) return;
//       let data = msgCache.get(id);
//       if (data) {
//         try {
//           let msg = JSON.parse(data as string);
//           return msg?.message;
//         } catch (error) {
//           logger.error(error);
//         }
//       }
//     },
//     save: (msg: WAMessage) => {
//       const { id } = msg.key;
//       const msgtxt = JSON.stringify(msg);
//       try {
//         msgCache.set(id as string, msgtxt);
//       } catch (error) {
//         logger.error(error);
//       }
//     }
//   }
// }

async function deleteFolder(folder) {
  try {
    await fs.rm(folder, { recursive: true });
  } catch (err) {
    console.error('Erro ao deletar pasta:', err);
  }
}

export const getWbot = (whatsappId: number): Session => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsappId);

  if (sessionIndex === -1) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }

  // ✅ Registrar atividade ao acessar a sessão
  touchSessionActivity(whatsappId);

  return sessions[sessionIndex];
};

const isWbotSessionReady = (session?: Session): boolean => {
  if (!session) return false;

  const wsAny = session.ws as any;
  const isWsOpen = typeof wsAny?.readyState === "number"
    ? wsAny.readyState === 1
    : typeof wsAny?.isClosed === "boolean"
      ? !wsAny.isClosed
      : !!session.user?.id;

  return Boolean(isWsOpen && session.user?.id);
};

const waitForWbotSession = async (whatsappId: number, timeoutMs = 20000): Promise<Session | null> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const session = sessions.find(s => s.id === whatsappId);
    if (isWbotSessionReady(session)) {
      touchSessionActivity(whatsappId);
      return session;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return null;
};

/**
 * Versão assíncrona de getWbot que tenta reconectar sessões desconectadas
 */
export const getWbotOrReconnect = async (whatsappId: number): Promise<Session> => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
  const existingSession = sessionIndex !== -1 ? sessions[sessionIndex] : undefined;

  if (isWbotSessionReady(existingSession)) {
    touchSessionActivity(whatsappId);
    return existingSession;
  }

  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (!whatsapp) {
    throw new AppError(`ERR_WAPP_NOT_FOUND: whatsappId=${whatsappId}`);
  }

  logger.warn(
    `[WBOT] Sessão ${whatsapp.name} (${whatsappId}) não está pronta em memória. ` +
      `statusDB=${whatsapp.status}. Tentando reinicializar antes do envio.`
  );

  try {
    const { StartWhatsAppSession } = await import("../services/WbotServices/StartWhatsAppSession");
    await StartWhatsAppSession(whatsapp, whatsapp.companyId);
  } catch (err) {
    logger.error(`[WBOT] Falha ao solicitar reinicialização da sessão ${whatsappId}: ${(err as any)?.message || err}`);
  }

  const recoveredSession = await waitForWbotSession(whatsappId);
  if (recoveredSession) return recoveredSession;

  throw new AppError(
    `ERR_WAPP_NOT_INITIALIZED: sessão WhatsApp ${whatsappId} não está pronta em memória após tentativa de reconexão`,
    400
  );
};

export const restartWbot = async (
  companyId: number,
  session?: any
): Promise<void> => {
  try {
    const options: FindOptions = {
      where: {
        companyId,
      },
      attributes: ["id"],
    }

    const whatsapp = await Whatsapp.findAll(options);

    whatsapp.map(async c => {
      const sessionIndex = sessions.findIndex(s => s.id === c.id);
      if (sessionIndex !== -1) {
        sessions[sessionIndex].ws.close();
      }

    });

  } catch (err) {
    logger.error(err);
  }
};

/**
 * Verifica se já existe outra sessão ativa com o mesmo JID e a remove.
 * Evita duplicidade de sessões consumindo memória (inspirado no Ticketz checkWbotDuplicity).
 */
const checkWbotDuplicity = (currentWhatsappId: number, jid: string): void => {
  if (!jid) return;

  for (const [whatsappId, existingJid] of jidSessionMap.entries()) {
    if (whatsappId !== currentWhatsappId && existingJid === jid) {
      logger.warn(
        `[MUTEX] JID ${jid} já conectado na sessão ${whatsappId}. Removendo duplicata para dar lugar à sessão ${currentWhatsappId}.`
      );
      removeWbot(whatsappId, false);
    }
  }
};

/**
 * Derruba o socket de uma sessão e limpa o estado em memória dela.
 *
 * `zerarContadores` decide se os contadores de DESISTÊNCIA também são
 * apagados. O padrão é NÃO apagar, e isso é essencial:
 *
 * `reconnectAttemptsMap` e `retriesQrCodeMap` existem exatamente para o
 * sistema conseguir DESISTIR de uma conexão que não volta. Eles precisam
 * sobreviver ao encerramento do socket, porque o encerramento faz parte do
 * ciclo de tentativa. Apagá-los aqui zerava a contagem a cada volta, e nem o
 * teto de 50 reconexões nem o de 3 QRs eram alcançados — a conexão ficava
 * tentando para sempre. Ver o comentário em `connection === "close"`.
 *
 * Só zera quando a interrupção é DELIBERADA (usuário desconectou, apagou a
 * conexão, ou o WhatsApp deslogou de verdade) ou quando a conexão abriu com
 * sucesso — aí o histórico de falhas realmente não interessa mais.
 */
export const removeWbot = async (
  whatsappId: number,
  isLogout = true,
  zerarContadores = false
): Promise<void> => {
  try {
    // Reset SÍNCRONO e imediato dos contadores quando é ação deliberada do
    // usuário. Feito logo no início (antes de qualquer await) para garantir
    // que a trava de QR/reconexão já esteja limpa quando o controller chamar
    // StartWhatsAppSession em seguida — removeWbot é chamado sem await, então
    // não dá para depender do reset que acontece mais abaixo.
    if (isLogout || zerarContadores) {
      reconnectAttemptsMap.delete(whatsappId);
      retriesQrCodeMap.delete(whatsappId);
    }

    const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
    if (sessionIndex !== -1) {
      const session = sessions[sessionIndex];

      // ✅ Remoção explícita de TODOS os event listeners para prevenir memory leaks
      // (principal causa de OOM — inspirado no Ticketz)
      try {
        if (session.ev) {
          session.ev.removeAllListeners();
          logger.info(`[WBOT] Todos os listeners removidos da sessão ${whatsappId}`);
        }
      } catch (evError) {
        logger.warn(`[WBOT] Falha ao remover listeners da sessão ${whatsappId}: ${(evError as any)?.message}`);
      }

      if (isLogout) {
        try {
          await session.logout();
        } catch (logoutError) {
          logger.warn(`[WBOT] Falha ao deslogar sessão ${whatsappId}: ${logoutError?.message || logoutError}`);
        }
      }

      try {
        session.ws?.close();
      } catch (closeError) {
        logger.warn(`[WBOT] Falha ao fechar socket da sessão ${whatsappId}: ${closeError?.message || closeError}`);
      }

      sessions.splice(sessionIndex, 1);
      lastPongMap.delete(whatsappId);
      failedPingCountMap.delete(whatsappId);
      cancelStabilityTimer(whatsappId);
      inMemoryStores.delete(whatsappId);
      lastActivityMap.delete(whatsappId);
      jidSessionMap.delete(whatsappId);
      conflictDisconnectMap.delete(whatsappId);
      initLocks.delete(whatsappId);

      // NÃO apagar reconnectAttemptsMap / retriesQrCodeMap aqui por padrão.
      // Eles são os contadores de desistência e precisam atravessar o
      // encerramento do socket — ver o comentário no topo desta função.
      if (isLogout || zerarContadores) {
        reconnectAttemptsMap.delete(whatsappId);
        retriesQrCodeMap.delete(whatsappId);
      }

      // ✅ Liberar lock de StartWhatsAppSession
      try {
        const { releaseStartLock } = await import("../services/WbotServices/StartWhatsAppSession");
        releaseStartLock(whatsappId);
      } catch (lockErr) {
        logger.warn(`[WBOT] Falha ao liberar lock da sessão ${whatsappId}: ${(lockErr as any)?.message || lockErr}`);
      }

      // Parar health check e idle check se não há mais sessões
      if (sessions.length === 0) {
        stopHealthCheck();
        stopIdleCheck();
      }
    }

    // IMPORTANTE: zerar os contadores de desistência TAMBÉM quando a sessão
    // já não está mais na lista (sessionIndex === -1).
    //
    // Quando a conexão bate o teto de 3 QRs, o código de desistência já fez
    // `wsocket = null` e removeu a sessão de `sessions`. A partir daí, o
    // retriesQrCodeMap fica preso em MAX_QRCODE_RETRIES. Se o reset ficasse só
    // dentro do if(sessionIndex !== -1), o clique do usuário em "Tentar
    // novamente" / "Novo QR Code" (que chama removeWbot com zerarContadores)
    // não limparia a trava — a nova sessão subiria, bateria no teto na hora e
    // pararia sem gerar QR. Por isso o reset também acontece aqui fora.
    if (isLogout || zerarContadores) {
      reconnectAttemptsMap.delete(whatsappId);
      retriesQrCodeMap.delete(whatsappId);
    }
  } catch (err) {
    logger.error(err);
  }
};

export function internalIsJidGroup(jid: string): boolean {
  return isJidGroup(jid);
}

// export const msgDB = msg();

// Mapa para armazenar callbacks de pairing code pendentes
const pairingCodeCallbacks = new Map<number, (code: string) => void>();

const isSessionReadyForPairing = (session: Session | undefined): { ready: boolean; reason: string } => {
  if (!session) return { ready: false, reason: "session_null" };

  const wsAny = session?.ws as any;

  // Checar se o websocket está aberto usando múltiplas heurísticas
  const readyState = wsAny?.readyState;
  const isClosed = wsAny?.isClosed;
  const isWsOpen =
    (typeof readyState === "number" && readyState === 1) ||
    (typeof isClosed === "boolean" && !isClosed) ||
    (readyState === undefined && isClosed === undefined && !!wsAny); // WS existe mas sem propriedades padrão

  if (!isWsOpen) return { ready: false, reason: `ws_not_open (readyState=${readyState}, isClosed=${isClosed})` };

  // Não exigir authState.creds — em Baileys v7 o creds pode não estar exposto no socket
  // O importante é que o socket esteja aberto e NÃO registrado (sem user.id)
  const isRegistered = !!session?.user?.id;
  if (isRegistered) return { ready: false, reason: "already_registered" };

  return { ready: true, reason: "ok" };
};

const normalizePairingCode = (code: string): string => {
  return String(code || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
};


export const requestPairingCode = async (whatsappId: number, phoneNumber: string): Promise<string> => {
  const cleanNumber = phoneNumber.replace(/\D/g, "");

  if (!cleanNumber || cleanNumber.length < 10) {
    throw new AppError("Número inválido. Use o formato: 5511999998888", 400);
  }

  const maxAttempts = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const session = sessions.find(s => s.id === whatsappId);

    if (!session) {
      logger.error(`[PairingCode] Sessão ${whatsappId} NÃO encontrada em memória. Sessions ativas: [${sessions.map(s => s.id).join(",")}]`);
      throw new AppError("ERR_WAPP_NOT_INITIALIZED — sessão não está em memória. Clique em 'Tentar novamente' na tela de conexões.", 400);
    }

    // Verificar se já está registrado (conectado) — checar APENAS user.id, não creds.registered
    // porque creds.registered pode ser true de sessão anterior residual
    if (session?.user?.id) {
      throw new AppError("Sessão já está autenticada. Desconecte antes de solicitar novo pareamento.", 400);
    }

    try {
      const readiness = isSessionReadyForPairing(session);
      logger.info(`[PairingCode] Tentativa ${attempt}/${maxAttempts} - readiness: ${JSON.stringify(readiness)}`);

      if (!readiness.ready) {
        if (readiness.reason === "already_registered") {
          throw new AppError("Sessão já está autenticada.", 400);
        }

        // Aguardar WS estabilizar
        logger.warn(`[PairingCode] Sessão ${whatsappId} não pronta: ${readiness.reason}. Aguardando 3s...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Re-buscar sessão (pode ter sido recriada)
        const retrySession = sessions.find(s => s.id === whatsappId);
        const retryReadiness = isSessionReadyForPairing(retrySession);
        if (!retryReadiness.ready) {
          throw new Error(`PAIRING_SESSION_NOT_READY: ${retryReadiness.reason}`);
        }
      }

      // Delay de estabilização reduzido: 2s ao invés de 5s
      // (o controller já espera 2s antes de chamar esta função)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Re-buscar sessão mais recente antes de chamar requestPairingCode
      const currentSession = sessions.find(s => s.id === whatsappId);
      if (!currentSession) {
        throw new Error("Sessão perdida durante estabilização");
      }

      logger.info(`[PairingCode] Chamando requestPairingCode no Baileys para número ${cleanNumber}...`);
      const rawCode = await (currentSession as any).requestPairingCode(cleanNumber);
      logger.info(`[PairingCode] Baileys retornou código raw: "${rawCode}"`);

      const normalizedCode = normalizePairingCode(rawCode);

      if (!normalizedCode || normalizedCode.length < 4 || normalizedCode === "SUK1CH4N") {
        logger.warn(`[PairingCode] Código inválido recebido: "${normalizedCode}" (raw: "${rawCode}")`);
        throw new Error("INVALID_PAIRING_CODE");
      }

      logger.info(`[PairingCode] ✅ Código gerado para whatsappId=${whatsappId} na tentativa ${attempt}/${maxAttempts}: ${normalizedCode}`);
      return normalizedCode;
    } catch (err: any) {
      lastError = err;
      const message = err?.message || String(err);
      const canRetry =
        attempt < maxAttempts &&
        /(PAIRING_SESSION_NOT_READY|INVALID_PAIRING_CODE|timeout|timed out|closed|connection|stream|conflict|temporarily unavailable|429|rate|not initialized)/i.test(message);

      logger.warn(`[PairingCode] Falha na tentativa ${attempt}/${maxAttempts} para whatsappId=${whatsappId}: ${message}`);

      if (!canRetry) {
        break;
      }

      // Delay progressivo entre tentativas
      const retryDelay = 2000 * attempt;
      logger.info(`[PairingCode] Aguardando ${retryDelay}ms antes da próxima tentativa...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  logger.error(`[PairingCode] Erro ao solicitar código após ${maxAttempts} tentativas: ${lastError?.message || lastError}`);
  throw new AppError(lastError?.message || "Erro ao gerar código de pareamento.", 500);
};

// ✅ Lock baseado em Promise: impede inicialização paralela do mesmo whatsappId
const initLocks = new Map<number, Promise<Session>>();

const doInitWASocket = async (whatsapp: Whatsapp): Promise<Session> => {
  return new Promise(async (resolve, reject) => {
    try {
      (async () => {

        const io = getIO();

        const whatsappUpdate = await Whatsapp.findOne({
          where: { id: whatsapp.id }
        });

        if (!whatsappUpdate) return;

        const { id, name, allowGroup, companyId } = whatsappUpdate;

        logger.info(`Starting session ${name}`);
        let retriesQrCode = 0;

        let wsocket: Session = null;

        const store = new NodeCache({
          stdTTL: 3600, //1 hora
          checkperiod: 30,
          useClones: false
        });

        const baileysStore = makeInMemoryStore({ logger: loggerBaileys });
        inMemoryStores.set(id, baileysStore);

        const msgRetryCounterCache = new NodeCache({
          stdTTL: 60 * 60,
          useClones: false
        });

        // ✅ Baileys v7: Retry de sessão para erros BAD_MAC / NO_SESSION
        // Este patch existia no fork renatoiub/WSocket e não existe na v7 oficial.
        // Quando o Baileys falha ao descriptografar uma mensagem (BAD_MAC) ou
        // não encontra a sessão Signal (NO_SESSION), ele chama getMessage() para
        // reenviar. Este cache conta as tentativas para evitar loops infinitos.
        const sessionRetryCache = new NodeCache({
          stdTTL: 60 * 5, // 5 minutos
          useClones: false
        });
        const MAX_SESSION_RETRIES = 3;

        async function getMessage(
          key: WAMessageKey
        ): Promise<WAMessageContent> {
          if (!key.id) return null;

          const message = store.get(key.id);

          if (message) {
            logger.info({ message }, "cacheMessage: recovered from cache");
            return message;
          }

          logger.info(
            { key },
            "cacheMessage: not found in cache - fallback to database"
          );

          let msg: Message;

          msg = await Message.findOne({
            where: { wid: key.id, fromMe: true }
          });

          if (!msg) {
            logger.info({ key }, "cacheMessage: not found in database");
            return undefined;
          }

          try {
            const data = JSON.parse(msg.dataJson);
            logger.info(
              { key, data },
              "cacheMessage: recovered from database"
            );
            store.set(key.id, data.message);
            return data.message || undefined;
          } catch (error) {
            logger.error(
              { key },
              `cacheMessage: error parsing message from database - ${error.message}`
            );
          }

          return undefined;
        }

        // ✅ Usar versão cacheada ao invés de buscar toda vez
        const versionWA = getWhatsAppVersion();

        const publicFolder = path.join(__dirname, '..', '..', '..', 'backend', 'sessions');
        const folderSessions = path.join(publicFolder, `company${whatsapp.companyId}`, whatsapp.id.toString());

        const { state, saveCreds } = await useMultiFileAuthState(whatsapp);

        // ✅ Whitelabel: usa o appName configurado em Settings como nome do dispositivo
        // exibido no celular do cliente ao parear (em vez de "Chrome").
        let whitelabelName = "Chrome";
        try {
          // Tenta primeiro o appName da empresa do WhatsApp; se não existir,
          // tenta o appName global (companyId = 1) como fallback.
          let appNameSetting = await Setting.findOne({
            where: { companyId: whatsapp.companyId, key: "appName" }
          });
          if (!appNameSetting?.value || !appNameSetting.value.trim()) {
            appNameSetting = await Setting.findOne({
              where: { companyId: 1, key: "appName" }
            });
          }
          if (appNameSetting?.value && appNameSetting.value.trim().length > 0) {
            whitelabelName = appNameSetting.value.trim();
          }
          logger.info(`[WBOT] Whitelabel browser name: "${whitelabelName}" (companyId=${whatsapp.companyId})`);
        } catch (err) {
          logger.warn(`[WBOT] Não foi possível carregar appName do whitelabel: ${err?.message}`);
        }

        wsocket = makeWASocket({
          version: versionWA || [2, 3000, 1024710243],
          logger: loggerBaileys,
          printQRInTerminal: false,
          auth: {
            creds: state.creds,
            /** ✅ Baileys v7: cache em memória para Signal keys — reduz I/O no Redis */
            keys: makeCacheableSignalKeyStore(state.keys, loggerBaileys),
          },
          // ✅ Inspirado no Ticketz: configurações otimizadas para estabilidade
          emitOwnEvents: true, // ✅ Necessário para exibir mensagens enviadas no painel
          markOnlineOnConnect: false, // ✅ Ticketz usa false — evita tráfego desnecessário ao conectar
          // ── SINCRONIZAÇÃO DE HISTÓRICO ────────────────────────────────
          //
          // Estava fixo em `true`, e isso pedia ao WhatsApp o histórico
          // INTEIRO da conta a cada sincronização: banda, CPU de
          // descriptografia de cada mensagem antiga e RAM (o lote fica em
          // memória e depois vai parar no in-memory store). Numa conta de
          // atendimento com anos de conversa isso são centenas de milhares
          // de mensagens POR CONEXÃO.
          //
          // Repare a incoerência com a linha logo acima: `markOnlineOnConnect:
          // false` está lá justamente "para evitar tráfego desnecessário ao
          // conectar" — mas a opção que traz ordens de grandeza mais tráfego
          // ficou ligada.
          //
          // E o próprio código não queria isso. O comentário do handler de
          // `messaging-history.set` (mais abaixo, ~linha 860) diz que a
          // intenção é "só o aproveitamento do que o próprio WhatsApp já
          // manda de graça no sync inicial (tipicamente as últimas dezenas de
          // mensagens por conversa)". Com `false` é exatamente isso que
          // chega — o suficiente para cada conversa nascer com a
          // mensagem-âncora de que o botão "Importar mensagens anteriores"
          // precisa.
          //
          // Fica em `true` só quando o operador pediu de fato uma importação
          // histórica naquela conexão (`importOldMessages` preenchido), ou
          // quando forçado por env.
          syncFullHistory:
            process.env.WBOT_SYNC_FULL_HISTORY === "true" ||
            !!whatsappUpdate?.importOldMessages,
          // ✅ ESTABILIDADE: 1 retry / 10ms fazia o app-state transaction falhar sob carga,
          // perdendo chaves e derrubando a sessão. Volta aos defaults do Baileys.
          transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 300 },
          generateHighQualityLinkPreview: true,
          // Usa o nome do whitelabel (appName) como identificador visível no celular
          browser: Browsers.macOS(whitelabelName),
          defaultQueryTimeoutMs: 60000,
          connectTimeoutMs: 60000,
          // ✅ Keep-alive explícito: sem ping periódico o WS morre silenciosamente
          // atrás de NAT/proxy e a sessão "cai toda hora" após conectar.
          keepAliveIntervalMs: 25000,
          qrTimeout: 60000,
          // ✅ Reenvio de requisições falhas (evita queda por decrypt/retry timeout)
          retryRequestDelayMs: 1000,
          maxMsgRetryCount: MAX_SESSION_RETRIES,
          msgRetryCounterCache,
          cachedGroupMetadata: async (jid) => {
            const cachedMeta = await getGroupMetadataCache(whatsapp.id, jid);
            if (cachedMeta?.data === 403) {
              throw new AppError(
                "Não foi possível enviar para este grupo: apenas administradores podem enviar mensagens nele."
              );
            }
            return cachedMeta;
          },
          shouldIgnoreJid: jid => {
            const ignoreJid = (!allowGroup && isJidGroup(jid)) ||
              isJidBroadcast(jid) ||
              isJidNewsletter(jid) ||
              isJidStatusBroadcast(jid)
            // || isJidMetaIa(jid)
            return ignoreJid
          },
          getMessage
        });

        wsocket.id = whatsapp.id;

        wsocket.store = (msg: proto.IWebMessageInfo): void => {
          if (!msg.key.fromMe) return;

          logger.debug({ message: msg.message }, "cacheMessage: saved");

          store.set(msg.key.id, msg.message);
        };

        // ✅ Importação de mensagens: captura mensagens durante sincronização de histórico
        // ✅ FIX: Helper para extrair timestamp de forma segura (Long ou number)
        const getTimestampMs = (msg: any): number => {
          const ts = msg?.messageTimestamp;
          if (!ts) return 0;
          // Long object (protobuf)
          if (typeof ts === "object" && ts !== null) {
            if (typeof ts.low === "number") return Math.floor(ts.low * 1000);
            if (typeof ts.toNumber === "function") return Math.floor(ts.toNumber() * 1000);
          }
          // Plain number
          if (typeof ts === "number") return Math.floor(ts * 1000);
          // String fallback
          const parsed = parseInt(String(ts), 10);
          if (!isNaN(parsed)) return Math.floor(parsed * 1000);
          return 0;
        };

        setTimeout(async () => {
          const wpp = await Whatsapp.findByPk(whatsapp.id);
          // ✅ FIX: este listener (e a persistência do histórico inicial que o
          // WhatsApp manda sozinho logo após o pareamento) antes só rodava se
          // `importOldMessages` (uma DATA) já estivesse preenchida no registro
          // da conexão — mas não existe (nem existiu) nenhum campo na tela de
          // conexão pra configurar isso, então essa condição nunca era
          // verdadeira e esse listener nunca era sequer registrado. Resultado:
          // TODA conversa nova ficava permanentemente sem nenhuma mensagem
          // salva localmente — e sem isso, o botão "Importar mensagens
          // anteriores" nunca tinha uma âncora pra estender (o protocolo do
          // WhatsApp só permite pedir histórico de uma conversa que o app já
          // viu pelo menos 1 mensagem, nunca "do zero"), então ficava preso
          // pra sempre em "sem mensagem-âncora... pulando".
          //
          // Agora roda sempre que a conexão está CONECTADA, sem exigir esse
          // campo. Se `importOldMessages`/`importRecentMessages` estiverem
          // preenchidos (fluxo legado, caso algum dia volte a ter uma tela
          // própria), continua respeitando esse período específico; senão usa
          // uma janela padrão ampla (últimos 2 anos) só pra garantir que cada
          // conversa nasça com pelo menos uma mensagem salva — não é uma
          // importação em massa "oficial" pedida pelo operador, é só o
          // aproveitamento do que o próprio WhatsApp já manda de graça no
          // sync inicial (tipicamente as últimas dezenas de mensagens por
          // conversa). Mensagens de GRUPO continuam de fora por padrão (só
          // entram se `importOldMessagesGroups` estiver true), pra não
          // inundar "Aguardando" com um ticket por grupo logo no pareamento.
          if (wpp?.status === "CONNECTED") {
            const hasCustomImportRange = !!wpp.importOldMessages;

            // ✅ Import automático DESLIGADO por pedido explícito: só roda
            // quando o operador realmente pediu uma importação (tela
            // "Importar mensagens anteriores", que preenche
            // importOldMessages/importRecentMessages). Antes disso, quando
            // `hasCustomImportRange` era falso, o código caía num período
            // "padrão" de 2 anos e processava sozinho tudo que o WhatsApp
            // manda de graça no sync inicial — nenhum botão foi clicado,
            // mas rodava um import de até 2 anos de histórico em toda
            // conexão, toda vez que ela conectava. Era exatamente esse
            // comportamento "automático" que não deveria existir.
            if (!hasCustomImportRange) {
              return;
            }

            let dateOldLimit = new Date(wpp.importOldMessages).getTime();
            let dateRecentLimit = new Date(wpp.importRecentMessages).getTime();

            addLogs({
              fileName: `preparingImportMessagesWppId${whatsapp.id}.txt`, forceNewFile: true,
              text: `Aguardando conexão para iniciar a importação de mensagens:
  Whatsapp nome: ${wpp.name}
  Whatsapp Id: ${wpp.id}
  Criação do arquivo de logs: ${moment().format("DD/MM/YYYY HH:mm:ss")}
  Selecionado Data de inicio de importação: ${moment(dateOldLimit).format("DD/MM/YYYY HH:mm:ss")}
  Selecionado Data final da importação: ${moment(dateRecentLimit).format("DD/MM/YYYY HH:mm:ss")}
  `});

            const statusImportMessages = new Date().getTime();
            await wpp.update({ statusImportMessages });

            // ✅ FIX: Variável para controlar o debounce do processamento
            let importDebounceTimer: NodeJS.Timeout | null = null;

            wsocket.ev.on("messaging-history.set", async (messageSet: any) => {
              if (!wsocket) return;

              // TRAVA DE IMPORTAÇÃO AUTOMÁTICA
              //
              // Ao conectar, o WhatsApp envia um lote de histórico recente mesmo
              // com syncFullHistory:false. Sem esta trava, o histórico era
              // importado sempre — inclusive quando o operador NÃO marcou
              // importação na conexão. Agora só processa se houver pedido
              // explícito de importação (importOldMessages ou importRecentMessages
              // preenchidos). Sem isso, ignoramos o lote inicial.
              const importSolicitado =
                !!wpp?.importOldMessages || !!wpp?.importRecentMessages;
              if (!importSolicitado) {
                logger.info(
                  `[IMPORT] messaging-history.set ignorado para wpp ${whatsapp.id} — importação não solicitada nesta conexão.`
                );
                return;
              }
              try {
                const statusImportMessages = new Date().getTime();
                await wpp.update({ statusImportMessages });

                const whatsappId = whatsapp.id;
                let filteredMessages = messageSet.messages || [];
                let filteredDateMessages = [];

                logger.info(`[IMPORT] messaging-history.set recebido: ${filteredMessages.length} mensagens para wpp ${whatsappId}`);

                filteredMessages.forEach((msg: any) => {
                  try {
                    const timestampMsg = getTimestampMs(msg);
                    if (timestampMsg === 0) return; // ✅ FIX: skip msgs sem timestamp válido

                    if (isValidMsg(msg) && dateOldLimit < timestampMsg && dateRecentLimit > timestampMsg) {
                      if (msg.key?.remoteJid?.split("@")[1] !== "g.us") {
                        addLogs({
                          fileName: `preparingImportMessagesWppId${whatsapp.id}.txt`, text: `Adicionando mensagem para pos processamento:
  Não é Mensagem de GRUPO
  Data e hora da mensagem: ${moment(timestampMsg).format("DD/MM/YYYY HH:mm:ss")}
  Contato da Mensagem : ${msg.key?.remoteJid}
  Tipo da mensagem : ${getTypeMessage(msg)}
  `});
                        filteredDateMessages.push(msg);
                      } else {
                        if (wpp?.importOldMessagesGroups) {
                          addLogs({
                            fileName: `preparingImportMessagesWppId${whatsapp.id}.txt`, text: `Adicionando mensagem para pos processamento:
  Mensagem de GRUPO
  Data e hora da mensagem: ${moment(timestampMsg).format("DD/MM/YYYY HH:mm:ss")}
  Contato da Mensagem : ${msg.key?.remoteJid}
  Tipo da mensagem : ${getTypeMessage(msg)}
  `});
                          filteredDateMessages.push(msg);
                        }
                      }
                    }
                  } catch (msgErr) {
                    // ✅ FIX: Não deixar uma mensagem inválida abortar todo o lote
                    logger.warn(`[IMPORT] Erro ao processar mensagem individual: ${msgErr.message}`);
                  }
                });

                logger.info(`[IMPORT] ${filteredDateMessages.length} mensagens filtradas de ${filteredMessages.length} para wpp ${whatsappId}`);

                if (!dataMessages?.[whatsappId]) {
                  dataMessages[whatsappId] = [];
                }
                dataMessages[whatsappId].unshift(...filteredDateMessages);

                // ✅ Emit progress
                setTimeout(async () => {
                  try {
                    const wppInner = await Whatsapp.findByPk(whatsappId);
                    if (!wppInner) return;
                    io.of(String(companyId))
                      .emit(`importMessages-${wppInner.companyId}`, {
                        action: "update",
                        status: { this: -1, all: -1 }
                      });
                    io.of(String(companyId))
                      .emit(`company-${companyId}-whatsappSession`, {
                        action: "update",
                        session: wppInner
                      });
                  } catch (e) { /* ignore */ }
                }, 500);

                // ✅ FIX: Debounce — resetar timer a cada novo lote de history
                // Só inicia o processamento 30s após o ÚLTIMO lote recebido
                if (importDebounceTimer) {
                  clearTimeout(importDebounceTimer);
                }
                importDebounceTimer = setTimeout(async () => {
                  try {
                    const wppInner = await Whatsapp.findByPk(whatsappId);
                    // ✅ FIX: mesma mudança de cima — não exige mais
                    // importOldMessages preenchido pra efetivamente processar
                    // e persistir o lote bufferizado.
                    if (wppInner) {
                      let isTimeStamp = !isNaN(
                        new Date(Math.floor(parseInt(wppInner?.statusImportMessages))).getTime()
                      );
                      if (isTimeStamp) {
                        const ultimoStatus = new Date(
                          Math.floor(parseInt(wppInner?.statusImportMessages))
                        ).getTime();
                        const dataLimite = +add(ultimoStatus, { seconds: +30 }).getTime();
                        if (dataLimite < new Date().getTime()) {
                          logger.info(`[IMPORT] Iniciando processamento de ${dataMessages[whatsappId]?.length || 0} mensagens para wpp ${whatsappId}`);
                          ImportWhatsAppMessageService(wppInner.id);
                          wppInner.update({ statusImportMessages: "Running" });
                        }
                      }
                    }
                    io.of(String(companyId))
                      .emit(`company-${companyId}-whatsappSession`, {
                        action: "update",
                        session: wppInner
                      });
                  } catch (e) {
                    logger.error(`[IMPORT] Erro no debounce timer: ${e.message}`);
                  }
                }, 1000 * 30);
              } catch (err) {
                logger.error(`[IMPORT] Erro no handler messaging-history.set: ${err.message}`);
                Sentry.captureException(err);
              }
            });
          }
        }, 2500);


        wsocket.ev.on(
          "connection.update",
          async ({ connection, lastDisconnect, qr }) => {
            const lastDisconnectMessage =
              (lastDisconnect?.error as any)?.message || "";

            logger.info(
              `Socket  ${name} Connection Update ${connection || ""} ${lastDisconnectMessage}`
            );

            if (connection === "close") {
              // ✅ Cancelar timer de estabilidade — sessão caiu antes do período mínimo
              cancelStabilityTimer(id);

              const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
              const disconnectMessage = (lastDisconnect?.error as Error | undefined)?.message || "";
              const isLoggedOut = statusCode === DisconnectReason.loggedOut;
              const isForbidden = statusCode === 403;
              const isRestartRequired = statusCode === DisconnectReason.restartRequired;
              const isConflictDisconnect =
                !isRestartRequired && (statusCode === 440 || /conflict|replaced|stream errored/i.test(disconnectMessage));

              let shouldReconnect = !isLoggedOut && !isForbidden;
              let conflictCount = 0;

              if (isConflictDisconnect) {
                const now = Date.now();
                const previous = conflictDisconnectMap.get(id);
                const withinWindow = !!previous && now - previous.firstAt <= CONFLICT_WINDOW_MS;

                conflictCount = withinWindow ? previous.count + 1 : 1;

                conflictDisconnectMap.set(id, {
                  count: conflictCount,
                  firstAt: withinWindow ? previous.firstAt : now
                });

                if (conflictCount > MAX_CONFLICT_RECONNECTS) {
                  shouldReconnect = false;
                }
              }

              logger.info(
                `[WBOT] ${name} desconectado - statusCode: ${statusCode}, reconectar: ${shouldReconnect}`
              );

              if (isForbidden) {
                // Banned ou bloqueado — limpar sessão
                await whatsapp.update({ status: "PENDING", session: "" });
                await DeleteBaileysService(whatsapp.id);
                await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
                io.of(String(companyId))
                  .emit(`company-${whatsapp.companyId}-whatsappSession`, {
                    action: "update",
                    session: whatsapp
                  });
                removeWbot(id, false);
                reconnectAttemptsMap.delete(id);
                conflictDisconnectMap.delete(id);
              } else if (isLoggedOut) {
                // loggedOut: não reconectar — aguarda ação do usuário
                logger.info(`[WBOT] ${name} deslogado pelo usuário. Aguardando nova autenticação.`);
                await whatsapp.update({ status: "PENDING", session: "" });
                await DeleteBaileysService(whatsapp.id);
                await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
                io.of(String(companyId))
                  .emit(`company-${whatsapp.companyId}-whatsappSession`, {
                    action: "update",
                    session: whatsapp
                  });
                removeWbot(id, false);
                reconnectAttemptsMap.delete(id);
                conflictDisconnectMap.delete(id);
              } else if (shouldReconnect) {
                if (isConflictDisconnect) {
                  logger.warn(
                    `[WBOT] ${name} conflito de sessão detectado (${conflictCount}/${MAX_CONFLICT_RECONNECTS}). Tentando reconectar...`
                  );
                }

                await whatsapp.update({ status: "OPENING" });
                io.of(String(companyId))
                  .emit(`company-${whatsapp.companyId}-whatsappSession`, {
                    action: "update",
                    session: whatsapp
                  });

                // restartRequired é esperado pelo Baileys; não penalizar com tentativas acumuladas
                if (isRestartRequired) {
                  reconnectAttemptsMap.delete(id);
                }

                const attempts = reconnectAttemptsMap.get(id) || 0;

                if (attempts >= MAX_RECONNECT_ATTEMPTS) {
                  logger.warn(`[WBOT] ${name} atingiu máximo de ${MAX_RECONNECT_ATTEMPTS} tentativas de reconexão. Parando.`);
                  await whatsapp.update({ status: "DISCONNECTED" });
                  io.of(String(companyId))
                    .emit(`company-${whatsapp.companyId}-whatsappSession`, {
                      action: "update",
                      session: whatsapp
                    });
                  removeWbot(id, false);
                  reconnectAttemptsMap.delete(id);
                } else {
                  const delay = getReconnectDelay(id);
                  reconnectAttemptsMap.set(id, attempts + 1);
                  logger.info(`[WBOT] ${name} reconectando em ${Math.round(delay / 1000)}s (tentativa ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
                  await removeWbot(id, false);
                  try {
                    const { releaseStartLock } = await import("../services/WbotServices/StartWhatsAppSession");
                    releaseStartLock(whatsapp.id);
                  } catch (lockErr) {
                    logger.warn(`[WBOT] Falha ao liberar lock da sessão ${whatsapp.id}: ${(lockErr as any)?.message || lockErr}`);
                  }
                  setTimeout(
                    async () => {
                      const { StartWhatsAppSession } = await import("../services/WbotServices/StartWhatsAppSession");
                      StartWhatsAppSession(whatsapp, whatsapp.companyId);
                    },
                    delay
                  );
                }
              } else {
                logger.warn(
                  `[WBOT] ${name} recebeu conflitos consecutivos (${conflictCount}) e foi marcado como DISCONNECTED para evitar loop.`
                );
                await whatsapp.update({ status: "DISCONNECTED" });
                io.of(String(companyId))
                  .emit(`company-${whatsapp.companyId}-whatsappSession`, {
                    action: "update",
                    session: whatsapp
                  });
                removeWbot(id, false);
                reconnectAttemptsMap.delete(id);
                conflictDisconnectMap.delete(id);
              }
            }

            if (connection === "open") {
              conflictDisconnectMap.delete(id);

              // Conectou: o histórico de falhas não interessa mais.
              //
              // O contador de QR PRECISA ser zerado aqui — é o único ponto,
              // fora de ação explícita do usuário, em que sabemos que a
              // conexão está boa. Sem isto, uma conexão que ficou no teto de
              // QRs e depois foi pareada continuaria marcada como "desistida"
              // e não geraria QR na próxima vez que precisasse.
              retriesQrCodeMap.delete(id);

              // ✅ Atenua backoff ao reconectar para não acumular penalidade excessiva em redes instáveis
              const currentAttempts = reconnectAttemptsMap.get(id) || 0;
              if (currentAttempts > 0) {
                reconnectAttemptsMap.set(id, Math.max(0, currentAttempts - 1));
              }

              // ✅ Reset estável: reseta totalmente após período mínimo conectado
              scheduleBackoffReset(id, name);
              // ✅ Registrar pong inicial e iniciar health check
              lastPongMap.set(id, Date.now());
              startHealthCheck();
              // ✅ Registrar atividade inicial
              touchSessionActivity(id);

              wsocket.myLid = jidNormalizedUser(wsocket.user?.lid)
              wsocket.myJid = jidNormalizedUser(wsocket.user.id)

              // ✅ Mutex: verificar e eliminar sessões duplicadas com mesmo JID
              const normalizedJid = jidNormalizedUser(wsocket.user.id);
              checkWbotDuplicity(id, normalizedJid);
              jidSessionMap.set(id, normalizedJid);

              // ✅ Presença: invalidar cache de "available" e re-enviar imediatamente
              //    para esta sessão recém-conectada, garantindo que o WhatsApp volte
              //    a entregar presence.update (online/digitando/gravando) para os
              //    tickets abertos sem precisar reiniciar o servidor.
              try {
                const { resetPresenceAvailableCache } = await import("./socket");
                resetPresenceAvailableCache(whatsapp.id);
              } catch (err) {
                logger.warn(`[PRESENCE] falha ao resetar cache available: ${(err as Error)?.message || err}`);
              }
              try {
                if (typeof (wsocket as any).sendPresenceUpdate === "function") {
                  await (wsocket as any).sendPresenceUpdate("available");
                }
              } catch (err) {
                logger.warn(`[PRESENCE] falha ao enviar available inicial: ${(err as Error)?.message || err}`);
              }

              await whatsapp.update({
                status: "CONNECTED",
                qrcode: "",
                retries: 0,
                number: jidNormalizedUser((wsocket as WASocket).user.id).split("@")[0]
              });

              // Recarregar para garantir que todos os campos estejam atualizados antes de emitir
              await whatsapp.reload();

              logger.debug(
                {
                  id: jidNormalizedUser(wsocket.user.id),
                  name: wsocket.user.name,
                  lid: jidNormalizedUser(wsocket.user?.lid),
                  notify: wsocket.user?.notify,
                  verifiedName: wsocket.user?.verifiedName,
                  imgUrl: wsocket.user?.imgUrl,
                  status: wsocket.user?.status
                },
                `Session ${name} details`
              );

              io.of(String(companyId))
                .emit(`company-${whatsapp.companyId}-whatsappSession`, {
                  action: "update",
                  session: whatsapp
                });

              const sessionIndex = sessions.findIndex(
                s => s.id === whatsapp.id
              );
              if (sessionIndex === -1) {
                wsocket.id = whatsapp.id;
                sessions.push(wsocket);
              }

              resolve(wsocket);
            }

            if (qr !== undefined) {
              // O teto de QRs é POR CONEXÃO, não por socket.
              //
              // Antes, o valor gravado no mapa vinha de `retriesQrCode`, uma
              // variável local desta chamada de initWASocket. A cada
              // reconexão nasce um socket novo, com a variável de volta em
              // zero — e como o removeWbot ainda apagava o mapa, a contagem
              // recomeçava. O teto de 3 só valia dentro de um socket, então a
              // conexão fazia: 3 QRs, timeout 408, reconecta, 3 QRs, para
              // sempre. Cada QR custa handshake Noise (Curve25519), geração
              // do código, UPDATE no banco e emissão no socket — era isso que
              // prendia um núcleo da VPS sem ninguém usando o sistema.
              //
              // Agora a contagem vem do mapa, que sobrevive ao encerramento
              // do socket. Três QRs sem leitura e a conexão para de vez, até
              // alguém agir na tela.
              const qrsGerados = retriesQrCodeMap.get(id) || 0;

              if (qrsGerados >= MAX_QRCODE_RETRIES) {
                logger.warn(
                  `[WBOT] ${name} gerou ${qrsGerados} QR Codes sem ser lido. Parando de tentar — a conexão precisa ser reiniciada manualmente.`
                );
                await whatsappUpdate.update({
                  status: "DISCONNECTED",
                  qrcode: ""
                });
                await DeleteBaileysService(whatsappUpdate.id);
                await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
                io.of(String(companyId))
                  .emit(`company-${whatsapp.companyId}-whatsappSession`, {
                    action: "update",
                    session: whatsappUpdate
                  });
                wsocket.ev.removeAllListeners();
                wsocket.ws.close();
                wsocket = null;
                // Trava a sessão como "desistida": enquanto o contador
                // estiver no teto, a próxima tentativa de subir esta conexão
                // cai direto aqui em vez de gerar mais QRs. Só é zerado por
                // ação do usuário (removeWbot com isLogout/zerarContadores)
                // ou quando a conexão abre de verdade.
                retriesQrCodeMap.set(id, MAX_QRCODE_RETRIES);
                // Resolver a promise para não travar StartWhatsAppSession
                resolve(null as any);
              } else {
                logger.info(`Session QRCode Generate ${name}`);
                retriesQrCode += 1;
                retriesQrCodeMap.set(id, qrsGerados + 1);

                await whatsapp.update({
                  qrcode: qr,
                  status: "qrcode",
                  retries: 0,
                  number: ""
                });
                const sessionIndex = sessions.findIndex(
                  s => s.id === whatsapp.id
                );

                if (sessionIndex === -1) {
                  wsocket.id = whatsapp.id;
                  sessions.push(wsocket);
                }

                io.of(String(companyId))
                  .emit(`company-${whatsapp.companyId}-whatsappSession`, {
                    action: "update",
                    session: whatsapp
                  });

                // Resolver na primeira geração de QR para não bloquear
                if (retriesQrCode === 1) {
                  resolve(wsocket);
                }
              }
            }
          }
        );
        wsocket.ev.on("creds.update", saveCreds);

        // ✅ Baileys v7: Retry automático de sessão Signal para erros BAD_MAC / NO_SESSION
        // Na v7 oficial, o Baileys não faz retry automático de sessões corrompidas.
        // Este handler detecta falhas de descriptografia e invalida a sessão Signal,
        // forçando o Baileys a criar uma nova sessão na próxima tentativa.
        wsocket.ev.on("messages.update", async (updates) => {
          if (!wsocket) return;
          for (const update of updates) {
            // Detectar mensagens que falharam na descriptografia (status de erro)
            const updateAny = update as any;
            if (updateAny?.update?.messageStubType === WAMessageStubType.CIPHERTEXT) {
              const msgId = update.key?.id;
              if (!msgId) continue;

              const retryCount = (sessionRetryCache.get(msgId) as number) || 0;
              if (retryCount >= MAX_SESSION_RETRIES) {
                logger.warn(`[SESSION-RETRY] Máximo de tentativas atingido para msg ${msgId}, ignorando`);
                sessionRetryCache.del(msgId);
                continue;
              }

              sessionRetryCache.set(msgId, retryCount + 1);
              logger.info(`[SESSION-RETRY] Tentativa ${retryCount + 1}/${MAX_SESSION_RETRIES} para msg ${msgId} (BAD_MAC/NO_SESSION)`);
            }
          }
        });

        // NOTA: O listener de "presence.update" está centralizado em
        // wbotMessageListener.ts (função wbotMessageListener). Manter
        // apenas um listener evita emissão duplicada do evento
        // "company-X-presence" para o frontend.

        // ✅ Auto-sync de labels do WhatsApp → Tags do sistema
        wsocket.ev.on("labels.edit", async (label: any) => {
          if (!wsocket) return;
          try {
            const { importWhatsAppLabels } = await import("../services/TagServices/WhatsAppLabelSyncService");
            logger.info(`[LABEL AUTO-SYNC] Label editada/criada no WhatsApp: ${JSON.stringify(label)}`);
            await importWhatsAppLabels(whatsapp.companyId, id);
          } catch (err) {
            logger.error(`[LABEL AUTO-SYNC] Erro ao sincronizar label: ${err.message}`);
          }
        });

        wsocket.ev.on("labels.association" as any, async (data: any) => {
          if (!wsocket) return;
          try {
            const { syncChatLabelsToSystem } = await import("../services/TagServices/WhatsAppLabelSyncService");
            const { association, type } = data || {};
            if (association?.chatId && association?.labelId) {
              logger.info(`[LABEL AUTO-SYNC] Label ${type}: chat=${association.chatId} label=${association.labelId}`);
              const labelIds = type === "remove" ? [] : [String(association.labelId)];
              await syncChatLabelsToSystem(whatsapp.companyId, id, association.chatId, labelIds);
            }
          } catch (err) {
            logger.error(`[LABEL AUTO-SYNC] Erro ao sincronizar associação: ${err.message}`);
          }
        });

        baileysStore.bind(wsocket.ev);
      })();
    } catch (error) {
      Sentry.captureException(error);
      reject(error);
    }
  });
};

export const initWASocket = async (whatsapp: Whatsapp): Promise<Session> => {
  const existing = initLocks.get(whatsapp.id);
  if (existing) {
    logger.warn(`[WBOT] initWASocket para ${whatsapp.name} (${whatsapp.id}) já em andamento — aguardando lock existente.`);
    return existing;
  }

  const promise = doInitWASocket(whatsapp).finally(() => {
    initLocks.delete(whatsapp.id);
  });

  initLocks.set(whatsapp.id, promise);
  return promise;
};
