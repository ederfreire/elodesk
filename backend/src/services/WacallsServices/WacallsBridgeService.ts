import axios, { AxiosInstance } from "axios";
import jwt from "jsonwebtoken";
import http from "http";
import https from "https";
import { URL } from "url";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import authConfig from "../../config/auth";
import { getIO } from "../../libs/socket";

/**
 * Bridge entre o backend Node do EquipeChat e o microserviço wacalls-voip (Go).
 * O microserviço roda whatsmeow e serve chamadas de voz + mensagens WhatsApp
 * de sessões pareadas por QR. Cada Whatsapp com channel="wacalls" tem um
 * wacallsSessionId correspondente no microserviço.
 */

const baseURL = process.env.WACALLS_URL || "http://127.0.0.1:8090";
const sharedSecret =
  process.env.WACALLS_SHARED_SECRET || authConfig.secret;

let cached: AxiosInstance | null = null;

const getClient = (): AxiosInstance => {
  if (cached) return cached;
  const token = jwt.sign({ svc: "equipechat-backend" }, sharedSecret, {
    expiresIn: "365d"
  });
  cached = axios.create({
    baseURL,
    timeout: 15000,
    headers: { Authorization: `Bearer ${token}` }
  });
  return cached;
};

export const isEnabled = () => !!process.env.WACALLS_URL;

const emitWhatsappSession = (whatsapp: Whatsapp): void => {
  const io = getIO();
  io.of(String(whatsapp.companyId)).emit(
    `company-${whatsapp.companyId}-whatsappSession`,
    { action: "update", session: whatsapp }
  );
};

export const createWacallsSession = async (
  whatsapp: Whatsapp
): Promise<string> => {
  const client = getClient();
  const { data } = await client.post("/sessions", { label: whatsapp.name });
  if (!data?.id) throw new Error("Serviço de sessão não retornou um id.");
  await whatsapp.update({ wacallsSessionId: data.id });
  return data.id;
};

export const listWacallsSessions = async () => {
  const client = getClient();
  const { data } = await client.get("/sessions");
  return data;
};

export const createRawWacallsSession = async (body: any) => {
  const client = getClient();
  const { data } = await client.post("/sessions", body || {});
  return data;
};

export const deleteRawWacallsSession = async (sessionId: string) => {
  const client = getClient();
  await client.delete(`/sessions/${sessionId}`);
};

export const dialWacallsCall = async (body: any) => {
  const client = getClient();
  const { data } = await client.post("/calls/dial", body);
  return data;
};

export const answerWacallsCall = async (callId: string, body: any) => {
  const client = getClient();
  const { data } = await client.post(`/calls/${callId}/answer`, body);
  return data;
};

export const hangupWacallsCall = async (callId: string, body: any) => {
  const client = getClient();
  const { data } = await client.post(`/calls/${callId}/hangup`, body);
  return data;
};

export const deleteWacallsSession = async (
  whatsapp: Whatsapp
): Promise<void> => {
  if (!whatsapp.wacallsSessionId) return;
  const client = getClient();
  try {
    await client.delete(`/sessions/${whatsapp.wacallsSessionId}`);
  } catch (err: any) {
    logger.warn(`[wacalls] delete session ${whatsapp.wacallsSessionId}: ${err?.message}`);
  }
};

export const getQrStreamUrl = (sessionId: string): string => {
  return `${baseURL.replace(/\/$/, "")}/sessions/${sessionId}/qr`;
};

export const getBridgeAuthHeader = (): string => {
  const token = jwt.sign({ svc: "equipechat-backend" }, sharedSecret, {
    expiresIn: "1h"
  });
  return `Bearer ${token}`;
};

export const fetchWacallsQrOnce = async (
  sessionId: string,
  timeoutMs = 15000
): Promise<string | null> => {
  const url = new URL(getQrStreamUrl(sessionId));
  const lib = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    let buffer = "";
    let settled = false;
    let timer: NodeJS.Timeout;
    let req: http.ClientRequest | null = null;

    const done = (err?: Error | null, qr?: string | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { req?.destroy(); } catch {}
      if (err) reject(err);
      else resolve(qr || null);
    };

    timer = setTimeout(() => done(null, null), timeoutMs);

    req = lib.request(
      {
        method: "GET",
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          Authorization: getBridgeAuthHeader(),
          Accept: "text/event-stream"
        }
      },
      (upRes) => {
        if (upRes.statusCode && upRes.statusCode >= 400) {
          done(new Error(`Falha ao obter QR code (status ${upRes.statusCode})`));
          return;
        }

        upRes.setEncoding("utf8");
        upRes.on("data", (chunk: string) => {
          buffer += chunk;
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const lines = raw.split("\n");
            let data = "";
            let currentEvent = "message";
            for (const line of lines) {
              if (line.startsWith("event:")) currentEvent = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }

            if (currentEvent === "qr" && data) {
              done(null, `data:image/png;base64,${data}`);
              return;
            }
            if (currentEvent === "paired") {
              done(null, null);
              return;
            }
            if (currentEvent === "error") {
              done(new Error(data || "Erro ao gerar QR code"));
              return;
            }
          }
        });
        upRes.on("end", () => done(null, null));
      }
    );

    req.on("error", (err) => done(err));
    req.end();
  });
};

interface SendTextArgs {
  whatsapp: Whatsapp;
  toJid: string;
  body: string;
  quotedId?: string;
}

export const sendWacallsText = async ({
  whatsapp,
  toJid,
  body,
  quotedId
}: SendTextArgs) => {
  if (!whatsapp.wacallsSessionId) throw new Error(
    "A conexão WhatsApp Plus - Voz + Msg não está pareada. Abra Conexões e leia o QR Code novamente."
  );
  const client = getClient();
  const { data } = await client.post("/messages/text", {
    sessionId: whatsapp.wacallsSessionId,
    toJid,
    body,
    quotedId
  });
  return data;
};

interface SendMediaArgs {
  whatsapp: Whatsapp;
  toJid: string;
  url?: string;
  filePath?: string;
  mimetype: string;
  filename?: string;
  caption?: string;
  isPtt?: boolean;
  seconds?: number;
  width?: number;
  height?: number;
}

export const sendWacallsMedia = async ({
  whatsapp,
  toJid,
  url,
  filePath,
  mimetype,
  filename,
  caption,
  isPtt,
  seconds,
  width,
  height
}: SendMediaArgs) => {
  if (!whatsapp.wacallsSessionId) throw new Error(
    "A conexão WhatsApp Plus - Voz + Msg não está pareada. Abra Conexões e leia o QR Code novamente."
  );
  if (!url && !filePath) throw new Error("url ou filePath obrigatório");
  const client = getClient();
  const path = isPtt ? "/messages/audio" : "/messages/media";
  const { data } = await client.post(path, {
    sessionId: whatsapp.wacallsSessionId,
    toJid,
    url,
    filePath,
    mimetype,
    filename,
    caption,
    // Igual ao Baileys: duração explícita para áudio e vídeo.
    seconds: Number.isFinite(Number(seconds)) && Number(seconds) > 0
      ? Math.max(1, Math.ceil(Number(seconds)))
      : undefined,
    width: Number(width) > 0 ? Math.round(Number(width)) : undefined,
    height: Number(height) > 0 ? Math.round(Number(height)) : undefined
  });
  return data;
};

interface EditArgs {
  whatsapp: Whatsapp;
  toJid: string;
  messageId: string;
  body: string;
}

export const editWacallsMessage = async ({ whatsapp, toJid, messageId, body }: EditArgs) => {
  if (!whatsapp.wacallsSessionId) throw new Error(
    "A conexão WhatsApp Plus - Voz + Msg não está pareada. Abra Conexões e leia o QR Code novamente."
  );
  const client = getClient();
  const { data } = await client.patch(`/messages/${messageId}`, {
    sessionId: whatsapp.wacallsSessionId,
    toJid,
    body
  });
  return data;
};

interface DeleteMsgArgs {
  whatsapp: Whatsapp;
  toJid: string;
  messageId: string;
}

export const deleteWacallsMessage = async ({ whatsapp, toJid, messageId }: DeleteMsgArgs) => {
  if (!whatsapp.wacallsSessionId) throw new Error(
    "A conexão WhatsApp Plus - Voz + Msg não está pareada. Abra Conexões e leia o QR Code novamente."
  );
  const client = getClient();
  const { data } = await client.delete(`/messages/${messageId}`, {
    params: { sessionId: whatsapp.wacallsSessionId, toJid }
  });
  return data;
};

export const getWacallsProfilePicture = async (
  whatsapp: Whatsapp,
  jid: string
): Promise<string | null> => {
  if (!whatsapp.wacallsSessionId) return null;
  try {
    const client = getClient();
    const { data } = await client.get(
      `/sessions/${whatsapp.wacallsSessionId}/profile-picture`,
      { params: { jid } }
    );
    return data?.url || null;
  } catch (err: any) {
    logger.debug(`[wacalls] getProfilePicture ${jid}: ${err?.message}`);
    return null;
  }
};

/**
 * Monta o JID WhatsApp de um contato (para envio).
 */
export const buildJid = (number: string, isGroup: boolean): string => {
  const clean = String(number || "").split("@")[0];
  return `${clean}@${isGroup ? "g.us" : "s.whatsapp.net"}`;
};


// Rastreia SSE ativos por whatsappId para não abrir duplicado.
const activeQrStreams = new Map<number, http.ClientRequest>();

/**
 * Abre uma assinatura SSE no microserviço para o QR de uma sessão wacalls e
 * atualiza `whatsapp.qrcode` (data URI PNG) + emite socket a cada novo code.
 * Fecha automaticamente quando o microserviço envia `paired` ou `error`.
 */
export const subscribeSessionQR = (whatsapp: Whatsapp): void => {
  if (!whatsapp.wacallsSessionId) return;
  if (activeQrStreams.has(whatsapp.id)) {
    try { activeQrStreams.get(whatsapp.id)?.destroy(); } catch {}
    activeQrStreams.delete(whatsapp.id);
  }

  const url = new URL(getQrStreamUrl(whatsapp.wacallsSessionId));
  const lib = url.protocol === "https:" ? https : http;
  let receivedQr = false;
  const qrTimeout = setTimeout(async () => {
    if (receivedQr) return;
    try {
      logger.warn(`[wacalls qr] timeout aguardando QR wid=${whatsapp.id}`);
      await whatsapp.update({ qrcode: "", status: "TIMEOUT" });
      emitWhatsappSession(whatsapp);
    } catch (err: any) {
      logger.error(`[wacalls qr] timeout update wid=${whatsapp.id}: ${err?.message}`);
    }
    try { req.destroy(); } catch {}
    activeQrStreams.delete(whatsapp.id);
  }, 60000);

  const cleanup = () => {
    clearTimeout(qrTimeout);
    activeQrStreams.delete(whatsapp.id);
  };

  const req = lib.request(
    {
      method: "GET",
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        Authorization: getBridgeAuthHeader(),
        Accept: "text/event-stream"
      }
    },
    (upRes) => {
      if (upRes.statusCode && upRes.statusCode >= 400) {
        logger.warn(`[wacalls qr] upstream status ${upRes.statusCode} wid=${whatsapp.id}`);
        whatsapp.update({ qrcode: "", status: "DISCONNECTED" })
          .then(() => emitWhatsappSession(whatsapp))
          .catch((err: any) => logger.error(`[wacalls qr] upstream update wid=${whatsapp.id}: ${err?.message}`));
        try { req.destroy(); } catch {}
        cleanup();
        return;
      }
      let buffer = "";
      upRes.setEncoding("utf8");
      upRes.on("data", async (chunk: string) => {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = raw.split("\n");
          let data = "";
          let currentEvent = "message";
          for (const l of lines) {
            if (l.startsWith("event:")) currentEvent = l.slice(6).trim();
            else if (l.startsWith("data:")) data += l.slice(5).trim();
          }
          try {
            if (currentEvent === "qr" && data) {
              receivedQr = true;
              const dataUri = `data:image/png;base64,${data}`;
              await whatsapp.update({ qrcode: dataUri, status: "qrcode" });
              emitWhatsappSession(whatsapp);
            } else if (currentEvent === "paired") {
              await whatsapp.update({ qrcode: "", status: "CONNECTED" });
              emitWhatsappSession(whatsapp);
              try { req.destroy(); } catch {}
              cleanup();
            } else if (currentEvent === "error") {
              logger.warn(`[wacalls qr] error wid=${whatsapp.id}: ${data}`);
              await whatsapp.update({ qrcode: "", status: "DISCONNECTED" });
              emitWhatsappSession(whatsapp);
            }
          } catch (err: any) {
            logger.error(`[wacalls qr] processando ${currentEvent}: ${err?.message}`);
          }
        }
      });
      upRes.on("end", () => { cleanup(); });
    }
  );
  req.on("error", (err) => {
    logger.warn(`[wacalls qr] req error wid=${whatsapp.id}: ${err.message}`);
    whatsapp.update({ qrcode: "", status: "DISCONNECTED" })
      .then(() => emitWhatsappSession(whatsapp))
      .catch((updateErr: any) => logger.error(`[wacalls qr] req update wid=${whatsapp.id}: ${updateErr?.message}`));
    cleanup();
  });
  req.end();
  activeQrStreams.set(whatsapp.id, req);
};


