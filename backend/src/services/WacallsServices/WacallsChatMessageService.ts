import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import mimeLib from "mime-types";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";
import uploadConfig from "../../config/upload";
import { convertToMp3Sibling } from "../../utils/AudioUtils";
import HandleWacallsIncoming, { WacallsIncoming } from "./HandleWacallsIncoming";
import writeMediaDeduped from "../../helpers/DedupeMedia";
import { nomeDeContatoInvalido } from "../../helpers/NomeDeContato";

/**
 * Ponte de MENSAGEM com o wacalls-chat (github.com/raphaelbat/wacalls-chat).
 *
 * Substitui por completo o wacalls-voip pro canal "wacalls": tanto mensagem
 * quanto chamada agora passam pela mesma sessão pareada no wacalls-chat
 * (Whatsapp.wacallsChatSessionId) — um QR só, um serviço só.
 *
 * Autenticação: cookie de sessão (login com WACALLS_CHAT_EMAIL/PASSWORD),
 * igual ao WacallsChatCallService. Mantemos um cliente/cookie próprio aqui
 * (client HTTP separado, mesma conta de serviço) pra não acoplar os dois
 * arquivos — qualquer um funciona sozinho se o outro for removido no futuro.
 */

const baseURL = (process.env.WACALLS_CHAT_URL || "").replace(/\/$/, "");
const serviceEmail = process.env.WACALLS_CHAT_EMAIL || "";
const servicePassword = process.env.WACALLS_CHAT_PASSWORD || "";

export const isEnabled = (): boolean => !!(baseURL && serviceEmail && servicePassword);

let cookie: string | null = null;
let cookiePromise: Promise<string> | null = null;

const rawClient: AxiosInstance = axios.create({ baseURL, timeout: 30000 });

const login = async (): Promise<string> => {
  const { headers } = await rawClient.post(
    "/api/auth/login",
    { email: serviceEmail, password: servicePassword },
    { validateStatus: () => true }
  );
  const setCookie = (headers as any)["set-cookie"] as string[] | undefined;
  const found = setCookie?.map(c => c.split(";")[0]).find(c => c.startsWith("wacalls_session="));
  if (!found) throw new Error("Login do serviço de mensagens não retornou cookie de sessão");
  cookie = found;
  return found;
};

const ensureCookie = async (): Promise<string> => {
  if (cookie) return cookie;
  if (!cookiePromise) {
    cookiePromise = login().finally(() => {
      cookiePromise = null;
    });
  }
  return cookiePromise;
};

const call = async <T = any>(fn: (c: string) => Promise<{ status: number; data: T }>): Promise<T> => {
  const c = await ensureCookie();
  let res = await fn(c);
  if (res.status === 401) {
    cookie = null;
    const fresh = await ensureCookie();
    res = await fn(fresh);
  }
  if (res.status >= 400) {
    const msg = (res.data as any)?.error || `Serviço de mensagens respondeu ${res.status}`;
    throw new Error(msg);
  }
  return res.data;
};

const post = <T = any>(pathStr: string, body?: any) =>
  call<T>(c => rawClient.post(pathStr, body, { headers: { Cookie: c }, validateStatus: () => true }));

// --- utilidades de JID -------------------------------------------------------

export const buildJid = (number: string, isGroup: boolean): string => {
  const clean = String(number || "").split("@")[0];
  return `${clean}@${isGroup ? "g.us" : "s.whatsapp.net"}`;
};

const jidPath = (jid: string): string => encodeURIComponent(jid);

// --- envio -------------------------------------------------------------------

interface SendResult {
  id: string;
  ts?: number;
}

export const sendChatText = async (
  sessionId: string,
  jid: string,
  text: string,
  quotedId?: string | null
): Promise<SendResult> => {
  const data = await post<{ message: { id: string; ts: number } }>(
    `/api/sessions/${sessionId}/chats/${jidPath(jid)}/send`,
    { text, quotedId: quotedId || undefined }
  );
  return { id: data?.message?.id, ts: data?.message?.ts };
};


/**
 * Botões e listas nativas no WhatsApp Plus.
 *
 * Usa o MESMO endpoint de envio, que agora aceita `buttons` (resposta rápida)
 * ou `sections` (lista). Antes ele só aceitava `text`, e por isso toda mensagem
 * interativa do CRM era convertida em texto numerado antes de sair.
 *
 * O lado Go já reenvia como texto numerado por conta própria se o WhatsApp
 * recusar a mensagem interativa — então o contato nunca fica sem receber nada.
 */
export const sendChatButtons = async (
  sessionId: string,
  jid: string,
  text: string,
  botoes: { id?: string; title: string }[],
  footer?: string
): Promise<SendResult> => {
  const data = await post<{ message?: { id: string; ts: number }; kind?: string; warning?: string }>(
    `/api/sessions/${sessionId}/chats/${jidPath(jid)}/send`,
    { text, footer: footer || undefined, buttons: botoes }
  );
  // "kind": "buttons_fallback_text" = a mensagem FOI entregue, só o botão
  // nativo que falhou (o Go já reenviou como texto numerado sozinho). Antes
  // esse aviso não existia — o Go engolia o erro em silêncio e devolvia
  // "ok":true,"kind":"buttons" mesmo quando o botão de verdade não emplacava,
  // então não tinha como saber pelo log do backend o motivo real.
  if (data?.warning) {
    logger.warn(`[INTERACTIVE][wacalls] botão nativo falhou, entregue como texto numerado: ${data.warning}`);
  }
  return { id: data?.message?.id, ts: data?.message?.ts };
};

export const sendChatList = async (
  sessionId: string,
  jid: string,
  text: string,
  secoes: { title: string; rows: { id?: string; title: string; description?: string }[] }[],
  textoDoBotao?: string,
  footer?: string
): Promise<SendResult> => {
  const data = await post<{ message?: { id: string; ts: number }; kind?: string; warning?: string }>(
    `/api/sessions/${sessionId}/chats/${jidPath(jid)}/send`,
    {
      text,
      footer: footer || undefined,
      buttonText: textoDoBotao || undefined,
      sections: secoes
    }
  );
  if (data?.warning) {
    logger.warn(`[INTERACTIVE][wacalls] lista nativa falhou, entregue como texto numerado: ${data.warning}`);
  }
  return { id: data?.message?.id, ts: data?.message?.ts };
};

interface SendMediaParams {
  sessionId: string;
  jid: string;
  filePath: string;
  mimetype: string;
  filename: string;
  caption?: string;
  kind: "image" | "video" | "audio" | "document" | "sticker";
  seconds?: number;
  width?: number;
  height?: number;
  quotedId?: string | null;
}

export const sendChatMedia = async (params: SendMediaParams): Promise<SendResult> => {
  const {
    sessionId,
    jid,
    filePath,
    mimetype,
    filename,
    caption,
    kind,
    seconds,
    width,
    height,
    quotedId
  } = params;
  const c = await ensureCookie();
  const mediaSeconds = Number.isFinite(Number(seconds))
    ? Math.max(1, Math.ceil(Number(seconds)))
    : 0;

  const doSend = async (cookieHeader: string) => {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), { filename, contentType: mimetype });
    form.append("kind", kind);
    if (caption) form.append("caption", caption);
    form.append("filename", filename);
    if (quotedId) form.append("quotedId", String(quotedId));
    // Igual ao Baileys: áudio E vídeo vão com duração explícita (e o vídeo
    // ainda com largura/altura), calculadas por ffprobe aqui no Node.
    if ((kind === "audio" || kind === "video") && mediaSeconds > 0) {
      form.append("seconds", String(mediaSeconds));
    }
    if (kind === "video") {
      if (Number(width) > 0) form.append("width", String(Math.round(Number(width))));
      if (Number(height) > 0) form.append("height", String(Math.round(Number(height))));
    }

    return rawClient.post(`/api/sessions/${sessionId}/chats/${jidPath(jid)}/media`, form, {
      headers: { ...form.getHeaders(), Cookie: cookieHeader },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true
    });
  };

  let res = await doSend(c);
  if (res.status === 401) {
    cookie = null;
    const fresh = await ensureCookie();
    res = await doSend(fresh);
  }
  if (res.status >= 400) {
    throw new Error((res.data as any)?.error || `Serviço de mensagens respondeu ${res.status}`);
  }
  const data = res.data as { message: { id: string; ts: number } };
  return { id: data?.message?.id, ts: data?.message?.ts };
};

export const editChatMessage = async (sessionId: string, jid: string, messageId: string, text: string) => {
  return post(`/api/sessions/${sessionId}/chats/${jidPath(jid)}/messages/${encodeURIComponent(messageId)}/edit`, { text });
};

export const deleteChatMessage = async (sessionId: string, jid: string, messageId: string) => {
  return post(`/api/sessions/${sessionId}/chats/${jidPath(jid)}/messages/${encodeURIComponent(messageId)}/delete`, {});
};

/**
 * Reação/curtir numa mensagem. Requer o endpoint /react no wacalls-chat
 * (ver wacalls-chat-reacoes-PATCH.md — precisa ser aplicado manualmente no
 * repo Go, não faz parte desta ponte Node).
 */
export const sendChatReaction = async (sessionId: string, jid: string, messageId: string, emoji: string) => {
  return post<{ message: { id: string; ts: number } }>(
    `/api/sessions/${sessionId}/chats/${jidPath(jid)}/messages/${encodeURIComponent(messageId)}/react`,
    { emoji }
  );
};

export const markChatRead = async (sessionId: string, jid: string) => {
  try {
    await post(`/api/sessions/${sessionId}/chats/${jidPath(jid)}/read`, {});
  } catch (err: any) {
    logger.debug(`[wacalls-chat] markChatRead falhou: ${err?.message}`);
  }
};

interface ChatMetaResult {
  name?: string;
  avatarUrl?: string;
}

/**
 * Resolve nome+foto de um chat direto no whatsmeow (POST .../sync), síncrono
 * na resposta HTTP — não precisa esperar SSE. Substitui o antigo fallback
 * que chamava getWacallsProfilePicture do wacalls-voip (serviço removido,
 * sempre falhava e por isso a foto do contato nunca aparecia).
 */
export const syncChatMeta = async (sessionId: string, jid: string): Promise<ChatMetaResult | null> => {
  try {
    const data = await post<{ meta: { name?: string; avatarUrl?: string } }>(
      `/api/sessions/${sessionId}/chats/${jidPath(jid)}/sync`,
      {}
    );
    return { name: data?.meta?.name, avatarUrl: data?.meta?.avatarUrl };
  } catch (err: any) {
    logger.debug(`[wacalls-chat] syncChatMeta falhou pra ${jid}: ${err?.message}`);
    return null;
  }
};

// --- download de mídia/avatar (o wacalls-chat serve /api/media/* atrás de
// auth por cookie — o navegador não consegue buscar direto, então baixamos
// aqui no backend e re-hospedamos em /public, igual o Baileys já faz) -------

/**
 * Extensão a partir do content-type. Antes essa função conhecia só 7 tipos
 * (jpg/png/webp/mp4/ogg/mp3/pdf) e devolvia "" pra todo o resto — então
 * documento do Word/Excel, zip, gif, opus e afins eram salvos SEM extensão
 * nenhuma, e o arquivo baixava sem extensão/com extensão errada (o bug
 * relatado). Agora usa a tabela do mime-types (mesma lib já usada no envio
 * de mídia do Baileys), mantendo à mão só os casos em que a escolha da lib
 * atrapalha na prática.
 */
/**
 * Extensões que NUNCA devem ser gravadas: são registradas nas tabelas MIME
 * (e às vezes vêm como primeira opção da lib/stdlib), mas celular, WhatsApp e
 * navegador não abrem o arquivo. `.f4v` foi exatamente o caso que fez todo
 * vídeo do WhatsApp Plus chegar "quebrado" no cliente. Qualquer extensão
 * derivada de MIME passa por aqui antes de virar nome de arquivo.
 */
const EXT_FIX: Record<string, string> = {
  ".f4v": ".mp4",
  ".m4v": ".mp4",
  ".m1v": ".mp4",
  ".oga": ".ogg",
  ".opus": ".ogg",
  ".mpga": ".mp3",
  ".jpe": ".jpg",
  ".jpeg": ".jpg",
  ".3g2": ".3gp",
  ".qt": ".mov"
};

export const sanitizeMediaExt = (ext: string): string => {
  const e = String(ext || "").toLowerCase();
  if (!e) return "";
  const withDot = e.startsWith(".") ? e : `.${e}`;
  return EXT_FIX[withDot] || withDot;
};

const extFromMime = (mimeType: string): string => {
  const m = String(mimeType || "").toLowerCase().split(";")[0].trim();
  if (!m) return "";

  // Casos que preferimos fixar: a lib devolve ".oga" pra audio/ogg e
  // ".mpga" pra audio/mpeg — extensões que players e o próprio WhatsApp
  // lidam pior do que .ogg/.mp3.
  if (m.includes("ogg")) return ".ogg";
  if (m === "audio/mpeg" || m === "audio/mp3") return ".mp3";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m === "video/mp4") return ".mp4";

  const fromLib = mimeLib.extension(m);
  return fromLib ? sanitizeMediaExt(fromLib) : "";
};

/**
 * Baixa um asset servido pelo wacalls-chat (`/api/media/...`, sempre relativo)
 * e salva em `public/company{companyId}/[subdir/]`, devolvendo o caminho
 * relativo (a partir de `company{companyId}/`) que o restante do EquipeChat
 * já sabe servir (mesmo padrão do Baileys).
 *
 * `subdir` existe pra poder salvar fotos de contato em `contacts/`, igual
 * o Baileys faz (CreateOrUpdateContactService.ts) — o getter `urlPicture` do
 * model Contact monta a URL final assumindo que o arquivo mora em
 * `company{id}/contacts/{arquivo}`, então quem chama pra avatar PRECISA usar
 * subdir="contacts" e gravar só o nome do arquivo (sem prefixo nenhum) no
 * campo `urlPicture` — ver ensureContactAvatar abaixo.
 */
export const downloadAndSaveAsset = async (
  relativePath: string,
  companyId: number,
  filenameHint?: string,
  subdir?: string
): Promise<string | null> => {
  if (!relativePath) return null;
  // Sem companyId válido o arquivo ia parar em "public/companynull/", pasta
  // que nenhum getter de imagem consegue montar de volta (o front monta o
  // caminho a partir do companyId real do contato). Resultado: arquivo
  // baixado, disco ocupado, e a foto nunca aparecendo. Melhor falhar cedo e
  // registrar do que gravar num lugar que ninguém lê.
  if (!companyId || Number.isNaN(Number(companyId))) {
    logger.warn(
      `[wacalls-chat] downloadAndSaveAsset chamado sem companyId válido (recebido: ${companyId}) — download ignorado para não gravar em companynull/`
    );
    return null;
  }
  try {
    const c = await ensureCookie();
    const fetchOnce = (cookieHeader: string) =>
      rawClient.get(relativePath, {
        headers: { Cookie: cookieHeader },
        responseType: "arraybuffer",
        validateStatus: () => true
      });

    let res = await fetchOnce(c);
    if (res.status === 401) {
      cookie = null;
      const fresh = await ensureCookie();
      res = await fetchOnce(fresh);
    }
    if (res.status >= 400) {
      // Antes esse caso retornava null em silêncio: a foto simplesmente não
      // aparecia e não havia nenhum rastro no log pra saber por quê (foi o
      // que dificultou o diagnóstico do caso "empresa 1 sem foto").
      logger.warn(
        `[wacalls-chat] download de asset falhou (HTTP ${res.status}) companyId=${companyId} path=${relativePath}`
      );
      return null;
    }

    const mime = String(res.headers?.["content-type"] || "");
    const dir = path.join(
      uploadConfig.directory || path.resolve(__dirname, "../../../public"),
      `company${companyId}`,
      subdir || ""
    );
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (mkErr: any) {
      // Falha de permissão aqui (pasta criada por outro usuário numa
      // instalação antiga, por exemplo) fazia a foto sumir sem nenhum aviso.
      logger.error(
        `[wacalls-chat] não consegui criar/acessar a pasta de destino ${dir}: ${mkErr?.message}`
      );
      return null;
    }

    // Hash do CONTEÚDO (não da URL): a mesma mídia reenviada/reencaminhada,
    // ou re-emitida num history sync, chega com URL diferente a cada vez e
    // gerava um arquivo novo no disco toda vez (principal fonte da mídia
    // "duplicando" e do disco subindo dezenas de GB por dia). Com o hash do
    // conteúdo no nome, a segunda ocorrência simplesmente reaproveita o
    // arquivo que já existe.
    const buffer = Buffer.from(res.data);
    const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 16);
    const mimeExt = extFromMime(mime);

    // Nome do arquivo é DETERMINÍSTICO pelo conteúdo (igual o Baileys, que
    // grava uma vez por mídia). O `filenameHint` do wacalls-chat embute o ID
    // da mensagem/mídia do WhatsApp, que muda a cada re-emissão do evento SSE
    // (a mesma mensagem chega várias vezes: sem mídia, com mídia, no history
    // sync, no reconnect). Com o ID no nome, cada evento gerava um arquivo
    // novo — foi assim que o mesmo vídeo de 163 MB apareceu 7 vezes. Agora o
    // nome depende só do hash do conteúdo (+ nome original quando é
    // documento), então a segunda ocorrência cai exatamente no mesmo arquivo.
    let displayBase = "";
    if (filenameHint) {
      const cleaned = filenameHint.replace(/[^\w.\-]+/g, "_");
      const ext = path.extname(cleaned);
      const stem = ext ? cleaned.slice(0, -ext.length) : cleaned;
      // Descarta stems que são só ID de mídia/mensagem do WhatsApp
      // (hex/base32 longo, sem nome humano) — eles são a parte variável.
      const looksLikeId = /^[A-Za-z0-9_]{14,}$/.test(stem);
      if (!looksLikeId && stem) {
        const fixedExt = ext ? sanitizeMediaExt(ext) : mimeExt;
        displayBase = `${stem}${fixedExt || ""}`;
      }
    }

    const finalName = displayBase
      ? `${hash}-${displayBase}`
      : `wacalls-${hash}${mimeExt}`;
    const finalPath = path.join(dir, finalName);

    // Já existe no disco com o mesmo tamanho? É o mesmo conteúdo — reaproveita
    // sem gravar nada (não baixamos duas vezes o mesmo byte pra disco).
    let alreadyStored = false;
    try {
      const stat = fs.statSync(finalPath);
      alreadyStored = stat.isFile() && stat.size === buffer.length;
    } catch {
      alreadyStored = false;
    }

    if (!alreadyStored) {
      // writeMediaDeduped ainda garante hardlink quando o MESMO conteúdo
      // precisa aparecer com outro nome (documentos com nomes diferentes).
      await writeMediaDeduped(path.dirname(finalPath), path.basename(finalPath), buffer);
    }


    // `media/in` e `media/out` no wacalls-chat são apenas áreas
    // intermediárias: o arquivo definitivo usado pelo CRM acabou de ser
    // gravado em public/companyN. Confirma o consumo só depois de gravar;
    // assim não mantemos duas cópias de toda mídia (isso chegou a 89 GB).
    if (relativePath.startsWith("/api/media/in/") || relativePath.startsWith("/api/media/out/")) {
      rawClient.delete(relativePath, {
        headers: { Cookie: cookie || c },
        validateStatus: () => true
      }).catch((err: any) => {
        logger.debug(`[wacalls-chat] limpeza da mídia intermediária falhou (${relativePath}): ${err?.message}`);
      });
    }
    return `company${companyId}${subdir ? `/${subdir}` : ""}/${finalName}`;

  } catch (err: any) {
    logger.debug(`[wacalls-chat] downloadAndSaveAsset falhou (${relativePath}): ${err?.message}`);
    return null;
  }
};

/**
 * Remove no wacalls-chat um arquivo intermediário de media/in ou media/out que
 * o EquipeChat não precisa baixar (já tem a cópia definitiva em public).
 */
export const discardWacallsIntermediateMedia = async (relativePath: string): Promise<void> => {
  if (!relativePath) return;
  if (!relativePath.startsWith("/api/media/in/") && !relativePath.startsWith("/api/media/out/")) return;
  try {
    const c = await ensureCookie();
    await rawClient.delete(relativePath, {
      headers: { Cookie: c },
      validateStatus: () => true
    });
  } catch (err: any) {
    logger.debug(`[wacalls-chat] descarte de mídia intermediária falhou (${relativePath}): ${err?.message}`);
  }
};



// --- tradução de eventos SSE (message / chat-meta) --------------------------
// É isso aqui que substitui o webhook do wacalls-voip: em vez de receber um
// POST do microserviço Go, escutamos o mesmo stream de eventos que já
// alimenta as chamadas (WacallsChatCallService.startWacallsChatEventLoop) e
// viramos os eventos de mensagem/contato nas mesmas rotinas de sempre
// (HandleWacallsIncoming → CreateOrUpdateContactService/FindOrCreateTicket/
// CreateMessageService), pra não reinventar ticket/fila/grupo.

const MEDIA_KINDS = new Set(["image", "video", "audio", "ptt", "voice", "document", "sticker"]);

/**
 * Garante que o contato tenha foto, buscando no wacalls-chat sob demanda
 * (best-effort, não bloqueia o processamento da mensagem). Só dispara quando
 * o contato ainda não tem foto salva.
 *
 * Recebe o Contact JÁ RESOLVIDO (retornado por HandleWacallsIncoming) em vez
 * de buscar de novo por remoteJid+channel: essa segunda busca independente é
 * frágil — o contato pode ter sido reaproveitado de outro canal (a busca
 * parcial por número em CreateOrUpdateContactService não filtra por canal) ou
 * o remoteJid salvo pode não bater 100% com o jid bruto do evento (ex: LID
 * vs PN) — em qualquer um desses casos o findOne independente voltava vazio
 * e a foto nunca era atualizada, mesmo com tudo funcionando corretamente até
 * aqui. Reaproveitar o mesmo registro elimina essa classe inteira de bug.
 */
// ─── CACHE NEGATIVO DE FOTO DE PERFIL ──────────────────────────────────────
//
// `syncChatMeta` não é uma consulta local: ela vai por HTTP até o
// wacalls-chat, que chama `GetProfilePictureInfo` — uma requisição à REDE do
// WhatsApp (contactsync.go:91).
//
// O guarda logo abaixo (`if (!hasNoPic && !hasNoUrlPicture) return`) só evita
// a chamada quando o contato JÁ TEM foto. Para quem não tem — contato com
// privacidade de foto ligada, ou que simplesmente nunca pôs uma — o teste dá
// "sem foto" para sempre, e a consulta era refeita a CADA mensagem daquele
// contato, indefinidamente.
//
// Custo real por mensagem, nesse caso: 1 requisição HTTP interna + 1 ida à
// rede do WhatsApp + 1 goroutine + 1 uso da conexão SQLite única do serviço
// Go. Fora a latência, isso conta para o rate-limit da conta no WhatsApp —
// e rate-limit ali costuma aparecer como desconexão.
//
// 6 horas é um meio-termo: quem PÕE uma foto de perfil pela primeira vez
// passa a aparecer em no máximo 6h. Note que isto não atrasa TROCA de foto:
// contato que já tem foto nunca chega aqui (sai no guarda anterior) e
// continua sendo atualizado pelo caminho normal.
//
// O cache é só de processo. Reiniciar o backend limpa tudo e a primeira
// mensagem de cada contato volta a consultar — que é o comportamento
// desejado, não um problema.
//
// `esquecerSemFoto` existe para quando alguém quiser forçar a re-checagem de
// um contato específico sem esperar o TTL.
const SEM_FOTO_TTL_MS = 6 * 60 * 60 * 1000;
const SEM_FOTO_TETO = 20000;

const contatosSemFoto = new Map<string, number>();

const marcarSemFoto = (chave: string): void => {
  if (contatosSemFoto.size >= SEM_FOTO_TETO) {
    const agora = Date.now();
    for (const [k, expiraEm] of contatosSemFoto) {
      if (expiraEm <= agora) contatosSemFoto.delete(k);
    }
    if (contatosSemFoto.size >= SEM_FOTO_TETO) {
      const primeiro = contatosSemFoto.keys().next();
      if (!primeiro.done) contatosSemFoto.delete(primeiro.value);
    }
  }
  contatosSemFoto.set(chave, Date.now() + SEM_FOTO_TTL_MS);
};

const marcadoSemFoto = (chave: string): boolean => {
  const expiraEm = contatosSemFoto.get(chave);
  if (expiraEm === undefined) return false;
  if (expiraEm <= Date.now()) {
    contatosSemFoto.delete(chave);
    return false;
  }
  return true;
};

/**
 * Esquece a marca de "sem foto" de um contato, forçando a próxima mensagem
 * dele a consultar o WhatsApp de novo.
 */
export const esquecerSemFoto = (companyId: number, jid: string): void => {
  contatosSemFoto.delete(`${companyId}:${jid}`);
};

const ensureContactAvatar = async (
  whatsapp: Whatsapp,
  sessionId: string,
  jid: string,
  isGroup: boolean,
  contact: Contact | null
): Promise<void> => {
  if (!jid || !contact) return;
  try {
    // urlPicture é uma coluna com getter (models/Contact.ts) — lendo
    // contact.urlPicture normal você pega a URL já montada, não o valor cru
    // salvo no banco. Pra decidir se precisa (re)sincronizar, olha o valor
    // cru: um nome de arquivo válido (convenção Baileys, ex "46.jpeg") nunca
    // tem "/". Contatos que ficaram com o valor cru cheio (bug antigo desta
    // função, que salvava "/public/companyN/arquivo.jpg" em vez do nome
    // puro) ficam presos pra sempre com foto quebrada se a gente só olhar
    // "tem algo ou não" — por isso trata qualquer valor cru com "/" como
    // inválido também, forçando a resincronizar e se autocorrigir.
    const rawUrlPicture = String(contact.getDataValue("urlPicture") || "");
    const hasNoPic = !(contact as any).profilePicUrl || String((contact as any).profilePicUrl).includes("nopicture");
    const hasNoUrlPicture = !rawUrlPicture || rawUrlPicture.includes("nopicture") || rawUrlPicture.includes("/");
    if (!hasNoPic && !hasNoUrlPicture) return;

    // Já sabemos há pouco tempo que este contato não tem foto: não gasta uma
    // ida à rede do WhatsApp de novo. Ver comentário do cache acima.
    const chaveSemFoto = `${whatsapp.companyId}:${jid}`;
    if (marcadoSemFoto(chaveSemFoto)) return;

    const meta = await syncChatMeta(sessionId, jid);

    // ── NOME DO CONTATO ──────────────────────────────────────────────────
    //
    // O syncChatMeta devolve `name` para conversa individual também, mas esse
    // valor só era aproveitado quando `isGroup` — para contato comum era
    // simplesmente descartado. Era por isso que, no WhatsApp Plus, o contato
    // ficava para sempre com o número no lugar do nome: se a mensagem chegasse
    // sem pushName (acontece quando quem escreve está com privacidade ligada,
    // ou em evento fromMe), nada mais preenchia o nome depois.
    //
    // O nome do WhatsApp também vale para contato individual — mas SÓ quando o
    // nome atual não presta (é o próprio número, um LID ou um número
    // mascarado). Nome editado à mão no painel nunca é sobrescrito: é a mesma
    // regra que o CreateOrUpdateContactService aplica.
    //
    // Este bloco subiu para ANTES do teste de avatar. Antes ele ficava depois
    // do `if (!meta?.avatarUrl) return`, então o nome só era corrigido para
    // contato QUE TINHA FOTO — quem não tinha ficava com o número no lugar do
    // nome para sempre, mesmo com o WhatsApp informando o nome certo.
    const patch: any = {};
    if (meta?.name && meta.name !== contact.name) {
      if (isGroup) {
        patch.name = meta.name;
      } else if (nomeDeContatoInvalido(contact.name) && !nomeDeContatoInvalido(meta.name)) {
        patch.name = meta.name;
        logger.info(
          `[wacalls-chat] Nome do contato ${contact.id} preenchido pelo WhatsApp: "${contact.name}" -> "${meta.name}"`
        );
      }
    }

    const aplicarPatch = async (): Promise<void> => {
      if (Object.keys(patch).length === 0) return;
      await contact.update(patch);
      const { getIO } = await import("../../libs/socket");
      getIO().of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-contact`, {
        action: "update",
        contact
      });
    };

    if (!meta?.avatarUrl) {
      marcarSemFoto(chaveSemFoto);
      await aplicarPatch();
      return;
    }

    // Salva em contacts/ e grava só o nome do arquivo em urlPicture — é o
    // campo que o front-end usa de verdade pra montar o <img>, via getter em
    // models/Contact.ts (`.../public/company{id}/contacts/{urlPicture}`).
    // Gravar um caminho já prefixado aqui (como "/public/company1/foo.jpg")
    // fazia o getter duplicar o prefixo e o pedido de imagem virar
    // ".../public/company1/contacts//public/company1/foo.jpg" (404 com
    // ERR_SESSION_EXPIRED) — era exatamente o bug de "foto não aparece".
    const saved = await downloadAndSaveAsset(meta.avatarUrl, whatsapp.companyId, undefined, "contacts");
    if (!saved) {
      // Tem avatarUrl mas o download falhou: aplica pelo menos o nome e não
      // marca como "sem foto" — o problema aqui é de download, não de
      // ausência de foto, e pode ser transitório.
      await aplicarPatch();
      return;
    }
    const filename = saved.split("/").pop();
    if (!filename) {
      await aplicarPatch();
      return;
    }

    patch.profilePicUrl = meta.avatarUrl;
    patch.urlPicture = filename;

    await aplicarPatch();
  } catch (err: any) {
    logger.debug(`[wacalls-chat] ensureContactAvatar falhou pra ${jid}: ${err?.message}`);
  }
};

// Mensagens de mídia chegam em DUAS mensagens SSE "message" com o mesmo id:
// a primeira sem mediaUrl (assim que o texto/kind é conhecido), e uma
// segunda depois que o download assíncrono no wacalls-chat termina. Só
// processamos quando já tem mídia (ou quando não é mídia), senão
// HandleWacallsIncoming ia deduplicar pelo wid e a mídia nunca chegaria.
const processChatMessagingEvent = async (whatsapp: Whatsapp, ev: any): Promise<void> => {
  if (!ev || !ev.type) return;

  if (ev.type === "message") {
    const m = ev.message || {};
    const rawKind: string = m.kind || "text";
    const kind: string = rawKind === "ptt" || rawKind === "voice" ? "audio" : rawKind;
    logger.debug(`[wacalls-chat] message recebida whatsappId=${whatsapp.id} id=${m.id} chat=${m.chatJid} kind=${kind} fromMe=${!!m.fromMe} temMediaUrl=${!!m.mediaUrl} edited=${!!m.edited} deleted=${!!m.deleted}`);

    // ------------------------------------------------------------------
    // Status ("recado"), canal e lista de transmissão: descarta na entrada.
    //
    // O Status de TODOS os contatos da agenda chega aqui como mensagem
    // comum. O Baileys sempre descartou isso no isValidMsg; o WhatsApp Plus
    // não tinha equivalente, então cada recado postado por qualquer contato
    // era baixado e gravado na pasta public — e logo depois DESCARTADO pelo
    // pickPeerJid do HandleWacallsIncoming, que recusa status@broadcast.
    // Resultado: dezenas de GB por dia de arquivo órfão, que nunca virou
    // ticket e ninguém nunca viu. Este é o motivo do disco encher sozinho
    // "sem ninguém usando".
    //
    // A checagem também existe no Go (messageapi.go, isStatusOrChannelJID),
    // que é onde o download realmente começa. Esta aqui é rede de segurança:
    // garante a correção mesmo numa VPS que ainda não recompilou o
    // wacalls-chat.
    // ------------------------------------------------------------------
    const chatJid = String(m.chatJid || "");
    if (
      chatJid === "status@broadcast" ||
      chatJid.endsWith("@broadcast") ||
      chatJid.endsWith("@newsletter")
    ) {
      if (m.mediaUrl) {
        // O Go já baixou o arquivo intermediário antes de mandar o evento.
        // Apaga agora, senão ele fica encalhado em wacalls-chat/media.
        await discardWacallsIntermediateMedia(m.mediaUrl);
      }
      logger.debug(`[wacalls-chat] status/canal ignorado (${chatJid})`);
      return;
    }

    // Edição/exclusão de mensagem já existente: o wacalls-chat reemite o
    // mesmo evento "message" (mesmo id) com edited/deleted=true em vez de
    // mandar um tipo de evento separado. Se deixasse cair no fluxo normal
    // abaixo, o dedupe por wid do HandleWacallsIncoming ia simplesmente
    // ignorar (mensagem já existe) e a edição/exclusão nunca refletia —
    // por isso trata aqui, direto na Message local, igual o webhook do
    // wacalls-voip já fazia pros casos message.edited/message.revoked.
    if (m.edited || m.deleted) {
      try {
        const { default: Message } = await import("../../models/Message");
        const { getIO } = await import("../../libs/socket");
        const msg = await Message.findOne({ where: { wid: m.id, companyId: whatsapp.companyId } });
        if (msg) {
          if (m.deleted) {
            await msg.update({ isDeleted: true } as any);
          } else {
            await msg.update({ body: m.body || msg.body, isEdited: true } as any);
          }
          getIO().of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-appMessage`, {
            action: "update",
            message: msg
          });
        }
      } catch (err: any) {
        logger.debug(`[wacalls-chat] erro processando edição/exclusão de ${m.id}: ${err?.message}`);
      }
      return;
    }

    if (MEDIA_KINDS.has(rawKind) && !m.mediaUrl) {
      // ainda sem mídia baixada no lado do wacalls-chat — espera o próximo evento
      return;
    }

    // Mídia já baixada pra ESTA mensagem: não baixa de novo. É o mesmo
    // comportamento do Baileys (wbotMessageListener), que baixa uma única vez
    // por wid. O wacalls-chat reemite o mesmo evento "message" várias vezes
    // (sem mídia, com mídia, no history sync, a cada reconnect do SSE, e como
    // eco das mensagens que nós mesmos enviamos). Sem essa checagem, cada
    // re-emissão baixava e gravava o arquivo outra vez — foi o que multiplicou
    // o mesmo vídeo por 7 no disco. Se a Message já tem mediaUrl local, só
    // descarta o intermediário no Go e sai.
    if (m.mediaUrl && m.id) {
      try {
        const { default: Message } = await import("../../models/Message");
        const existing = await Message.findOne({
          where: { wid: String(m.id), companyId: whatsapp.companyId }
        });
        if (existing && (existing as any).getDataValue?.("mediaUrl")) {
          await discardWacallsIntermediateMedia(m.mediaUrl);
          return;
        }
      } catch (err: any) {
        logger.debug(`[wacalls-chat] checagem de mídia já persistida falhou (${m.id}): ${err?.message}`);
      }
    }

    let localMediaUrl: string | undefined;
    if (m.mediaUrl) {
      const saved = await downloadAndSaveAsset(m.mediaUrl, whatsapp.companyId, m.fileName);

      // Gera o .mp3 irmão do áudio recebido — sem isso, o player do CRM
      // (AudioModalCustom.getAudioSource) tenta um .mp3 que nunca existiu
      // pra iOS/Safari, cai pro .ogg cru, e o Safari toca normal mas mostra
      // duração "0:00"/errada (era o "áudio no iPhone sai zerado"
      // relatado — só existia esse fallback pro lado de ENVIO, nunca pro de
      // recebimento no canal WhatsApp Plus). Best-effort: se falhar, o
      // áudio ainda funciona em tudo que não seja iOS/Safari.
      if (saved && kind === "audio") {
        const fullPath = path.join(
          uploadConfig.directory || path.resolve(__dirname, "../../../public"),
          saved
        );
        convertToMp3Sibling(fullPath).catch((err: any) => {
          logger.warn(`[wacalls-chat] falha ao gerar mp3 irmão do áudio recebido: ${err?.message}`);
        });
      }
      // Message.mediaUrl é uma GETTER no model (models/Message.ts) que já
      // monta sozinha `${BACKEND_URL}/public/company{id}/` em cima do valor
      // cru salvo no banco. Se a gente já grava o path com "/public/companyN/"
      // aqui, o getter duplica o prefixo
      // (".../public/company1//public/company1/arquivo.jpg") e a imagem/
      // vídeo nunca carrega — era exatamente o bug reportado (imagem some,
      // mas documento "funciona" porque o card de PDF não faz requisição
      // nenhuma pra desenhar, só monta o link de download). Guarda só o
      // nome do arquivo, que é o que o getter espera (igual o Baileys já
      // faz em wbotMessageListener.ts).
      if (saved) localMediaUrl = saved.split("/").pop();
    }

    const isGroup = String(m.chatJid || "").endsWith("@g.us") || String(m.chatJid || "").endsWith("@newsletter") || String(m.chatJid || "").endsWith("@broadcast");

    // Mensagem de grupo só entra se a conexão permitir — mesmo gate que o
    // Baileys já aplica (wbotMessageListener.ts: `!whatsapp.allowGroup &&
    // isGroup`). Sem isso, toda mensagem de grupo virava ticket mesmo com o
    // toggle "grupos" desligado na conexão.
    if (isGroup && !whatsapp.allowGroup) {
      logger.debug(`[wacalls-chat] mensagem de grupo ignorada (allowGroup=false) na conexão ${whatsapp.name} (id=${whatsapp.id}), chat=${m.chatJid}`);
      return;
    }

    // Reação (curtir) chega como "message" com kind="reaction": body é o
    // emoji, mediaMime é reaproveitado pelo wacalls-chat pra guardar o id da
    // mensagem-alvo (mesma convenção usada tanto pra reação recebida quanto
    // pra reação que a gente manda via /react). Mapeia pro mediaType
    // "reactionMessage" que o frontend já sabe renderizar grudado na
    // mensagem original (via quotedMsg), igual funciona hoje pra Telegram.
    const isReaction = kind === "reaction";

    const incoming: WacallsIncoming = {
      sessionId: ev.sessionId,
      from: m.senderJid || m.chatJid,
      chat: m.chatJid,
      groupJid: isGroup ? m.chatJid : undefined,
      isGroup,
      id: m.id,
      fromMe: !!m.fromMe,
      type: isReaction ? "reactionMessage" : ((kind as any) || "text"),
      text: kind === "text" ? m.body : undefined,
      caption: isReaction ? m.body : (kind !== "text" ? m.body : undefined),
      // Reação: o wid da mensagem-alvo vem em mediaMime (convenção do
      // wacalls-chat). Resposta comum: vem em quotedId — que ANTES era
      // ignorado aqui, e por isso a bolha de citação nunca aparecia quando
      // o cliente respondia citando uma mensagem.
      quotedWid: isReaction ? m.mediaMime : (m.quotedId || undefined),
      mediaUrl: localMediaUrl,
      mimetype: isReaction ? undefined : m.mediaMime,
      filename: m.fileName,
      timestamp: m.ts,
      pushName: m.senderName,
      // Endereço alternativo (LID<->PN) que o whatsmeow já resolveu de graça
      // no lado do wacalls-chat (Info.SenderAlt — ver messageRowFromEvent em
      // wacalls-chat/cmd/server/messageapi.go). Equivalente ao
      // `msg.key.senderPn` do Baileys — primeira prioridade de resolução
      // LID→PN em HandleWacallsIncoming.ts (processIncoming).
      senderAltJid: m.senderAltJid || undefined,
      // Status/fila forçados pelo operador no prompt de import de histórico
      // (wacalls-chat só preenche m.ticketStatus/m.ticketQueueId quando esta
      // mensagem veio de handleHistorySync — ver MessageRow.TicketStatus/
      // TicketQueueID em messagestore.go); undefined em mensagem ao vivo
      // normal. ticketQueueId chega como string do Go — converte pra number
      // aqui (Ticket.queueId é number no Sequelize).
      forcedTicketStatus: m.ticketStatus || undefined,
      forcedQueueId: m.ticketQueueId ? parseInt(m.ticketQueueId, 10) || undefined : undefined
    };

    let resolvedContact: Contact | null = null;
    try {
      resolvedContact = await HandleWacallsIncoming(whatsapp, incoming);
    } catch (err: any) {
      logger.error(`[wacalls-chat] erro processando message ${m.id}: ${err?.message}`);
    }

    // Busca de foto do contato em segundo plano (não atrasa a mensagem). O
    // fallback antigo dependia do wacalls-voip (getWacallsProfilePicture),
    // que não existe mais — por isso a foto nunca aparecia. Agora usa o
    // próprio wacalls-chat via syncChatMeta, reaproveitando o MESMO Contact
    // que HandleWacallsIncoming acabou de resolver (ver comentário em
    // ensureContactAvatar sobre por que uma busca independente falhava).
    // SEMPRE usa o chatJid (a conversa), nunca o senderJid.
    //
    // Numa mensagem ENVIADA por nós (fromMe), senderJid é o número da
    // PRÓPRIA CONEXÃO — então buscar a foto por ele trazia o avatar do dono
    // da conexão e gravava no contato: era exatamente o "foto dos contatos
    // pegando a foto do dono da conexão". Em conversa individual o chatJid
    // já É o contato, e em grupo é o próprio grupo (que é o contato do
    // ticket), então chatJid é o valor certo nos dois casos.
    // ── POR QUE NÃO USAR m.chatJid DIRETO EM CONVERSA INDIVIDUAL ────────────
    //
    // Este era o motivo de "uma hora aparece a foto, outra hora não".
    //
    // Quando o contato é endereçado por LID, `m.chatJid` chega como
    // "1234567890@lid". O syncChatMeta não devolve avatar para um LID, então a
    // busca voltava vazia e o contato ficava sem foto. Na mensagem seguinte,
    // se o mesmo chat viesse pelo telefone real, funcionava — daí a
    // intermitência.
    //
    // O HandleWacallsIncoming acabou de fazer todo o trabalho de resolver o
    // LID para telefone e devolveu o contato com o `remoteJid` já resolvido.
    // Usar esse valor aproveita a resolução em vez de jogá-la fora.
    //
    // Em GRUPO continua sendo o chatJid: JID de grupo nunca é LID, e o contato
    // do ticket é o próprio grupo.
    const jidParaFoto =
      !isGroup && (resolvedContact as any)?.remoteJid
        ? (resolvedContact as any).remoteJid
        : m.chatJid;

    ensureContactAvatar(
      whatsapp,
      ev.sessionId,
      jidParaFoto,
      isGroup,
      resolvedContact
    ).catch(() => {});
    return;
  }

  if (ev.type === "chat-meta") {
    const meta = ev.meta || {};
    if (!meta.chatJid) return;
    try {
      // Sem filtro de channel aqui: um contato "wacalls" pode ter sido
      // reaproveitado de outro canal pela busca parcial por número em
      // CreateOrUpdateContactService (que não filtra por channel), então o
      // registro certo pode não ter channel="wacalls" mesmo sendo o mesmo
      // remoteJid — exigir isso fazia esse fallback nunca achar nada.
      const contact = await Contact.findOne({
        where: { remoteJid: meta.chatJid, companyId: whatsapp.companyId }
      });
      if (!contact) return;

      const patch: any = {};
      if (meta.isGroup && meta.name && meta.name !== contact.name) {
        patch.name = meta.name;
      }
      const hasNoPic = !contact.profilePicUrl || String(contact.profilePicUrl).includes("nopicture");
      const hasNoUrlPicture = !contact.urlPicture || String(contact.urlPicture).includes("nopicture");
      if (meta.avatarUrl && (hasNoPic || hasNoUrlPicture)) {
        // Mesma convenção do ensureContactAvatar (ver comentário lá): salvar
        // em contacts/ e gravar SÓ o nome do arquivo em urlPicture. Aqui
        // estava gravando "/public/company{id}/arquivo.jpg" — como o getter
        // de urlPicture (models/Contact.ts) já monta o prefixo sozinho, o
        // caminho saía duplicado e a imagem dava 404. Dois caminhos
        // diferentes pro mesmo campo é justamente o tipo de divergência que
        // deixa uns contatos com foto e outros não, sem padrão aparente.
        const saved = await downloadAndSaveAsset(
          meta.avatarUrl,
          whatsapp.companyId,
          undefined,
          "contacts"
        );
        const filename = saved ? saved.split("/").pop() : null;
        if (filename) {
          patch.profilePicUrl = meta.avatarUrl;
          patch.urlPicture = filename;
        }
      }
      if (Object.keys(patch).length) await contact.update(patch);
    } catch (err: any) {
      logger.debug(`[wacalls-chat] erro processando chat-meta: ${err?.message}`);
    }
  }
};

/**
 * Serializa o processamento por (empresa + wid). O wacalls-chat pode entregar
 * o MESMO evento "message" em paralelo (SSE + reconnect + history sync). Sem
 * a fila, dois eventos concorrentes passavam juntos pela checagem de "já tem
 * mídia?" (a Message só é criada depois do download) e cada um gravava uma
 * cópia do arquivo. Com o lock, o segundo evento só roda depois que o
 * primeiro terminou — encontra a Message com mediaUrl e não baixa nada.
 */
const messageLocks = new Map<string, Promise<void>>();

const withMessageLock = async (key: string, fn: () => Promise<void>): Promise<void> => {
  const prev = messageLocks.get(key);
  const run = (async () => {
    if (prev) { try { await prev; } catch { /* ignore */ } }
    return fn();
  })();
  messageLocks.set(key, run);
  try {
    await run;
  } finally {
    if (messageLocks.get(key) === run) messageLocks.delete(key);
  }
};

export const handleWacallsChatMessagingEvent = async (whatsapp: Whatsapp, ev: any): Promise<void> => {
  const wid = ev?.type === "message" ? ev?.message?.id : null;
  if (!wid) return processChatMessagingEvent(whatsapp, ev);
  return withMessageLock(`${whatsapp.companyId}:${wid}`, () =>
    processChatMessagingEvent(whatsapp, ev)
  );
};



export default {
  isEnabled,
  buildJid,
  sendChatText,
  sendChatMedia,
  editChatMessage,
  deleteChatMessage,
  sendChatReaction,
  markChatRead,
  syncChatMeta,
  downloadAndSaveAsset,
  handleWacallsChatMessagingEvent
};
