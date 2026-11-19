import { Request, Response } from "express";
import Whatsapp from "../models/Whatsapp";
import Contact from "../models/Contact";
import { getIO } from "../libs/socket";
import logger from "../utils/logger";
import {
  createRawWacallsSession,
  deleteRawWacallsSession,
  fetchWacallsQrOnce,
  getBridgeAuthHeader,
  getQrStreamUrl
} from "../services/WacallsServices/WacallsBridgeService";
import HandleWacallsIncoming, { HandleWacallsAck } from "../services/WacallsServices/HandleWacallsIncoming";
import HandleWacallsCall, { WacallsCallAction } from "../services/WacallsServices/HandleWacallsCall";
import {
  dialChatCall,
  acceptChatCall,
  rejectChatCall,
  hangupChatCall,
  getCallOwner,
  exchangeChatCallSdp,
  createChatSession,
  fetchChatSessionQrOnce,
  importChatHistory,
  isEnabled as wacallsChatEnabled,
  getSipSettings,
  setSipSettings,
  getSipStatus,
  dialSipCall,
  acceptSipCall,
  rejectSipCall,
  hangupSipCall,
  exchangeSipCallSdp
} from "../services/WacallsServices/WacallsChatCallService";
import http from "http";
import https from "https";
import { URL } from "url";

const firstFilled = (...values: any[]) =>
  values.find(value => value !== undefined && value !== null && String(value).trim() !== "");

const toBool = (value: any): boolean =>
  value === true || value === "true" || value === 1 || value === "1";

const jidNumber = (jid?: string): string | undefined => {
  const value = String(jid || "").trim();
  if (!value) return undefined;
  return value.split("@")[0].split(":")[0];
};

// Traduz erros técnicos do axios (ex: "timeout of 25000ms exceeded",
// "ECONNREFUSED", "socket hang up") pra uma mensagem que faz sentido pro
// agente, em vez de vazar o texto cru da lib pro alert()/toast do front.
// dialProxy recebia `toJid`/`phone` e cortava tudo depois do "@" antes de
// mandar pro wacalls-chat — jogava fora se era @lid ou @s.whatsapp.net e
// sobrava só os dígitos. O Go entende JID completo (ver parseDialJID em
// httpapi.go), então perder o domínio faz ele assumir @s.whatsapp.net por
// padrão; se o contato só existe como LID (sem telefone real exposto pelo
// WhatsApp), isso tenta discar pra uma "PN" que não existe — a chamada fica
// pendurada até estourar o timeout e nunca completa. Mantém o domínio
// quando já veio (ex: contact.remoteJid) e ainda corrige o caso de LID mal
// rotulado como @s.whatsapp.net (>13 dígitos quase sempre é LID, não
// telefone — telefone real E.164 tem no máximo 13).
const resolveDialTarget = (raw: string): string => {
  const value = String(raw || "").trim();
  if (!value) return value;
  if (!value.includes("@")) return value;
  const [userPart, domain] = value.split("@");
  if (domain === "s.whatsapp.net" && /^\d+$/.test(userPart) && userPart.length > 13) {
    return `${userPart}@lid`;
  }
  return value;
};

// Mensagem genérica de "servidor de chamadas/mensagens indisponível" — nunca
// deve carregar o nome interno do microserviço (wacalls-chat/wacalls-voip),
// só o rótulo público "WhatsApp Plus - Voz + Msg" que o resto da UI usa.
const SERVICE_UNCONFIGURED_MSG =
  "O WhatsApp Plus - Voz + Msg ainda não está configurado neste servidor. Fale com o administrador do sistema.";
const SERVICE_UNREACHABLE_MSG =
  "Não foi possível falar com o serviço de chamadas. Tente novamente em instantes.";

// Última linha de defesa: se por algum motivo uma mensagem de erro bruta de
// alguma camada mais interna (ex: "wacalls-chat respondeu 404" — era
// literalmente isso que aparecia no discador, ver captura reportada) escapar
// até aqui, tira qualquer menção ao nome interno antes de mostrar pro
// usuário. O nome público do canal é sempre "WhatsApp Plus - Voz + Msg".
const stripInternalServiceName = (s: string): string =>
  s.replace(/wacalls-chat|wacalls-voip|wacalls/gi, "serviço de chamadas").trim();

const friendlyCallError = (err: any): string => {
  const code = err?.code || "";
  const msg = String(err?.message || "");
  if (code === "ECONNABORTED" || /timeout of \d+ms exceeded/i.test(msg)) {
    return "O WhatsApp não respondeu a tempo. Confira se o número é válido e tente ligar novamente.";
  }
  if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    /socket hang up/i.test(msg) ||
    /respondeu 404/i.test(msg)
  ) {
    return SERVICE_UNREACHABLE_MSG;
  }
  return (msg && stripInternalServiceName(msg)) || "Falha ao processar a chamada.";
};

/**
 * Recebe eventos do microserviço wacalls-voip.
 * Auth: header X-WaCalls-Secret precisa bater com WACALLS_SHARED_SECRET.
 *
 * Eventos suportados:
 *   - session.status: { sessionId, status: "CONNECTED"|"qrcode"|"DISCONNECTED", jid?, qrcode? }
 *   - message.incoming: { sessionId, from, type, text?, mediaUrl?, mimetype?, id, timestamp }
 *   - message.ack: { sessionId, id, ack }
 *   - call.* : já tratado pelo softphone via WS, ignorado aqui.
 */
export const webhook = async (req: Request, res: Response) => {
  const shared = process.env.WACALLS_SHARED_SECRET || process.env.JWT_SECRET || "";
  const secret = req.header("X-WaCalls-Secret") || "";
  if (shared && secret !== shared) {
    return res.status(401).json({ error: "invalid secret" });
  }

  // O microserviço Go envia { event, sessionId, from, at, extra: {...} }.
  // Achatamos `extra` no topo para que os handlers antigos (que leem ev.id,
  // ev.type, ev.text, etc.) continuem funcionando sem alteração.
  const raw = req.body || {};
  const extra = raw.extra || {};
  const ev: any = { ...extra, ...raw, extra };
  const sessionId: string | undefined = firstFilled(ev.sessionId, ev.SessionID, extra.sessionId, extra.SessionID);
  if (!sessionId) return res.status(400).json({ error: "missing sessionId" });

  const whatsapp = await Whatsapp.findOne({ where: { wacallsSessionId: sessionId } });
  if (!whatsapp) {
    logger.warn(`[wacalls webhook] sessão ${sessionId} não vinculada — removendo do microserviço`);
    // Auto-cleanup: apaga órfã no microserviço para não gerar mais webhooks.
    try {
      await deleteRawWacallsSession(sessionId);
    } catch (err: any) {
      logger.warn(`[wacalls webhook] falha ao remover órfã ${sessionId}: ${err?.message}`);
    }
    return res.status(202).json({ ok: true, unlinked: true, deleted: true });
  }


  const type = firstFilled(ev.event, ev.Type, ev.type, ev.TypeName);

  try {
    switch (type) {
      case "session.status": {
        const rawStatus = firstFilled(
          ev.status,
          ev.Status,
          extra.status,
          extra.Status,
          toBool(firstFilled(ev.connected, extra.connected, ev.loggedIn, extra.loggedIn)) ? "CONNECTED" : undefined
        );
        const normalizedStatus = String(rawStatus || "").toLowerCase();
        const isConnected = normalizedStatus === "connected" || normalizedStatus === "open";
        const isQrStatus = normalizedStatus === "qrcode" || normalizedStatus === "qr" || normalizedStatus === "pairing";
        const patch: any = { status: isConnected ? "CONNECTED" : rawStatus };

        if (isConnected) {
          patch.qrcode = null;
        } else if (ev.qrcode !== undefined) {
          patch.qrcode = ev.qrcode;
          if (isQrStatus) patch.status = "qrcode";
        }

        const connectedJid = firstFilled(ev.jid, ev.JID, ev.from, ev.PeerJID, extra.jid, extra.JID);
        if (connectedJid) patch.number = jidNumber(connectedJid);
        await whatsapp.update(patch);
        const io = getIO();
        io.of(String(whatsapp.companyId))
          .emit(`company-${whatsapp.companyId}-whatsappSession`, {
            action: "update",
            session: whatsapp
          });
        break;
      }
      case "session.connected":
      case "session.paired": {
        const connectedJid = firstFilled(ev.jid, ev.JID, ev.from, ev.PeerJID, extra.jid, extra.JID);
        const patch: any = { status: "CONNECTED", qrcode: null };
        const number = jidNumber(connectedJid);
        if (number) patch.number = number;

        await whatsapp.update(patch);
        const io = getIO();
        io.of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-whatsappSession`, {
          action: "update",
          session: whatsapp
        });
        break;
      }
      case "session.disconnected":
      case "session.logged_out": {
        await whatsapp.update({ status: "DISCONNECTED", qrcode: null });
        const io = getIO();
        io.of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-whatsappSession`, {
          action: "update",
          session: whatsapp
        });
        break;
      }
      case "message.incoming": {
        // Whatsmeow entrega TODAS as mensagens (inclusive as enviadas pelo
        // celular pareado, com fromMe=true). Espelhamos o histórico como o
        // Baileys já faz — o handler abaixo decide contactId e read com base
        // no fromMe.
        await HandleWacallsIncoming(whatsapp, {
          sessionId,
          from: firstFilled(ev.from, ev.sender, ev.PeerJID, extra.from, extra.sender),
          id: firstFilled(ev.id, ev.messageId, ev.MessageID, extra.id, extra.messageId),
          type: firstFilled(ev.type, ev.messageType, extra.type, extra.messageType, "text"),
          text: firstFilled(ev.text, ev.body, ev.message, extra.text, extra.body),
          caption: firstFilled(ev.caption, extra.caption),
          mediaUrl: firstFilled(ev.mediaUrl, ev.mediaURL, extra.mediaUrl, extra.mediaURL),
          mimetype: firstFilled(ev.mimetype, ev.mimeType, extra.mimetype, extra.mimeType),
          filename: firstFilled(ev.filename, ev.fileName, extra.filename, extra.fileName),
          timestamp: firstFilled(ev.timestamp, ev.at, extra.timestamp, raw.at),
          pushName: firstFilled(ev.pushName, ev.name, extra.pushName, extra.name),
          isGroup: toBool(firstFilled(ev.isGroup, extra.isGroup)),
          groupJid: firstFilled(ev.groupJid, ev.group, extra.groupJid, extra.group),
          fromMe: toBool(firstFilled(ev.fromMe, ev.isFromMe, extra.fromMe, extra.isFromMe)),
          chat: firstFilled(ev.chat, ev.remoteJid, extra.chat, extra.remoteJid)
        });
        break;
      }
      case "message.ack":
      case "message.status": {
        const ackVal = Number(firstFilled(ev.ack, ev.status, extra.ack, extra.status, 0)) || 0;
        await HandleWacallsAck(String(firstFilled(ev.id, ev.messageId, extra.id, extra.messageId)), ackVal, whatsapp.companyId);
        break;
      }
      case "message.edited": {
        const wid = String(firstFilled(ev.id, extra.id, ev.messageId));
        const bodyNew = String(firstFilled(ev.body, extra.body, ""));
        if (wid) {
          const { default: Message } = await import("../models/Message");
          const msg = await Message.findOne({ where: { wid, companyId: whatsapp.companyId } });
          if (msg) {
            await msg.update({ body: bodyNew, isEdited: true } as any);
            getIO().of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-appMessage`, { action: "update", message: msg });
          }
        }
        break;
      }
      case "message.revoked": {
        const wid = String(firstFilled(ev.id, extra.id, ev.messageId));
        if (wid) {
          const { default: Message } = await import("../models/Message");
          const msg = await Message.findOne({ where: { wid, companyId: whatsapp.companyId } });
          if (msg) {
            await msg.update({ isDeleted: true } as any);
            getIO().of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-appMessage`, { action: "update", message: msg });
          }
        }
        break;
      }
      case "call.incoming":
      case "call.outgoing":
      case "call.answered":
      case "call.ended": {
        await HandleWacallsCall(whatsapp, {
          action: type as WacallsCallAction,
          sessionId,
          callId: String(ev.callId || ev.CallID || ""),
          from: ev.from,
          chatJid: ev.extra?.chat || ev.chat,
          reason: ev.extra?.reason || ev.reason,
          pushName: ev.pushName,
          timestamp: ev.timestamp
        });
        // Re-emite para o canal wacalls que o front escuta (WaCallsContext).
        getIO().of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-wacalls`, {
          event: type,
          callId: String(ev.callId || ev.CallID || ""),
          sessionId,
          from: ev.from,
          pushName: ev.pushName
        });
        break;
      }

      default:
        logger.debug(`[wacalls webhook] ignorando evento ${type}`);
    }

  } catch (err: any) {
    logger.error(
      `[wacalls webhook] erro processando ${type}: ${err?.message} sessionId=${sessionId} id=${firstFilled(ev.id, extra.id)} from=${firstFilled(ev.from, extra.from)} chat=${firstFilled(ev.chat, extra.chat)} channel=${whatsapp.channel}`
    );
  }

  return res.status(200).json({ ok: true });
};

/**
 * Proxy SSE do microserviço para o frontend. Assim o navegador não precisa
 * conhecer a URL/token do wacalls-voip: fala tudo com o backend Node.
 */
export const qrStream = async (req: Request, res: Response) => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
  if (!whatsapp) return res.status(404).json({ error: "not found" });
  if (!whatsapp.wacallsSessionId) {
    return res.status(400).json({ error: "session not paired" });
  }

  const url = new URL(getQrStreamUrl(whatsapp.wacallsSessionId));
  const lib = url.protocol === "https:" ? https : http;

  const upstream = lib.request(
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
      res.writeHead(upRes.statusCode || 200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      upRes.pipe(res);
    }
  );

  upstream.on("error", (err) => {
    logger.warn(`[wacalls qrStream] upstream error: ${err.message}`);
    if (!res.headersSent) res.status(502).json({ error: err.message });
    else res.end();
  });

  req.on("close", () => {
    try { upstream.destroy(); } catch {}
  });

  upstream.end();
};

export const qrLatest = async (req: Request, res: Response) => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
  if (!whatsapp) return res.status(404).json({ error: "not found" });

  if (whatsapp.qrcode) {
    return res.status(200).json({ qrcode: whatsapp.qrcode, status: whatsapp.status });
  }

  // wacalls-chat é o backend atual do canal wacalls (mensagem+chamada num
  // QR só). O loop persistente (startWacallsChatEventLoop) já escreve o QR
  // direto em whatsapp.qrcode assim que chega — então aqui é só responder
  // "pending" e deixar o front tentar de novo em 3s. Antes essa rota abria
  // uma conexão SSE nova de até 12s a CADA polling (fetchChatSessionQrOnce),
  // e se a rotação do QR do WhatsApp não batesse com essa janela, o ciclo
  // de espera empilhava e o QR demorava mais de um minuto pra aparecer.
  // Ler só o valor já salvo é praticamente instantâneo.
  if (whatsapp.wacallsChatSessionId) {
    return res.status(202).json({ pending: true, status: whatsapp.status });
  }

  if (!whatsapp.wacallsSessionId) {
    return res.status(400).json({ error: "session not paired" });
  }

  try {
    const qrcode = await fetchWacallsQrOnce(whatsapp.wacallsSessionId);
    if (!qrcode) {
      return res.status(202).json({ pending: true, status: whatsapp.status });
    }

    await whatsapp.update({ qrcode, status: "qrcode" });
    const io = getIO();
    io.of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-whatsappSession`, {
      action: "update",
      session: whatsapp
    });

    return res.status(200).json({ qrcode, status: "qrcode" });
  } catch (err: any) {
    logger.warn(`[wacalls qrLatest] ${err?.message}`);
    return res.status(202).json({ pending: true, error: err?.message || "qr unavailable" });
  }
};

export const sessionsProxy = async (req: Request, res: Response) => {
  try {
    // O discador é sobre CHAMADA — quem sinaliza chamada de verdade é o
    // wacalls-chat (wacallsChatSessionId), não o wacalls-voip (que só manda
    // mensagem). Só listamos conexões da empresa do usuário logado, e só as
    // que estão de fato pareadas/conectadas nesse backend.
    const { companyId } = req.user;
    const whatsapps = await Whatsapp.findAll({
      where: { companyId, channel: "wacalls" },
      attributes: ["id", "name", "wacallsChatSessionId", "status", "number"]
    });

    const items = whatsapps
      .filter(w => !!w.wacallsChatSessionId && w.status === "CONNECTED")
      .map(w => ({ id: w.wacallsChatSessionId, label: w.name, whatsappId: w.id, number: w.number }));

    return res.status(200).json(items);
  } catch (err: any) {
    logger.warn(`[wacalls sessionsProxy] ${err?.message}`);
    return res.status(502).json({ error: SERVICE_UNREACHABLE_MSG });
  }
};

export const createSessionProxy = async (req: Request, res: Response) => {
  try {
    const data = await createRawWacallsSession(req.body || {});
    return res.status(201).json(data);
  } catch (err: any) {
    logger.warn(`[wacalls createSessionProxy] ${err?.message}`);
    return res.status(502).json({ error: SERVICE_UNREACHABLE_MSG });
  }
};

export const deleteSessionProxy = async (req: Request, res: Response) => {
  try {
    await deleteRawWacallsSession(String(req.params.sessionId));
    return res.status(204).send();
  } catch (err: any) {
    logger.warn(`[wacalls deleteSessionProxy] ${err?.message}`);
    return res.status(502).json({ error: SERVICE_UNREACHABLE_MSG });
  }
};

export const dialProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const { sessionId, toJid, phone, video } = req.body || {};
    const dialTo = resolveDialTarget(String(phone || toJid || ""));
    const data = await dialChatCall(String(sessionId), dialTo, !!video, String(req.user.id));
    return res.status(200).json(data);
  } catch (err: any) {
    logger.warn(`[wacalls dialProxy] ${err?.message}`);
    return res.status(502).json({ error: friendlyCallError(err) });
  }
};

export const answerProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const sessionId = String(req.body?.sessionId || "");
    const callId = String(req.params.callId);
    const data = await acceptChatCall(sessionId, callId, String(req.user.id));

    // A ligação entrante toca para a empresa inteira. Sem este aviso ela
    // seguia tocando na tela de todo mundo depois que alguém atendia.
    try {
      const companyId = (req.user as any)?.companyId;
      if (companyId) {
        getIO().of(String(companyId)).emit(`company-${companyId}-wacalls`, {
          event: "call.taken",
          callId,
          sessionId,
          userId: Number(req.user.id) || null
        });
      }
    } catch (e: any) {
      logger.warn(`[wacalls answerProxy] falha ao avisar que a ligação foi atendida: ${e?.message}`);
    }

    return res.status(200).json(data);
  } catch (err: any) {
    logger.warn(`[wacalls answerProxy] ${err?.message}`);
    return res.status(502).json({ error: friendlyCallError(err) });
  }
};

export const hangupProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const sessionId = String(req.body?.sessionId || "");
    // Identifica QUEM está encerrando — o wacalls-chat usa isso pra impedir
    // que um operador derrube a chamada que outro está atendendo.
    const clientId = String((req.user as any)?.id || "");

    // Trava também aqui, antes de repassar adiante: a chamada de uma pessoa
    // NÃO pode ser encerrada por outra. Isso acontecia quando o card de
    // "chamada recebida" continuava na tela de quem não atendeu — um clique
    // em recusar/desligar ali valia pro mesmo callId e derrubava a ligação
    // em andamento de quem tinha atendido. A mesma verificação existe no
    // wacalls-chat, mas ela depende do binário Go ter sido recompilado;
    // esta aqui vale sempre, porque todo desligamento passa por este ponto.
    const callId = String(req.params.callId);
    const owner = getCallOwner(callId);
    if (owner && clientId && owner !== clientId) {
      logger.info(
        `[wacalls hangupProxy] bloqueado: usuário ${clientId} tentou encerrar a chamada ${callId}, que pertence a ${owner}`
      );
      return res.status(409).json({
        error: "Esta chamada está sendo atendida por outro operador."
      });
    }
    // Recusa (ainda tocando) usa reject; encerra (já atendida) usa hangup.
    // O front decide qual mandar; se vier "reject" explícito, respeitamos.
    const data = req.body?.reject
      ? await rejectChatCall(sessionId, String(req.params.callId), clientId)
      : await hangupChatCall(sessionId, String(req.params.callId), clientId);
    return res.status(200).json(data);
  } catch (err: any) {
    logger.warn(`[wacalls hangupProxy] ${err?.message}`);
    return res.status(502).json({ error: friendlyCallError(err) });
  }
};

/**
 * Recebe a oferta SDP do navegador (getUserMedia + RTCPeerConnection) e
 * devolve a resposta SDP do wacalls-chat — é isso que faz o áudio da
 * chamada fluir de verdade entre o navegador e o WhatsApp.
 */
export const webrtcProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const { sessionId, sdpOffer } = req.body || {};
    const sdpAnswer = await exchangeChatCallSdp(String(sessionId), String(req.params.callId), String(sdpOffer));
    return res.status(200).json({ sdpAnswer });
  } catch (err: any) {
    logger.warn(`[wacalls webrtcProxy] ${err?.message}`);
    return res.status(502).json({ error: friendlyCallError(err) });
  }
};

/**
 * Botão "Importar mensagens anteriores" na tela de conexão — pede ao
 * wacalls-chat pra reimportar histórico via history sync do whatsmeow (ver
 * WacallsChatCallService.importChatHistory e
 * wacalls-chat/cmd/server/historyimport.go). Só existe pra conexão já
 * pareada (precisa de wacallsChatSessionId); responde antes das mensagens
 * chegarem de verdade — elas vão surgindo aos poucos pelo socket normal de
 * mensagem, igual uma mensagem nova.
 */
export const importHistoryProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
  if (!whatsapp) return res.status(404).json({ error: "Conexão não encontrada." });
  if (!whatsapp.wacallsChatSessionId) {
    return res.status(400).json({ error: "Conexão ainda não pareada — pareie o WhatsApp Plus antes de importar mensagens." });
  }
  try {
    // startDate/endDate/ticketStatus/queueId opcionais, vem do prompt de
    // período do frontend (Connections/index.js) — repassados como estão
    // pro wacalls-chat.
    const { startDate, endDate, ticketStatus, queueId } = req.body || {};
    await importChatHistory(whatsapp.wacallsChatSessionId, startDate, endDate, ticketStatus, queueId);
    return res.status(202).json({ message: "Importação de mensagens iniciada — as conversas antigas vão aparecer aos poucos." });
  } catch (err: any) {
    // Loga a mensagem CRUA (antes de friendlyCallError filtrar/trocar por
    // texto genérico) — é o que realmente ajuda a diagnosticar quando esse
    // recurso falha, já que historyimport.go (wacalls-chat) é código nunca
    // testado contra uma sessão WhatsApp real (ver aviso no próprio arquivo).
    logger.warn(`[wacalls-chat] importHistoryProxy erro: ${err?.message}`);
    // upstreamStatus 4xx = o wacalls-chat respondeu com um erro de negócio
    // de verdade (ex.: "sessão sem conversas conhecidas ainda", "sessão não
    // pareada") — repassa esse status em vez de mascarar tudo como 502
    // "serviço indisponível", que sugeria (errado) um problema de
    // infraestrutura toda vez que na real era só uma resposta 400 do Go.
    const status = err?.upstreamStatus && err.upstreamStatus < 500 ? err.upstreamStatus : 502;
    return res.status(status).json({ error: friendlyCallError(err) });
  }
};

/**
 * Cria (se ainda não existir) e inicia o pareamento da sessão de CHAMADA no
 * wacalls-chat pra essa conexão. É um "aparelho" a mais pareado no mesmo
 * número — a mensagem continua indo pelo wacalls-voip, sem mudar nada aí.
 */
export const startChatSession = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
  if (!whatsapp) return res.status(404).json({ error: "Conexão não encontrada." });
  try {
    if (!whatsapp.wacallsChatSessionId) {
      await createChatSession(whatsapp);
    }
    return res.status(200).json({ message: "Sessão de chamada criada, aguardando pareamento." });
  } catch (err: any) {
    logger.error(`[wacalls-chat] startChatSession erro: ${err?.message}`);
    return res.status(502).json({ error: SERVICE_UNREACHABLE_MSG });
  }
};

/** QR pra parear a sessão de chamada (segundo aparelho no mesmo número). */
export const chatSessionQr = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
  if (!whatsapp) return res.status(404).json({ error: "Conexão não encontrada." });
  if (!whatsapp.wacallsChatSessionId) {
    return res.status(400).json({ error: "Sessão de chamada ainda não criada — chame /start primeiro." });
  }
  try {
    const qrcode = await fetchChatSessionQrOnce(whatsapp.wacallsChatSessionId);
    if (!qrcode) return res.status(202).json({ pending: true, message: "sem QR no momento (talvez já pareado)" });
    return res.status(200).json({ qrcode });
  } catch (err: any) {
    logger.warn(`[wacalls-chat] chatSessionQr erro: ${err?.message}`);
    return res.status(502).json({ error: SERVICE_UNREACHABLE_MSG });
  }
};

/**
 * Troncal SIP (baresip) — proxies pro wacalls-chat, ver
 * wacalls-chat/cmd/server/sipapi.go. Cada empresa tem sua PRÓPRIA troncal
 * isolada lá do lado do wacalls-chat (processo baresip, ctrl_tcp e áudio
 * próprios — ver sipregistry.go); aqui só repassamos req.user.companyId em
 * toda chamada pra garantir que uma empresa nunca opere/veja a troncal de
 * outra (era exatamente esse o vazamento antes: nada aqui distinguia
 * empresas, então tudo ia pra uma troncal só, compartilhada por acidente).
 */
export const sipSettingsGet = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const { companyId } = req.user;
    const data = await getSipSettings(companyId);
    return res.status(200).json(data);
  } catch (err: any) {
    logger.warn(`[wacalls sipSettingsGet] ${err?.message}`);
    return res.status(502).json({ error: SERVICE_UNREACHABLE_MSG });
  }
};

export const sipSettingsSet = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const { companyId } = req.user;
    const data = await setSipSettings(companyId, req.body || {});
    return res.status(200).json(data);
  } catch (err: any) {
    logger.warn(`[wacalls sipSettingsSet] ${err?.message}`);
    return res.status(502).json({ error: SERVICE_UNREACHABLE_MSG });
  }
};

export const sipStatusProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(200).json({ baresipConnected: false, trunkEnabled: false, current: null });
  }
  try {
    const { companyId } = req.user;
    const data = await getSipStatus(companyId);
    return res.status(200).json(data);
  } catch (err: any) {
    return res.status(200).json({ baresipConnected: false, trunkEnabled: false, current: null });
  }
};

export const sipDialProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const { companyId } = req.user;
    const { number, phone } = req.body || {};
    const data = await dialSipCall(companyId, String(number || phone || ""));
    return res.status(200).json(data);
  } catch (err: any) {
    logger.warn(`[wacalls sipDialProxy] ${err?.message}`);
    return res.status(502).json({ error: friendlyCallError(err) });
  }
};

export const sipAnswerProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const { companyId } = req.user;
    const data = await acceptSipCall(companyId, String(req.params.callId));
    return res.status(200).json(data);
  } catch (err: any) {
    logger.warn(`[wacalls sipAnswerProxy] ${err?.message}`);
    return res.status(502).json({ error: friendlyCallError(err) });
  }
};

export const sipHangupProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const { companyId } = req.user;
    const data = req.body?.reject
      ? await rejectSipCall(companyId, String(req.params.callId))
      : await hangupSipCall(companyId, String(req.params.callId));
    return res.status(200).json(data);
  } catch (err: any) {
    logger.warn(`[wacalls sipHangupProxy] ${err?.message}`);
    return res.status(502).json({ error: friendlyCallError(err) });
  }
};

export const sipWebrtcProxy = async (req: Request, res: Response) => {
  if (!wacallsChatEnabled()) {
    return res.status(503).json({ error: SERVICE_UNCONFIGURED_MSG });
  }
  try {
    const { companyId } = req.user;
    const { sdpOffer } = req.body || {};
    const sdpAnswer = await exchangeSipCallSdp(companyId, String(req.params.callId), String(sdpOffer));
    return res.status(200).json({ sdpAnswer });
  } catch (err: any) {
    logger.warn(`[wacalls sipWebrtcProxy] ${err?.message}`);
    return res.status(502).json({ error: friendlyCallError(err) });
  }
};

export default {
  webhook,
  qrStream,
  qrLatest,
  sessionsProxy,
  createSessionProxy,
  deleteSessionProxy,
  dialProxy,
  answerProxy,
  hangupProxy,
  webrtcProxy,
  startChatSession,
  chatSessionQr,
  importHistoryProxy,
  sipSettingsGet,
  sipSettingsSet,
  sipStatusProxy,
  sipDialProxy,
  sipAnswerProxy,
  sipHangupProxy,
  sipWebrtcProxy
};

export const callHistory = async (req: any, res: any) => {
  try {
    const { companyId } = req.user;
    const CallHistory = require("../models/CallHistory").default;
    const items = await CallHistory.findAll({
      where: { company_id: companyId },
      order: [["createdAt", "DESC"]],
      limit: 50,
      // Inclui o contato pra recentes/discador conseguir religar direto pelo
      // remoteJid certo (com @lid quando for o caso) em vez de só os dígitos
      // crus salvos em phone_to — e pra mostrar nome/foto reais na tela em
      // vez do JID puro.
      include: [
        {
          model: Contact,
          as: "contact",
          attributes: ["id", "name", "number", "remoteJid", "urlPicture"],
          required: false
        }
      ]
    });
    return res.json(items);
  } catch (err: any) {
    return res.status(200).json([]);
  }
};

/**
 * Lista os fluxos do wacalls-chat para a tela de Conexões escolher a URA.
 *
 * Devolve só os de VOZ: fluxo de chat vinculado como URA é rejeitado pelo
 * próprio microserviço (ele move pra chatFlowId e deixa a ligação sem URA),
 * então oferecer na lista só geraria confusão.
 */
export const voiceFlows = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { listarFluxos } = await import(
      "../services/WacallsServices/WacallsVoiceFlowService"
    );
    const todos = await listarFluxos();
    // Só as URAs desta empresa (UrasDaEmpresa).
    const companyId = Number((req as any).user?.companyId);
    const { idsDaEmpresa, reivindicarAntigas } = await import(
      "../services/WacallsServices/UrasDaEmpresa"
    );
    await reivindicarAntigas(companyId, todos.map(f => f.id));
    const minhas = await idsDaEmpresa(companyId);
    return res.json(todos.filter(f => f.tipo === "voice" && minhas.has(String(f.id))));
  } catch (err: any) {
    logger.warn(`[URA] falha ao listar fluxos de voz: ${err?.message}`);
    // Lista vazia em vez de erro: a tela de Conexões precisa abrir mesmo
    // com o microserviço fora do ar.
    return res.status(200).json([]);
  }
};
