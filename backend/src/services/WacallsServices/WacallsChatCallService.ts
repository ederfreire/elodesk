import axios, { AxiosInstance } from "axios";
import http from "http";
import https from "https";
import { URL } from "url";
import { Op } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import { getIO, setLastPresence } from "../../libs/socket";
import logger from "../../utils/logger";
import { resolvePN } from "../../utils/LidPnCache";
import HandleWacallsCall, { WacallsCallAction } from "./HandleWacallsCall";
import { handleWacallsChatMessagingEvent } from "./WacallsChatMessageService";
import { HandleWacallsAck } from "./HandleWacallsIncoming";

/**
 * Bridge com o wacalls-chat (github.com/raphaelbat/wacalls-chat) — cuida de
 * CHAMADA (aceitar/recusar/encerrar e áudio real via WebRTC/DataChannel) e,
 * junto com WacallsChatMessageService, também de MENSAGEM: o wacalls-chat
 * virou o único backend do canal "wacalls" (substitui o wacalls-voip por
 * completo). Uma sessão só (Whatsapp.wacallsChatSessionId), um QR só — o
 * stream de eventos abaixo (`startWacallsChatEventLoop`) alimenta os dois.
 *
 * Autenticação: o wacalls-chat usa cookie de sessão (login usuário/senha),
 * não Bearer token. Aqui logamos uma vez com uma conta de serviço dedicada
 * (WACALLS_CHAT_EMAIL/WACALLS_CHAT_PASSWORD) e reaproveitamos o cookie.
 */

const baseURL = (process.env.WACALLS_CHAT_URL || "").replace(/\/$/, "");
const serviceEmail = process.env.WACALLS_CHAT_EMAIL || "";
const servicePassword = process.env.WACALLS_CHAT_PASSWORD || "";

export const isEnabled = (): boolean => !!(baseURL && serviceEmail && servicePassword);

let cookie: string | null = null;
let cookiePromise: Promise<string> | null = null;

// 15s era curto demais pro dial: resolução de LID/PN no servidor do WhatsApp
// pode levar mais que isso em rede mais lenta, e o cliente desistia antes do
// wacalls-chat sequer conseguir responder (nem erro real, nem sucesso — só
// timeout). 25s dá mais margem sem deixar o agente esperando "pra sempre".
const rawClient: AxiosInstance = axios.create({ baseURL, timeout: 25000 });

const login = async (): Promise<string> => {
  const { headers } = await rawClient.post(
    "/api/auth/login",
    { email: serviceEmail, password: servicePassword },
    { validateStatus: () => true }
  );
  const setCookie = (headers as any)["set-cookie"] as string[] | undefined;
  const found = setCookie?.map(c => c.split(";")[0]).find(c => c.startsWith("wacalls_session="));
  if (!found) throw new Error("Login do serviço de chamadas não retornou cookie de sessão");
  cookie = found;
  return found;
};

export const ensureCookie = async (): Promise<string> => {
  if (cookie) return cookie;
  if (!cookiePromise) {
    cookiePromise = login().finally(() => {
      cookiePromise = null;
    });
  }
  return cookiePromise;
};

/**
 * Cliente autenticado. Em 401 (cookie expirado), refaz login uma vez e repete
 * a chamada — evita que todo mundo tenha que tratar reautenticação na mão.
 */
const call = async <T = any>(fn: (c: string) => Promise<{ status: number; data: T }>): Promise<T> => {
  const c = await ensureCookie();
  let res = await fn(c);
  if (res.status === 401) {
    cookie = null;
    const fresh = await ensureCookie();
    res = await fn(fresh);
  }
  if (res.status >= 400) {
    // Nunca deixa o nome interno do microserviço (wacalls-chat) vazar numa
    // mensagem de erro que pode chegar crua até o usuário (ex: discador) —
    // era literalmente isso que aparecia como "wacalls-chat respondeu 404".
    const msg = (res.data as any)?.error || `Serviço de chamadas respondeu ${res.status}`;
    const err: any = new Error(msg);
    // upstreamStatus preserva o status HTTP real que o wacalls-chat
    // respondeu (ex.: 400 "sessão não pareada", 404 "no such session") —
    // sem isso, todo controller que só sabe fazer `catch { res.status(502) }`
    // (ver friendlyCallError/importHistoryProxy) transformava até um erro de
    // negócio legítimo (4xx) num 502 genérico de "serviço indisponível",
    // escondendo a causa real tanto do usuário quanto dos logs.
    err.upstreamStatus = res.status;
    throw err;
  }
  return res.data;
};

// Exportados pra reaproveitar o mesmo client autenticado (cookie/login) em
// outros módulos que precisam falar com o wacalls-chat sem duplicar a
// máquina de login/retry-em-401 acima — ver GroupManagerService.ts (Gestor
// de Grupos do canal WhatsApp Plus).
export const get = <T = any>(path: string) =>
  call<T>(c => rawClient.get(path, { headers: { Cookie: c }, validateStatus: () => true }));

export const post = <T = any>(path: string, body?: any) =>
  call<T>(c => rawClient.post(path, body, { headers: { Cookie: c }, validateStatus: () => true }));

export const put = <T = any>(path: string, body?: any) =>
  call<T>(c => rawClient.put(path, body, { headers: { Cookie: c }, validateStatus: () => true }));

export const del = <T = any>(path: string) =>
  call<T>(c => rawClient.delete(path, { headers: { Cookie: c }, validateStatus: () => true }));

// --- sessões ---------------------------------------------------------------

export const createChatSession = async (whatsapp: Whatsapp): Promise<string> => {
  const data = await post<{ id: string }>("/api/sessions", { name: whatsapp.name });
  if (!data?.id) throw new Error("Serviço de chamadas não retornou id de sessão");
  await whatsapp.update({ wacallsChatSessionId: data.id });
  // O wacalls-chat cria a sessão com allowGroups=false por padrão — sem isso
  // TODA mensagem de grupo chega no whatsmeow mas é descartada silenciosamente
  // no handleWAMessage (nem salva, nem emite no SSE), então nunca vira ticket
  // aqui. Habilitamos explicitamente pra ter paridade com o Baileys, que
  // sempre recebeu grupo. Best-effort: se falhar, a sessão continua criada.
  try {
    await put(`/api/sessions/${data.id}`, { name: whatsapp.name, allowGroups: true });
  } catch (err: any) {
    logger.warn(`[wacalls-chat] falha ao habilitar allowGroups na sessão ${data.id}: ${err?.message}`);
  }
  // Conexão criada já com URA escolhida: vincula na sessão nova também
  // (antes só valia depois de salvar a conexão de novo).
  if ((whatsapp as any).wacallsVoiceFlowId) {
    try {
      const { aplicarUraNaSessao } = await import("./WacallsVoiceFlowService");
      await aplicarUraNaSessao(whatsapp);
    } catch (err: any) {
      logger.warn(`[URA] não consegui vincular a URA na sessão nova ${data.id}: ${err?.message}`);
    }
  }
  return data.id;
};

/**
 * Resolve um JID @lid pro número de telefone real, usando o endpoint
 * GET /api/sessions/{sid}/lid-pn/{jid} do wacalls-chat (já existente lá —
 * ver contactsync.go: handleLidToPN — mas nunca era chamado daqui). Usa o
 * mapeamento local do whatsmeow (client.Store.LIDs) e, se não achar, dispara
 * um USync de aquecimento antes de tentar de novo — pode não achar nada
 * (contato nunca revelou o número real pro WhatsApp), retorna null nesse
 * caso, sem lançar erro.
 */
export const resolveLidToPhone = async (sessionId: string, jid: string): Promise<string | null> => {
  try {
    const data = await get<{ phone?: string; jid?: string }>(
      `/api/sessions/${sessionId}/lid-pn/${encodeURIComponent(jid)}`
    );
    return data?.phone || null;
  } catch (err: any) {
    logger.debug(`[wacalls-chat] resolveLidToPhone ${jid}: ${err?.message}`);
    return null;
  }
};

/**
 * Marca a sessão como "available" e assina presença de um chat específico
 * (POST /api/sessions/{sid}/chats/{jid}/presence-subscribe — ver
 * handlePresenceSubscribe em contactsync.go). Equivalente ao
 * `wbot.presenceSubscribe(jid)` do Baileys — chamado pelo mesmo gatilho
 * (libs/socket.ts, evento "presenceSubscribe" quando o atendente abre um
 * ticket, e de novo periodicamente pelo keepalive) pra fazer o indicador de
 * "digitando.../gravando áudio.../online" funcionar também no canal
 * WhatsApp Plus. Best-effort: falha aqui só significa que o indicador não
 * aparece pra essa conversa, não deve derrubar nada.
 */
export const presenceSubscribe = async (sessionId: string, jid: string): Promise<void> => {
  try {
    await post(`/api/sessions/${sessionId}/chats/${encodeURIComponent(jid)}/presence-subscribe`, {});
  } catch (err: any) {
    logger.debug(`[wacalls-chat] presenceSubscribe ${jid}: ${err?.message}`);
  }
};

export const deleteChatSession = async (whatsapp: Whatsapp): Promise<void> => {
  if (!whatsapp.wacallsChatSessionId) return;
  try {
    await del(`/api/sessions/${whatsapp.wacallsChatSessionId}`);
  } catch (err: any) {
    logger.warn(`[wacalls-chat] delete session ${whatsapp.wacallsChatSessionId}: ${err?.message}`);
  }
};

/**
 * Re-dispara o pareamento de uma sessão que JÁ EXISTE no wacalls-chat mas não
 * está conectada (ex: usuário reabriu o modal de QR de uma conexão que já
 * tentou parear antes e desistiu, ou o whatsmeow parou de girar QR). Sem
 * isso, o fluxo idempotente do controller só marca status=qrcode local e
 * fica esperando um evento que nunca chega — é EXATAMENTE esse o motivo do
 * QR "demorando pra sempre": a sessão só pareia sozinha automaticamente na
 * criação (SessionManager.Create → startPairing); reabrir precisa chamar
 * POST /api/sessions/{id}/pair explicitamente pro wacalls-chat trocar o
 * client whatsmeow e voltar a gerar/emitir QR.
 */
/**
 * Retorna true se a sessão está (ou ficou) pronta pra parear. Retorna false
 * quando a sessão simplesmente não existe mais do lado do wacalls-chat (ex:
 * banco dele foi resetado/recriado) — nesse caso o chamador deve limpar
 * wacallsChatSessionId e criar uma sessão nova, senão fica esperando pra
 * sempre um QR que nunca vai chegar porque a sessão-alvo não existe.
 */
export const pairChatSession = async (sessionId: string): Promise<boolean> => {
  try {
    await post(`/api/sessions/${sessionId}/pair`, {});
    logger.info(`[wacalls-chat] re-pareamento disparado pra sessão ${sessionId}`);
    return true;
  } catch (err: any) {
    const msg = String(err?.message || "");
    // "session already paired" é esperado (usuário reabriu o modal depois
    // de já ter escaneado) — não é erro, o auth-state real vai chegar via SSE.
    if (/already paired/i.test(msg)) {
      return true;
    }
    if (/no such session/i.test(msg)) {
      logger.warn(`[wacalls-chat] sessão ${sessionId} não existe mais no wacalls-chat (órfã) — será recriada`);
      return false;
    }
    logger.warn(`[wacalls-chat] pair ${sessionId} falhou: ${msg}`);
    return false;
  }
};

interface SessionInfo {
  id: string;
  name: string;
  jid: string;
  state: string;
  paired: boolean;
}

// "syncing": ver comentário no case "auth-state" de handleEvent — sessão já
// pareou mas o whatsmeow ainda não confirmou o socket pronto. Reconciliação
// não deve promover isso pra CONNECTED (senão o fix do delay não tem efeito
// nenhum assim que o stream SSE reconectar, que é justamente quando
// reconcileSessions roda).
const SYNCING_STATE = "syncing";

export const listChatSessions = async (): Promise<SessionInfo[]> => {
  const data = await get<{ sessions: SessionInfo[] }>("/api/sessions");
  return data?.sessions || [];
};

/**
 * Corrige o estado local comparando com a verdade atual do wacalls-chat.
 * SSE não faz replay: se a conexão ficar presa/reconectar bem no instante em
 * que o celular termina de parear (ou desconecta), aquele evento único
 * (auth-state paired=true/logged_out) se perde pra sempre — a sessão já
 * pareou de verdade do lado do wacalls-chat, mas o whatsapp.status daqui
 * fica preso em "qrcode" indefinidamente porque nenhum evento novo vai
 * repetir aquela transição. Rodar isso a cada (re)conexão do stream fecha
 * essa brecha: version própria do wacalls-chat sempre vence.
 */
// Extrai só os dígitos do número de telefone de um JID whatsmeow
// ("558197295073@s.whatsapp.net" ou "558197295073.0:12@s.whatsapp.net") —
// mesma normalização usada em todo o resto do sistema pro campo
// Contact/Whatsapp.number.
const jidToPhoneDigits = (jid: string): string =>
  String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");

const reconcileSessions = async (): Promise<void> => {
  try {
    const sessions = await listChatSessions();
    for (const s of sessions) {
      const whatsapp = await Whatsapp.findOne({ where: { wacallsChatSessionId: s.id } });
      if (!whatsapp) continue;

      // Número da conexão (mostrado no card de Conexões, igual já acontece
      // pro Baileys): o wacalls-chat devolve o JID pareado em /api/sessions
      // (SessionInfo.jid), mas o evento SSE "auth-state" que dispara a
      // transição de status pra CONNECTED não carrega esse campo (só
      // paired/state/qr — ver AuthSnapshot em broker.go) — por isso nunca
      // era gravado antes. Preenche aqui sempre que a sessão está pareada e
      // temos um JID, independente de precisar mudar o status.
      const phoneDigits = s.paired ? jidToPhoneDigits(s.jid) : "";
      const numberPatch: any =
        phoneDigits && whatsapp.number !== phoneDigits ? { number: phoneDigits } : {};

      if (s.paired && s.state === SYNCING_STATE && whatsapp.status !== "OPENING" && whatsapp.status !== "CONNECTED") {
        await whatsapp.update({ status: "OPENING", qrcode: null, ...numberPatch });
        logger.info(`[wacalls-chat] reconciliação: whatsappId=${whatsapp.id} estava desatualizado, corrigido pra OPENING (sincronizando)`);
        emitSessionUpdate(whatsapp);
      } else if (s.paired && s.state !== SYNCING_STATE && whatsapp.status !== "CONNECTED") {
        await whatsapp.update({ status: "CONNECTED", qrcode: null, ...numberPatch });
        logger.info(`[wacalls-chat] reconciliação: whatsappId=${whatsapp.id} estava desatualizado, corrigido pra CONNECTED`);
        emitSessionUpdate(whatsapp);
      } else if (!s.paired && s.state === "logged_out" && whatsapp.status === "CONNECTED") {
        await whatsapp.update({ status: "DISCONNECTED", qrcode: null });
        logger.info(`[wacalls-chat] reconciliação: whatsappId=${whatsapp.id} estava desatualizado, corrigido pra DISCONNECTED`);
        emitSessionUpdate(whatsapp);
      } else if (Object.keys(numberPatch).length) {
        // Status já estava certo, só faltava o número (caso comum: sessão
        // pareou antes dessa correção existir, ou pareou entre dois ciclos
        // de reconciliação).
        await whatsapp.update(numberPatch);
        logger.info(`[wacalls-chat] reconciliação: whatsappId=${whatsapp.id} número atualizado para ${phoneDigits}`);
        emitSessionUpdate(whatsapp);
      }
    }
  } catch (err: any) {
    logger.warn(`[wacalls-chat] reconciliação de sessões falhou: ${err?.message}`);
  }
};

/**
 * Busca o QR atual de uma sessão fazendo uma leitura curta do stream de
 * eventos (o wacalls-chat só entrega QR via SSE, não tem endpoint de
 * polling dedicado). Devolve null se a sessão já estiver pareada ou se
 * nenhum QR chegar dentro do timeout.
 */
/**
 * Pede ao wacalls-chat pra reimportar histórico recente da conversa via
 * history sync do whatsmeow (equivalente ao que o WhatsApp Web mostra
 * assim que você escaneia o QR) — botão "Importar mensagens anteriores" na
 * tela de conexão. Assíncrono: as mensagens chegam aos poucos pelo mesmo
 * canal SSE de mensagem ao vivo (ver WacallsChatMessageService.ts /
 * handleWacallsChatMessagingEvent), não tem uma lista de retorno aqui —
 * este POST só confirma que o pedido foi enviado ao WhatsApp.
 */
export const importChatHistory = async (
  sessionId: string,
  startDate?: string,
  endDate?: string,
  ticketStatus?: string,
  queueId?: number | string
): Promise<void> => {
  // startDate/endDate opcionais ("yyyy-mm-dd", do modal de período na tela
  // de conexão) — repassados como estão pro wacalls-chat, que faz o parse
  // e o filtro (ver historyimport.go/handleImportHistory). Sem eles, o
  // Go continua se comportando como antes (sem filtro nenhum).
  // ticketStatus opcional ("open"/"pending"/"closed") — status que o
  // operador escolheu pra forçar em todo ticket criado/reaberto por esse
  // import (mesma opção que o import do Baileys já tem). Sem ele, o Go
  // segue sem override, deixando o pipeline normal de ticket decidir.
  // queueId opcional — fila a atribuir a todo ticket criado/reaberto por
  // esse import (mesma técnica do ticketStatus). Sem ele, ticket segue sem
  // fila forçada.
  await post(`/api/sessions/${sessionId}/import-history`, { startDate, endDate, ticketStatus, queueId });
};

export const fetchChatSessionQrOnce = async (sessionId: string, timeoutMs = 12000): Promise<string | null> => {
  const c = await ensureCookie();
  const url = new URL(`${baseURL}/api/events`);
  const lib = url.protocol === "https:" ? https : http;

  return new Promise(resolve => {
    let settled = false;
    let buffer = "";
    let req: http.ClientRequest;

    const done = (qr: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { req.destroy(); } catch {}
      resolve(qr);
    };

    const timer = setTimeout(() => done(null), timeoutMs);

    req = lib.request(
      {
        method: "GET",
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers: { Cookie: c, Accept: "text/event-stream" }
      },
      upRes => {
        upRes.setEncoding("utf8");
        upRes.on("data", (chunk: string) => {
          buffer += chunk;
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = raw.split("\n").find(l => l.startsWith("data:"));
            if (!line) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim());
              if (ev.type === "session-qr" && ev.sessionId === sessionId && ev.qr) {
                // ev.qr é a string crua do QR do whatsmeow (evt.Code), não PNG em
                // base64 — o wacalls-chat não renderiza imagem, quem desenha o QR
                // é o cliente (QrcodeModal já sabe fazer isso via <QRCode value=.../>
                // quando o valor não começa com "data:image").
                done(ev.qr);
                return;
              }
              if (ev.type === "auth-state" && ev.sessionId === sessionId && ev.paired) {
                done(null);
                return;
              }
            } catch {}
          }
        });
        upRes.on("end", () => done(null));
      }
    );
    req.on("error", () => done(null));
    req.end();
  });
};

// --- chamadas ----------------------------------------------------------------

export const dialChatCall = async (sessionId: string, phone: string, video = false, clientId?: string) => {
  // clientId precisa ir na QUERY STRING, não no corpo — o wacalls-chat lê o
  // "owner" da chamada via clientID(r), que só olha o header X-Client-Id ou
  // ?clientId= na URL (ver acceptChatCall logo abaixo, que já fazia certo).
  // Mandando só no body (como estava), toda ligação discada pela ferramenta
  // virava owner="" no broker — e como o Node trata "" como falsy no
  // discriminador incoming/outgoing (WacallsChatCallService.ts, case
  // "call-status"), a chamada NUNCA era anunciada como "call.outgoing" pro
  // frontend: ela tocava de verdade no celular do cliente, mas sumia da
  // tela do agente sem nenhum card/botão (era exatamente o bug "ligação
  // fica perdida, sem botão de desligar").
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return post<{ call: { callId: string } }>(`/api/sessions/${sessionId}/calls${qs}`, {
    phone,
    video
  });
};

export const acceptChatCall = async (sessionId: string, callId: string, clientId?: string) => {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return post(`/api/sessions/${sessionId}/calls/${callId}/accept${qs}`, {});
};

// clientId (id do usuário EquipeChat) precisa ir aqui também, não só no
// accept: o wacalls-chat usa isso pra saber QUEM está pedindo pra encerrar e
// recusar a ação quando a chamada já está sendo atendida por outro operador
// (ver callOwnedByOther em httpapi.go). Sem enviar, toda tentativa de
// desligar seria vista como "de outra pessoa" e ninguém conseguiria encerrar
// a própria ligação.
export const rejectChatCall = async (sessionId: string, callId: string, clientId?: string) => {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return post(`/api/sessions/${sessionId}/calls/${callId}/reject${qs}`, {});
};

/**
 * Toca um áudio já pronto dentro de uma ligação — base da campanha de voz.
 *
 * `waitAnswerMs` faz o microserviço esperar o atendimento antes de tocar, e
 * devolver `answered: false` se o contato não atender. Isso evita ficar
 * consultando status em laço daqui: uma requisição só resolve.
 *
 * A resposta traz `durationMs`, que é quanto tempo o áudio leva — quem chamou
 * usa esse número pra saber quando desligar.
 */
export const playCampaignAudio = async (
  sessionId: string,
  callId: string,
  url: string,
  waitAnswerMs = 0
) =>
  post<{ ok: boolean; answered: boolean; durationMs?: number; reason?: string }>(
    `/api/sessions/${sessionId}/calls/${callId}/play`,
    { url, waitAnswerMs }
  );

export const hangupChatCall = async (sessionId: string, callId: string, clientId?: string) => {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return del(`/api/sessions/${sessionId}/calls/${callId}${qs}`);
};

/**
 * Troca de SDP pra áudio real: o navegador manda a oferta (getUserMedia +
 * RTCPeerConnection), aqui repassa pro wacalls-chat e devolve a resposta SDP
 * pro navegador aplicar. Sem isso o "atender" só muda status, não tem áudio.
 */
export const exchangeChatCallSdp = async (sessionId: string, callId: string, sdpOffer: string) => {
  const data = await post<{ sdp_answer: string }>(`/api/sessions/${sessionId}/calls/${callId}/webrtc`, {
    sdp_offer: sdpOffer
  });
  return data.sdp_answer;
};

// --- troncal SIP (baresip) --------------------------------------------------
// Diferente das chamadas WhatsApp acima, a troncal SIP é ÚNICA e GLOBAL pro
// servidor wacalls-chat inteiro (não amarrada a nenhuma sessão/conexão) — ver
// wacalls-chat/cmd/server/sipapi.go. Por isso essas funções não recebem
// sessionId.

export type SipTrunkSettings = {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password?: string;
  domain: string;
  transport: string;
  callerId: string;
  hasPassword?: boolean;
  sipPort?: number;
};

// Cada empresa tem sua PRÓPRIA troncal SIP isolada no wacalls-chat (processo
// baresip, socket ctrl_tcp e dispositivos de áudio próprios — ver
// wacalls-chat/cmd/server/sipregistry.go). Antes disso era uma troncal única
// pro servidor inteiro: quando uma segunda empresa salvava SIP, sobrescrevia
// a config da primeira (mesmo arquivo/KV), e os eventos de chamada eram
// mandados pra TODAS as empresas ao mesmo tempo (era isso que a empresa B
// "via" a ligação da empresa A). Por isso toda função abaixo agora recebe
// companyId e chama /api/sip/{companyId}/...

export const getSipSettings = async (companyId: number): Promise<SipTrunkSettings> =>
  get<SipTrunkSettings>(`/api/sip/${companyId}/settings`);

export const setSipSettings = async (
  companyId: number,
  settings: Partial<SipTrunkSettings>
): Promise<SipTrunkSettings> => put<SipTrunkSettings>(`/api/sip/${companyId}/settings`, settings);

export const getSipStatus = async (companyId: number) =>
  get<{ baresipConnected: boolean; trunkEnabled: boolean; current: any }>(`/api/sip/${companyId}/status`);

export const dialSipCall = async (companyId: number, number: string) =>
  post<{ call: { callId: string } }>(`/api/sip/${companyId}/calls`, { number });

export const acceptSipCall = async (companyId: number, callId: string) =>
  post(`/api/sip/${companyId}/calls/${callId}/accept`, {});

export const rejectSipCall = async (companyId: number, callId: string) =>
  post(`/api/sip/${companyId}/calls/${callId}/reject`, {});

export const hangupSipCall = async (companyId: number, callId: string) =>
  del(`/api/sip/${companyId}/calls/${callId}`);

export const exchangeSipCallSdp = async (companyId: number, callId: string, sdpOffer: string) => {
  const data = await post<{ sdp_answer: string }>(`/api/sip/${companyId}/calls/${callId}/webrtc`, { sdp_offer: sdpOffer });
  return data.sdp_answer;
};

// --- consumo de eventos (substitui o webhook do wacalls-voip) --------------

let streamActive = false;
const peerCache = new Map<string, string>(); // callId -> peer jid, pra preencher call.ended
// callIds já anunciados pro frontend (via "incoming" OU "call.outgoing") —
// evita re-anunciar a cada tick de call-status (starting/ringing podem
// disparar mais de uma vez pra mesma ligação).
const announcedCache = new Set<string>();

// whatsappIds pra quem já disparamos o auto-import de histórico nesta vida
// do processo (ver case "auth-state" abaixo) — o evento auth-state com
// paired=true não avisa "acabei de parear agora", ele também reaparece
// toda vez que o stream SSE reconecta pra uma sessão que já estava
// pareada há tempo. Sem essa guarda, cada reconexão do stream dispararia
// um novo pedido de histórico pro WhatsApp.
const autoImportOnPairSessions = new Set<number>();

// Dono de cada chamada em andamento: callId -> id do usuário EquipeChat que
// atendeu/discou. Alimentado pelos eventos "incoming-claimed" e
// "call-status" e limpo no "call-ended".
//
// Existe pra impedir, AQUI NO NODE, que um operador encerre a chamada de
// outro. A mesma trava foi feita no wacalls-chat (callOwnedByOther em
// httpapi.go), mas aquela só passa a valer quando o binário Go é
// recompilado na instalação — e é justamente o cenário mais comum de
// atualização parcial. Como a chamada de desligar SEMPRE passa por aqui
// antes de chegar no Go, esta verificação protege mesmo sem recompilar.
const callOwners = new Map<string, string>();

export const getCallOwner = (callId: string): string | null =>
  callOwners.get(String(callId)) || null;

const emitSessionUpdate = (whatsapp: Whatsapp) => {
  const io = getIO();
  io.of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-whatsappSession`, {
    action: "update",
    session: whatsapp
  });
};

/**
 * Eventos "sip-call" (ver sipapi.go/sipregistry.go do wacalls-chat) agora
 * SEMPRE vêm com "companyId" — cada empresa tem sua própria troncal SIP
 * isolada (processo baresip, ctrl_tcp e áudio próprios), então o wacalls-chat
 * já sabe de qual empresa é a ligação e manda isso junto no evento. ANTES
 * disso a troncal era única pro servidor inteiro e o evento não carregava
 * companyId nenhum — a única saída era fazer broadcast pra TODAS as
 * empresas, o que causava o vazamento reportado ("empresa B liga e a
 * empresa A vê a ligação dela"). Se por algum motivo o evento chegar sem
 * companyId (versão antiga do wacalls-chat, ou evento malformado), ignora
 * em vez de arriscar vazar de novo.
 */
const handleSipCallEvent = async (ev: any) => {
  const call = ev?.call || {};
  const eventName =
    ev.event === "incoming" ? "sip.incoming" :
    ev.event === "outgoing" ? "sip.outgoing" :
    ev.event === "state" && call.state === "active" ? "sip.answered" :
    ev.event === "ended" ? "sip.ended" :
    null;
  if (!eventName) return;
  const companyId = ev.companyId || call.companyId;
  if (!companyId) {
    logger.warn(`[wacalls-chat] evento sip-call "${ev.event}" sem companyId — ignorado (evite broadcast pra todas as empresas)`);
    return;
  }
  getIO().of(String(companyId)).emit(`company-${companyId}-wacalls`, {
    event: eventName,
    callId: call.callId || ev.callId,
    peer: call.peer || ev.peer,
    peerName: call.peer || ev.peer,
    direction: call.direction,
    endReason: call.endReason
  });
};

/**
 * Emite um evento "company-{id}-wacalls" restrito a UM operador (sala
 * `user-{id}`, já usada por todo o resto do sistema — ver socket.ts) quando
 * `owner` vier preenchido, ou pra empresa inteira quando não vier.
 *
 * BUG CORRIGIDO: toda chamada wacalls (discada ou atendida) sempre foi
 * emitida com `.of(companyId).emit(...)` — namespace da empresa inteira,
 * sem nenhuma sala — então TODO agente logado via a MESMA empresa via o
 * card "Chamando..."/"Em ligação" de QUALQUER chamada alheia, mesmo sem
 * ter nada a ver com aquele ticket (reportado: dois operadores em telas
 * diferentes vendo a mesma ligação em andamento). O dono de verdade da
 * chamada (quem discou, ou quem atendeu uma recebida) já é rastreado do
 * lado do wacalls-chat como `owner` (ver httpapi.go: doDial/doAccept usam
 * clientID(r), que é exatamente o id do usuário EquipeChat logado — ver
 * dialProxy/acceptProxy neste mesmo arquivo, que mandam `String(req.user.id)`
 * como clientId) e já chega aqui em `ev.owner`. Só precisava ser usado pra
 * mirar o emit em vez de sempre estourar pra empresa inteira.
 *
 * Chamada RECEBIDA ainda não reivindicada (evento "incoming", sem owner
 * nenhum) continua indo pra empresa inteira de propósito — é o único jeito
 * de qualquer operador disponível conseguir atender.
 */
const emitWacallsToOwnerOrCompany = (companyId: number, owner: any, payload: any): void => {
  const io = getIO().of(String(companyId));
  const ownerId = owner ? String(owner).trim() : "";
  if (ownerId) {
    io.to(`user-${ownerId}`).emit(`company-${companyId}-wacalls`, payload);
  } else {
    io.emit(`company-${companyId}-wacalls`, payload);
  }
};

// Limitador genérico de concorrência. Antes, tanto o dispatch geral de
// eventos do SSE quanto o disparo de handleWacallsChatMessagingEvent
// (message/chat-meta, ver o `default:` limiter mais abaixo) rodavam sem
// nenhum teto — cada linha do stream disparava a próxima tarefa async na
// hora, sem await. Numa rajada (import de histórico trazendo dezenas de
// mensagens de uma vez, ou várias empresas/sessões conectando junto) isso
// processava TUDO em paralelo, cada execução abrindo várias queries no
// Sequelize — com um pool de conexões limitado (DB_POOL_MAX, padrão 20),
// isso esgotava o pool na hora e derrubava TUDO no processo, inclusive
// tráfego ao vivo de OUTRAS empresas (era o que aparecia nos logs como
// "SearchForQueue -> VerifyQueue: error" e "Erro ao incrementar contador de
// mensagens" junto com o uso de "Importar mensagens anteriores"). Um teto
// de concorrência mantém o processamento abaixo do limite do pool sem
// serializar tudo (ainda roda em paralelo, só que num número controlado).
const makeConcurrencyLimiter = (limit: number) => {
  let active = 0;
  const queue: Array<() => void> = [];
  const runNext = () => {
    if (active >= limit) return;
    const next = queue.shift();
    if (!next) return;
    active++;
    next();
  };
  return (task: () => Promise<void>): void => {
    queue.push(() => {
      task().finally(() => {
        active--;
        runNext();
      });
    });
    runNext();
  };
};

const EVENT_CONCURRENCY = parseInt(process.env.WACALLS_EVENT_CONCURRENCY || "", 10) || 4;
const limitEventDispatch = makeConcurrencyLimiter(EVENT_CONCURRENCY);

// Teto separado pra handleWacallsChatMessagingEvent (message/chat-meta) —
// é o caminho realmente pesado em queries (contato, ticket, mensagem,
// contador) e o que aparecia nos logs como "erro processando evento
// message: Operation timeout" durante o import de histórico.
const MESSAGE_CONCURRENCY = parseInt(process.env.WACALLS_MESSAGE_CONCURRENCY || "", 10) || 4;
const limitMessageDispatch = makeConcurrencyLimiter(MESSAGE_CONCURRENCY);

/**
 * Aviso (com freio) de evento cuja sessão o banco não reconhece, e tentativa
 * de auto-correção.
 *
 * O reconcile relê a verdade do wacalls-chat e reatribui os ids — se o
 * descompasso for justamente esse, a própria chamada resolve. Roda no máximo
 * uma vez a cada 5 minutos para não virar uma enxurrada de consultas quando o
 * serviço é compartilhado com outra instalação.
 */
const ultimoAvisoPorSessao = new Map<string, number>();
let ultimoReconcilePorEventoOrfao = 0;

const avisarSessaoDesconhecida = (sessionId: string, tipo: string) => {
  const agora = Date.now();

  const ultimo = ultimoAvisoPorSessao.get(sessionId) || 0;
  if (agora - ultimo > 60000) {
    ultimoAvisoPorSessao.set(sessionId, agora);
    logger.warn(
      `[wacalls-chat] evento "${tipo}" da sessão ${sessionId} descartado: ` +
        `nenhuma conexão no banco tem esse wacallsChatSessionId. ` +
        `Se esta é a sua conexão, ela está recebendo do WhatsApp mas nada chega ao sistema — ` +
        `reconciliando ids.`
    );
  }

  if (agora - ultimoReconcilePorEventoOrfao > 5 * 60 * 1000) {
    ultimoReconcilePorEventoOrfao = agora;
    reconcileSessions().catch(err =>
      logger.warn(`[wacalls-chat] reconcile após evento órfão falhou: ${err?.message}`)
    );
  }
};

const enqueueEvent = (ev: any) => {
  limitEventDispatch(() =>
    handleEvent(ev).catch(err =>
      logger.error(`[wacalls-chat] erro processando evento ${ev?.type}: ${err?.message}`)
    )
  );
};

const handleEvent = async (ev: any) => {
  if (ev?.type === "sip-call") {
    await handleSipCallEvent(ev);
    return;
  }
  // "chat-meta" não traz sessionId na raiz do evento (só dentro de ev.meta) —
  // sem esse fallback, TODO evento chat-meta caía no early-return abaixo e a
  // sincronização de nome/foto de contato ficava sempre quebrada.
  const sessionId: string | undefined = ev?.sessionId || ev?.meta?.sessionId;
  if (!sessionId) return;
  const whatsapp = await Whatsapp.findOne({ where: { wacallsChatSessionId: sessionId } });
  if (!whatsapp) {
    // Evento de uma sessão que o banco não conhece.
    //
    // Isso acontece de verdade quando o id de sessão sai de sincronia entre os
    // dois lados — o wacalls-chat foi repareado, o banco dele foi recriado, ou
    // a conexão foi salva de novo e ganhou outro id. E o estrago é silencioso:
    // a conexão continua mostrando CONECTADO (o status guardado só muda por
    // evento de auth, que também é descartado aqui), enquanto TODA mensagem e
    // TODA ligação são jogadas fora sem deixar rastro.
    //
    // Antes o aviso saía só para auth-state/incoming, justamente os tipos mais
    // raros — o caso comum ("message") era descartado em silêncio absoluto.
    // Agora todo tipo avisa, com limite de uma vez por minuto por sessão para
    // não inundar o log quando o wacalls-chat é compartilhado entre instâncias.
    avisarSessaoDesconhecida(sessionId, ev.type);
    return;
  }

  switch (ev.type) {
    // O wacalls-chat entrega o QR em DOIS eventos: "auth-state" (só quando o
    // snapshot de auth muda) e "session-qr" (cada novo código girado pelo
    // whatsmeow — ver broker.go emitQR). O backend só ouvia auth-state, então
    // na prática o QR quase nunca chegava em whatsapp.qrcode e a tela de
    // conexão ficava eternamente em "Conectando" sem mostrar QR nenhum.
    case "session-qr": {
      if (!ev.qr) break;
      await whatsapp.update({ status: "qrcode", qrcode: ev.qr });
      logger.info(`[wacalls-chat] session-qr whatsappId=${whatsapp.id} sessionId=${sessionId} — QR gravado`);
      emitSessionUpdate(whatsapp);
      break;
    }
    case "auth-state": {

      logger.info(`[wacalls-chat] auth-state whatsappId=${whatsapp.id} sessionId=${sessionId} paired=${ev.paired} state=${ev.state} temQr=${!!ev.qr}`);
      const patch: any = {};
      // "syncing": QR foi escaneado com sucesso, mas o whatsmeow ainda não
      // confirmou o socket como pronto (events.Connected) — visto em
      // produção levando até ~80s. Mostrar "OPENING" (status já usado/
      // estilizado no front como "Conectando") em vez de "CONNECTED"
      // prematuro evita o operador achar que mensagem sumiu logo depois de
      // conectar, quando na real a sessão ainda estava terminando de
      // sincronizar do lado do WhatsApp.
      if (ev.paired && ev.state === "syncing") {
        patch.status = "OPENING";
        patch.qrcode = null;
      } else if (ev.paired) {
        patch.status = "CONNECTED";
        patch.qrcode = null;
      } else if (ev.state === "qr" && ev.qr) {
        patch.status = "qrcode";
        // ev.qr é a string crua do QR (evt.Code do whatsmeow), não uma imagem —
        // o QrcodeModal do frontend já sabe desenhar isso com <QRCode value=.../>
        // quando o valor não começa com "data:image". Empacotar como PNG base64
        // aqui gerava um <img> quebrado (era exatamente esse o bug reportado).
        patch.qrcode = ev.qr;
      } else if (ev.state === "logged_out") {
        patch.status = "DISCONNECTED";
        patch.qrcode = null;
      }
      if (Object.keys(patch).length) {
        await whatsapp.update(patch);
        logger.info(`[wacalls-chat] whatsappId=${whatsapp.id} atualizado pra status=${patch.status}`);
        emitSessionUpdate(whatsapp);
      } else {
        logger.info(`[wacalls-chat] auth-state whatsappId=${whatsapp.id} sem patch aplicável (paired=${ev.paired} state=${ev.state})`);
      }
      // O evento auth-state não carrega o JID pareado (só paired/state/qr —
      // ver AuthSnapshot em broker.go), então o número da conexão não dá pra
      // preencher aqui direto. reconcileSessions busca o JID em
      // /api/sessions (SessionInfo.jid) e grava — dispara em background,
      // sem atrasar a resposta deste evento.
      if (ev.paired) {
        reconcileSessions().catch(() => {});
        // Auto-import de histórico ao parear — mesma ideia do canal
        // Baileys (ver wbot.ts, hasCustomImportRange), agora também pro
        // WhatsApp Plus: só dispara se o admin configurou um período em
        // "Sincronizar histórico a partir de/até" no editar conexão
        // (WhatsAppModal). Sem esse período configurado, nada muda — o
        // botão manual "Importar mensagens anteriores" continua sendo a
        // única forma de importar, igual sempre foi.
        if (whatsapp.importOldMessages && !autoImportOnPairSessions.has(whatsapp.id)) {
          autoImportOnPairSessions.add(whatsapp.id);
          importChatHistory(
            sessionId,
            String(whatsapp.importOldMessages),
            whatsapp.importRecentMessages ? String(whatsapp.importRecentMessages) : undefined,
            "open",
            undefined
          ).catch((err: any) => {
            logger.error(`[wacalls-chat] auto-import de histórico falhou (whatsappId=${whatsapp.id}): ${err?.message}`);
          });
        }
      }
      break;
    }
    case "incoming-claimed": {
      if (ev.id && ev.owner) callOwners.set(String(ev.id), String(ev.owner));
      // Alguém atendeu a chamada. O wacalls-chat já avisava isso, mas o
      // EquipeChat nunca repassava pro frontend — resultado: o card de
      // "chamada recebida" continuava tocando na tela de TODOS os outros
      // operadores mesmo depois de atendida (a "trava" relatada). Pior: se
      // um deles clicasse em recusar/desligar naquele card fantasma, a
      // ação valia pro MESMO callId e derrubava a ligação de quem estava
      // realmente falando. Repassar o aviso fecha o card de quem não
      // atendeu e elimina os dois problemas.
      getIO().of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-wacalls`, {
        event: "call.claimed",
        callId: ev.id,
        sessionId,
        owner: ev.owner ? String(ev.owner) : null
      });
      break;
    }
    case "incoming": {
      if (ev.peer) peerCache.set(ev.id, ev.peer);
      // O WhatsApp reenvia o offer de chamada periodicamente enquanto o
      // telefone continua tocando (retransmissão normal do protocolo) — o
      // wacalls-chat repassa cada reenvio como um evento "incoming" novo.
      // Sem essa guarda, cada reenvio reemitia "call.incoming" pro
      // frontend, que recriava o objeto `call` no WaCallsContext e resetava
      // o watchdog de 75s que limpa chamada perdida — na prática o card de
      // chamada nunca mais sumia sozinho enquanto o cliente deixasse
      // tocando, mesmo depois dele desistir (era exatamente o bug "fica
      // preso pra sempre"). Só processa/anuncia a primeira vez por callId.
      if (announcedCache.has(ev.id)) break;
      announcedCache.add(ev.id);
      const incomingResult = await HandleWacallsCall(whatsapp, {
        action: "call.incoming" as WacallsCallAction,
        sessionId,
        callId: ev.id,
        from: ev.peer,
        pushName: ev.peerName,
        timestamp: ev.offeredAt
      });
      // O frontend (WaCallsContext) só toca o telefone quando escuta esse
      // canal específico — sem isso a chamada é registrada no banco mas
      // ninguém vê/ouve nada tocando na tela (era exatamente o bug "liguei
      // e não tocou"). O webhook antigo do wacalls-voip mandava isso; na
      // migração pro wacalls-chat esse emit ficou pra trás.
      //
      // avatarUrl/number vêm do Contact que HandleWacallsCall já resolveu —
      // sem isso o modal de chamada só tinha o JID cru pra mostrar (sem foto
      // nem número formatado).
      const incomingContact: any = incomingResult?.contact;
      getIO().of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-wacalls`, {
        event: "call.incoming",
        callId: ev.id,
        sessionId,
        from: ev.peer,
        pushName: ev.peerName,
        avatarUrl: incomingContact?.urlPicture || incomingContact?.profilePicUrl || null,
        number: incomingContact?.number || null,
        // wacalls-chat já manda isso (ver broker.go emitIncoming) mas não
        // era repassado pro front — sem isso o CallModal nunca sabia que
        // uma chamada recebida era de vídeo (só áudio funcionava).
        video: !!ev.video
      });
      break;
    }
    case "call-status": {
      if (ev.peer) peerCache.set(ev.id, ev.peer);
      // Chamada DISCADA já nasce com dono; recebida ganha dono ao ser
      // atendida. Guarda nos dois casos (ver comentário em callOwners).
      if (ev.id && ev.owner) callOwners.set(String(ev.id), String(ev.owner));

      // wacalls-chat NÃO manda um evento dedicado pra chamada saindo — isso
      // ("incoming") só existe pro lado de quem RECEBE. Pro lado de quem
      // disca (o agente, via botão Ligar/discador), o primeiro sinal de
      // vida da ligação é justamente esse call-status com status
      // "starting"/"ringing". Sem tratar isso, o botão de ligar discava de
      // verdade só que a tela nunca criava o estado `call` — o modal nunca
      // aparecia e nada parecia acontecer.
      //
      // MAS: o wacalls-chat manda esse MESMO call-status/ringing também pra
      // chamadas RECEBIDAS (session.go: upsertCall roda antes de
      // emitIncoming) — sem distinguir os dois casos, toda ligação recebida
      // era tratada como se fosse saindo (marcava announcedCache antes do
      // "incoming" de verdade chegar, e o guard de "incoming" abaixo
      // descartava o evento real). Resultado: card de chamada recebida
      // aparecia como "Chamando..." sem botão de atender. O discriminador
      // confiável é "owner": só chamada DISCADA por um operador tem owner
      // já no primeiro call-status; chamada recebida não tem owner até ser
      // reivindicada (ver broker.go upsertCall/session.go OnIncoming).
      if (ev.owner && (ev.status === "starting" || ev.status === "ringing") && !announcedCache.has(ev.id)) {
        announcedCache.add(ev.id);
        const outgoingResult = await HandleWacallsCall(whatsapp, {
          action: "call.outgoing" as WacallsCallAction,
          sessionId,
          callId: ev.id,
          from: ev.peer || peerCache.get(ev.id),
          timestamp: ev.startedAt,
          owner: ev.owner
        });
        const outgoingContact: any = outgoingResult?.contact;
        // Só o operador que discou (ev.owner) precisa ver o card "Chamando...".
        // Ver comentário em emitWacallsToOwnerOrCompany — antes isso ia pra
        // empresa inteira e qualquer outro agente logado via a ligação alheia.
        emitWacallsToOwnerOrCompany(whatsapp.companyId, ev.owner, {
          event: "call.outgoing",
          callId: ev.id,
          sessionId,
          from: ev.peer || peerCache.get(ev.id),
          // Sem isso, o card de chamada saindo mostrava o JID/LID cru (ex:
          // "252810767634561@lid") em vez do nome do contato — o WhatsApp não
          // manda "peerName" pra chamadas que a gente disca (só faz sentido
          // pro lado de quem recebe), então usamos o nome já resolvido do
          // Contact (que HandleWacallsCall criou/achou pelo número real).
          pushName: outgoingContact?.name || null,
          avatarUrl: outgoingContact?.urlPicture || outgoingContact?.profilePicUrl || null,
          number: outgoingContact?.number || null
        });
      }

      if (ev.status === "connected") {
        await HandleWacallsCall(whatsapp, {
          action: "call.answered" as WacallsCallAction,
          sessionId,
          callId: ev.id,
          from: ev.peer || peerCache.get(ev.id),
          timestamp: ev.startedAt,
          // Quem atendeu/discou — sem isso o relatório mostra "Sistema".
          owner: ev.owner || getCallOwner(ev.id) || undefined
        });
        // A essa altura a chamada sempre tem owner (discada = tinha desde o
        // início; recebida = ganhou owner ao ser atendida via doAccept) — só
        // quem discou/atendeu deve ver "Em ligação".
        emitWacallsToOwnerOrCompany(whatsapp.companyId, ev.owner, {
          event: "call.answered",
          callId: ev.id,
          sessionId,
          from: ev.peer || peerCache.get(ev.id)
        });
      }
      break;
    }
    case "call-ended": {
      await HandleWacallsCall(whatsapp, {
        action: "call.ended" as WacallsCallAction,
        sessionId,
        callId: ev.id,
        from: peerCache.get(ev.id),
        reason: ev.reason,
        timestamp: ev.endedAt,
        owner: ev.owner || getCallOwner(ev.id) || undefined
      });
      // "call.ended" vai SEMPRE pra empresa inteira, mesmo quando a chamada
      // tem dono. Motivo: "call.incoming" é anunciado pra todo mundo (é o
      // único jeito de qualquer operador disponível poder atender), então
      // TODOS os operadores ficam com o card de chamada tocando na tela.
      // Se o encerramento fosse só pro dono, o card continuaria preso na
      // tela de todos os OUTROS operadores até o watchdog do frontend
      // limpar. Mandar o ended pra todos é inofensivo: o frontend só age
      // se o callId/sessionId casar com a chamada que ele está mostrando
      // (ver matchesCurrentCall em WaCallsContext.js) — quem não tem card
      // nenhum simplesmente ignora.
      getIO()
        .of(String(whatsapp.companyId))
        .emit(`company-${whatsapp.companyId}-wacalls`, {
          event: "call.ended",
          callId: ev.id,
          sessionId,
          from: peerCache.get(ev.id)
        });
      peerCache.delete(ev.id);
      announcedCache.delete(ev.id);
      callOwners.delete(String(ev.id));
      break;
    }
    case "message":
    case "chat-meta": {
      // Mensagem agora vem 100% pelo wacalls-chat (substitui o webhook do
      // wacalls-voip) — delega pra WacallsChatMessageService, que traduz
      // pro mesmo pipeline de ticket/contato que o Baileys usa.
      //
      // IMPORTANTE: NÃO awaitar aqui. O SSE é um único loop serial por
      // sessão; se uma mensagem demora (reabertura de ticket fechado dispara
      // handleWacallsBotFlow / download de mídia / resolveLidToPhone com
      // até 25s de timeout), TODAS as mensagens seguintes ficam presas
      // atrás — era exatamente o sintoma de "mandei mensagem depois de
      // fechar o atendimento e demorou ~1min pra chegar no chat". A
      // idempotência já é garantida por wid no HandleWacallsIncoming
      // (withLock + dedupe em Message), então processar em paralelo é
      // seguro. Erros são logados dentro do próprio handler.
      //
      // Mas "sem await" não pode virar "sem teto": handleEvent (função de
      // fora) retorna na hora pra esse case, então o limitador de
      // enqueueEvent não segura nada aqui — precisa do PRÓPRIO limitador,
      // senão uma rajada de mensagens (import de histórico) dispara isso
      // dezenas de vezes ao mesmo tempo e esgota o pool de conexões (ver
      // comentário grande em makeConcurrencyLimiter, acima).
      limitMessageDispatch(() =>
        handleWacallsChatMessagingEvent(whatsapp, ev).catch(err => {
          logger.error(`[wacalls-chat] erro assíncrono em ${ev.type}: ${err?.message}`);
        })
      );
      break;
    }
    case "group-participants": {
      // Entrada/saída de participantes de grupo (ver
      // wacalls-chat/cmd/server/session.go, case *events.GroupInfo).
      // Hoje só a entrada tem uso: dispara a saudação de novos membros
      // configurada por grupo no Gestor de Grupos.
      logger.info(
        `[GroupGreeting] evento group-participants recebido: acao=${ev.action} grupo=${ev.group}`
      );
      if (String(ev.action || "") !== "add") break;
      const jids: string[] = Array.isArray(ev.jids) ? ev.jids.map(String) : [];
      const grupo = String(ev.group || "");
      if (!grupo || jids.length === 0) break;

      // Import tardio de propósito: o GroupGreetingService importa `get`
      // DESTE arquivo, então um import no topo criaria um ciclo entre os dois
      // módulos. Carregar na hora do uso resolve sem truque nenhum.
      import("../GroupServices/GroupGreetingService").then(mod =>
        mod.default({
          companyId: whatsapp.companyId,
          whatsappId: whatsapp.id,
          groupJid: grupo,
          participantJids: jids
        })
      ).catch(err => {
        logger.warn(`[GroupGreeting] Falha na saudação do grupo ${grupo}: ${err?.message}`);
      });
      break;
    }
    case "receipt": {
      // Confirmação de entrega/leitura (✓✓ cinza → azul) — ver
      // wacalls-chat/cmd/server/receipts.go pro lado que emite isso e o
      // mapeamento de ReceiptType pra ack. HandleWacallsAck já existia
      // (mesmo padrão do handleMsgAck do Baileys) mas só era chamada pelo
      // webhook do wacalls-voip (substituído pelo SSE do wacalls-chat) —
      // ficava sem nenhum acionador de verdade, então o ack nunca avançava
      // pra "lido" no canal wacalls mesmo o WhatsApp confirmando a leitura.
      const ids: string[] = Array.isArray(ev.messageIds) ? ev.messageIds : [];
      const ack = Number(ev.ack) || 0;
      for (const wid of ids) {
        await HandleWacallsAck(String(wid), ack, whatsapp.companyId);
      }
      break;
    }
    case "presence": {
      // "digitando.../gravando áudio.../online" — mesma lógica de resolução
      // de contato (número/remoteJid/lid/WhatsappLidMap) que o Baileys usa
      // no handler presence.update (wbotMessageListener.ts), pra emitir no
      // MESMO socket event que o TicketInfo/Ticket do frontend já escuta
      // (company-{id}-presence) — nenhuma mudança de frontend é necessária.
      const peer = String(ev.peer || "");
      const rawNumber = peer.split("@")[0].split(":")[0];
      if (!peer || !rawNumber) break;

      const resolvedNumber = peer.includes("@lid") ? resolvePN(rawNumber) : null;
      const contactWhere: any[] = [
        { companyId: whatsapp.companyId, number: rawNumber },
        { companyId: whatsapp.companyId, remoteJid: peer },
        { companyId: whatsapp.companyId, lid: rawNumber },
        { companyId: whatsapp.companyId, lid: `${rawNumber}@lid` }
      ];
      if (resolvedNumber) {
        contactWhere.push({ companyId: whatsapp.companyId, number: resolvedNumber });
        contactWhere.push({ companyId: whatsapp.companyId, remoteJid: `${resolvedNumber}@s.whatsapp.net` });
      }

      let contact = await Contact.findOne({
        where: { [Op.or]: contactWhere },
        attributes: ["id", "number", "remoteJid", "lid"]
      });

      if (!contact && peer.includes("@lid")) {
        const lidMap = await WhatsappLidMap.findOne({
          where: { companyId: whatsapp.companyId, lid: { [Op.in]: [rawNumber, peer, `${rawNumber}@lid`] } },
          attributes: ["contactId"]
        });
        if (lidMap) {
          contact = await Contact.findOne({
            where: { id: lidMap.contactId, companyId: whatsapp.companyId },
            attributes: ["id", "number", "remoteJid", "lid"]
          });
        }
      }

      if (!contact) break;

      const ticket = await Ticket.findOne({
        where: {
          contactId: contact.id,
          companyId: whatsapp.companyId,
          whatsappId: whatsapp.id,
          status: { [Op.or]: ["open", "pending", "group", "chatbot", "nps", "lgpd"] }
        },
        attributes: ["id"],
        order: [["updatedAt", "DESC"]]
      });

      if (!ticket) break;

      const rawState = String(ev.state || "unavailable");
      // "paused" (parou de digitar, não ficou offline) mapeia pra
      // "available" — mesmo tratamento do Baileys, mantém "Online" visível
      // em vez de sumir o indicador toda vez que o contato para de digitar.
      const presenceState =
        rawState === "composing" && ev.media === "audio"
          ? "recording"
          : rawState === "paused"
            ? "available"
            : rawState;
      const lastSeen = ev.lastSeen ? Number(ev.lastSeen) : null;

      getIO().of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-presence`, {
        ticketId: ticket.id,
        contactId: contact.id,
        presence: presenceState,
        lastSeen
      });

      setLastPresence(whatsapp.companyId, ticket.id, presenceState, lastSeen, contact.id);
      break;
    }
    case "import-progress": {
      // Progresso do import de histórico do WhatsApp Plus (ver
      // RequestHistoryImport/finishHistoryImport em historyimport.go,
      // wacalls-chat) — reaproveita o MESMO evento/formato que o import do
      // canal Baileys já emite (company-{companyId}-importMessages, ver
      // ImportMessagesService.ts), pra não precisar de nenhuma mudança no
      // listener do frontend (Connections/index.js, useEffect
      // "handleProgress") além de já reconhecer o whatsappId certo.
      const stage = String(ev.stage || "importing");
      const processedChats = Number(ev.processedChats || 0);
      const totalChats = Number(ev.totalChats || 0);
      const importedMessages = Number(ev.importedMessages || 0);
      const detail =
        stage === "done"
          ? "Importação concluída!"
          : stage === "starting"
            ? `Pedido de histórico enviado para ${totalChats} conversa(s)...`
            : `${processedChats}/${totalChats} conversas processadas (${importedMessages} mensagens)`;

      getIO().of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-importMessages`, {
        action: "progress",
        stage,
        detail,
        whatsappId: whatsapp.id,
        totalChats,
        processedChats,
        totalMessages: importedMessages,
        totalTickets: 0,
        totalContacts: 0,
        errors: 0,
      });
      break;
    }
    // "chat-event" (notas internas, atribuição, etc. do wacalls-chat) não
    // tem equivalente no EquipeChat — ignorado por enquanto.
    default:
      break;
  }
};

/**
 * Mantém uma conexão SSE persistente com o wacalls-chat, reconectando com
 * backoff se cair. Chamar uma vez na inicialização do backend (bootstrap)
 * quando WACALLS_CHAT_URL estiver configurado.
 */
export const startWacallsChatEventLoop = (): void => {
  if (!isEnabled() || streamActive) return;
  streamActive = true;

  let backoffMs = 1000;
  const maxBackoffMs = 30000;

  const connect = async () => {
    let c: string;
    try {
      c = await ensureCookie();
    } catch (err: any) {
      logger.warn(`[wacalls-chat] login falhou, tentando de novo em ${backoffMs}ms: ${err?.message}`);
      scheduleReconnect();
      return;
    }

    const url = new URL(`${baseURL}/api/events`);
    const lib = url.protocol === "https:" ? https : http;
    let buffer = "";
    // Watchdog: o wacalls-chat manda um keepalive (": ping") a cada 20s
    // enquanto a conexão SSE estiver de fato viva e sendo lida pelo Node. Já
    // vimos em produção a conexão ficar "presa" — TCP local (127.0.0.1) sem
    // erro nem 'end', mas nenhum byte chega mais — e sem isso o loop nunca
    // percebe e fica esperando pra sempre um evento que nunca vai chegar.
    // Se passar 45s sem nem um keepalive, força reconexão.
    let lastDataAt = Date.now();
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      fn();
    };

    const req = lib.request(
      {
        method: "GET",
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers: { Cookie: c, Accept: "text/event-stream" }
      },
      res => {
        if (res.statusCode === 401) {
          // Cookie expirado NÃO é serviço fora do ar: basta relogar, o que
          // leva milissegundos. Usar o backoff progressivo aqui era um erro
          // caro — depois de alguns 401 seguidos ele chega a 30s, e durante
          // esse tempo NENHUMA mensagem chega (o SSE não repõe o que passou).
          // Era isso que fazia o recebimento "parar e voltar" sozinho.
          // Reconecta na hora e sem deixar o backoff crescer.
          cookie = null;
          logger.warn("[wacalls-chat] stream de eventos respondeu 401 (cookie expirado) — relogando imediatamente");
          finish(() => setTimeout(connect, 300));
          req.destroy();
          return;
        }
        if ((res.statusCode || 0) >= 400) {
          logger.warn(`[wacalls-chat] stream de eventos respondeu ${res.statusCode} — reconectando`);
          finish(scheduleReconnect);
          req.destroy();
          return;
        }
        backoffMs = 1000; // conexão OK, reseta o backoff
        logger.info("[wacalls-chat] conectado ao stream de eventos");
        // Toda (re)conexão reconcilia contra a verdade atual do wacalls-chat —
        // fecha a brecha de eventos únicos (pareou/deslogou) perdidos durante
        // uma conexão presa que só foi detectada pelo watchdog depois.
        reconcileSessions();
        lastDataAt = Date.now();
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          lastDataAt = Date.now();
          buffer += chunk;
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = raw.split("\n").find(l => l.startsWith("data:"));
            if (!line) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim());
              enqueueEvent(ev);
            } catch {}
          }
        });
        res.on("end", () => finish(scheduleReconnect));
      }
    );
    const watchdog = setInterval(() => {
      if (Date.now() - lastDataAt > 45000) {
        // Registra há quanto tempo o stream está mudo: é exatamente a janela
        // em que mensagens recebidas se perdem. Sem esse número no log não
        // dá pra saber se o problema é raro ou constante.
        const mudoPorSegundos = Math.round((Date.now() - lastDataAt) / 1000);
        logger.warn(`[wacalls-chat] stream de eventos sem dados (nem keepalive) há ${mudoPorSegundos}s — forçando reconexão`);
        finish(() => {
          scheduleReconnect();
          req.destroy();
        });
      }
    }, 15000);
    req.on("error", (err: any) => {
      logger.warn(`[wacalls-chat] stream de eventos caiu: ${err?.message}`);
      finish(scheduleReconnect);
    });
    req.end();
  };

  const scheduleReconnect = () => {
    setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
  };

  connect();
};

export default {
  isEnabled,
  createChatSession,
  deleteChatSession,
  pairChatSession,
  listChatSessions,
  fetchChatSessionQrOnce,
  dialChatCall,
  acceptChatCall,
  rejectChatCall,
  hangupChatCall,
  exchangeChatCallSdp,
  getSipSettings,
  setSipSettings,
  getSipStatus,
  dialSipCall,
  acceptSipCall,
  rejectSipCall,
  hangupSipCall,
  exchangeSipCallSdp,
  startWacallsChatEventLoop
};
