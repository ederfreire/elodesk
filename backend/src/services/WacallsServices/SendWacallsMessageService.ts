import path from "path";
import fs from "fs";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import User from "../../models/User";
import CreateMessageService from "../MessageServices/CreateMessageService";
import {
  buildJid,
  sendChatText,
  sendChatMedia,
  editChatMessage,
  deleteChatMessage,
  sendChatReaction
} from "./WacallsChatMessageService";
import logger from "../../utils/logger";
import uploadConfig from "../../config/upload";
import { convertToCloudApiOpus, convertToMp3Sibling, isAudio as isAudioFile } from "../../utils/AudioUtils";
import { resolveMediaKind } from "../../utils/MediaSniff";

/**
 * Envia uma mensagem WhatsApp pelo canal wacalls (microserviço Go/whatsmeow)
 * e persiste a `Message` no banco imediatamente para aparecer no chat do agente.
 * Segue o mesmo formato do Baileys: `wid` retornado, `fromMe=true`, `ack=1`.
 */

interface SendWacallsTextParams {
  ticket: Ticket;
  body: string;
  quotedMsg?: Message | null;
}

// Contatos que só existem como LID (sem número de telefone exposto pelo
// WhatsApp) podem ter ficado com remoteJid salvo errado como
// "<dígitos do lid>@s.whatsapp.net" (bug antigo em normalizeJid/utils —
// já corrigido, mas contatos já salvos no banco só se auto-corrigem na
// próxima mensagem RECEBIDA). Números de telefone reais do WhatsApp têm
// no máximo 13 dígitos (padrão E.164); LIDs normalmente têm 15+. Qualquer
// coisa >13 dígitos com sufixo @s.whatsapp.net quase certamente é um LID
// mal rotulado — corrige pro @lid certo ANTES de mandar, senão o
// whatsmeow tenta resolver uma "PN" que não existe no servidor e o envio
// falha com "no LID found for X from server". Isso corrige na hora,
// mesmo pra tickets que já estavam quebrados antes do fix.
const fixLikelyMislabeledLid = (jid: string, isGroup: boolean): string => {
  if (isGroup || !jid.endsWith("@s.whatsapp.net")) return jid;
  const digits = jid.split("@")[0];
  return /^\d+$/.test(digits) && digits.length > 13 ? `${digits}@lid` : jid;
};

// Igual ao caso do LID: um remoteJid pode ter ficado salvo com a parte de
// dispositivo (":N") grudada — ex: "5511999999999:33@s.whatsapp.net" — se
// algum evento chegou sem o JID do chat preenchido e caiu no fallback pro
// JID do próprio aparelho pareado (que é um JID "AD", com dispositivo).
// Mandar isso pro whatsmeow quebra com "message recipient must be a user
// JID with no device part". normalizeJid já foi corrigido pra nunca mais
// salvar isso de novo, mas contatos já quebrados no banco só se curam na
// próxima mensagem recebida — então também limpa aqui, na hora de enviar,
// pra funcionar imediatamente.
const stripDevicePart = (jid: string): string => {
  const m = jid.match(/^(\d+):\d+(@.+)$/);
  return m ? `${m[1]}${m[2]}` : jid;
};

const resolveJid = (ticket: Ticket): string => {
  const contact: any = ticket.contact;
  const raw = contact?.remoteJid
    ? String(contact.remoteJid)
    : buildJid(String(contact?.number || ""), !!contact?.isGroup);
  return fixLikelyMislabeledLid(stripDevicePart(raw), !!contact?.isGroup);
};

const emitAppMessage = async (msg: Message, companyId: number) => {
  const full = await Message.findByPk(msg.id, {
    include: [
      "contact",
      {
        model: Ticket,
        as: "ticket",
        include: [
          {
            model: Contact,
            attributes: [
              "id","name","number","email","profilePicUrl","acceptAudioMessage","active","urlPicture","companyId"
            ],
            include: ["extraInfo", "tags"]
          },
          { model: Queue, attributes: ["id", "name", "color"] },
          { model: Whatsapp, attributes: ["id", "name", "groupAsTicket", "color"] },
          { model: User, attributes: ["id", "name"] }
        ]
      },
      { model: Message, as: "quotedMsg", include: ["contact"] }
    ]
  });
  if (!full) return;
  getIO().of(String(companyId)).emit(`company-${companyId}-appMessage`, {
    action: "create",
    message: full
  });
};

export const SendWacallsText = async ({
  ticket,
  body,
  quotedMsg
}: SendWacallsTextParams): Promise<Message> => {
  const whatsapp = ticket.whatsapp as Whatsapp;
  if (!whatsapp?.wacallsChatSessionId) throw new Error("Conexão WhatsApp Plus - Voz + Msg não pareada");
  const toJid = resolveJid(ticket);
  if (!toJid) throw new Error("Contato sem número/JID para envio da mensagem");

  // O `wid` é o id da mensagem no WhatsApp — é ele que o celular usa pra
  // localizar a mensagem citada e desenhar a bolha de resposta.
  const quotedWid = (quotedMsg as any)?.wid ? String((quotedMsg as any).wid) : undefined;
  const { id: wid } = await sendChatText(whatsapp.wacallsChatSessionId, toJid, body, quotedWid);


  const message = await CreateMessageService({
    messageData: {
      wid: String(wid || `wacalls-${Date.now()}`),
      ticketId: ticket.id,
      contactId: (ticket.contact as any)?.id,
      body,
      fromMe: true,
      read: true,
      mediaType: "chat",
      ack: 1,
      channel: "wacalls",
      quotedMsgId: quotedMsg?.id || null
    },
    companyId: ticket.companyId
  });
  await ticket.update({ lastMessage: body });
  await emitAppMessage(message as any, ticket.companyId);
  return message as any;
};

interface SendWacallsMediaParams {
  ticket: Ticket;
  media: Express.Multer.File;
  body?: string;
  quotedMsg?: Message | null;
}


const publicUrlFor = (ticketCompanyId: number, filename: string): string => {
  return `/public/company${ticketCompanyId}/${filename}`;
};

/**
 * Garante que o arquivo enviado esteja em `public/company{id}/` — SEM criar uma
 * segunda cópia. O multer (config/upload.ts) já grava o upload direto dentro de
 * `public/company{id}`, então o `copyFileSync` que existia aqui deixava DUAS
 * cópias de todo anexo enviado no disco (o arquivo do multer + a cópia com
 * outro nome). Com vídeo/áudio isso dobrava o consumo de disco a cada envio —
 * foi uma das causas do crescimento de dezenas de GB por dia. Agora:
 *  - se o arquivo já está na pasta da empresa, reaproveita no lugar;
 *  - se veio de outra pasta (ex: áudio convertido em tmp), MOVE (rename) e só
 *    cai pra copiar+apagar quando o rename cruza sistemas de arquivos.
 */
const moveToPublic = (media: Express.Multer.File, companyId: number): { finalPath: string; url: string; filename: string } => {
  const dir = path.join(uploadConfig.directory || path.resolve(__dirname, "../../../public"), `company${companyId}`);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}

  const sourcePath = media.path;
  const currentName = path.basename(sourcePath || "");
  if (sourcePath && path.dirname(path.resolve(sourcePath)) === path.resolve(dir) && fs.existsSync(sourcePath)) {
    return { finalPath: sourcePath, url: publicUrlFor(companyId, currentName), filename: currentName };
  }

  const safeName = `${Date.now()}-${(media.originalname || "file").replace(/[^\w.\-]+/g, "_")}`;
  const finalPath = path.join(dir, safeName);
  try {
    fs.renameSync(sourcePath, finalPath);
  } catch (err: any) {
    try {
      fs.copyFileSync(sourcePath, finalPath);
      try { fs.unlinkSync(sourcePath); } catch {}
    } catch (copyErr: any) {
      logger.warn(`[wacalls out] copy media falhou: ${copyErr?.message}`);
    }
  }
  return { finalPath, url: publicUrlFor(companyId, safeName), filename: safeName };
};


const normalizeWacallsAudio = async (media: Express.Multer.File): Promise<Express.Multer.File> => {
  if (!isAudioFile(media.mimetype || "", media.originalname || media.filename || "")) {
    return media;
  }

  const outDir = path.dirname(media.path);
  const convertedPath = await convertToCloudApiOpus(media.path, outDir);
  const convertedName = path.basename(convertedPath);

  // O upload original (gravação crua do navegador) não serve mais pra nada
  // depois da conversão — ficava parado em public/companyN pra sempre,
  // acumulando um arquivo extra por áudio enviado.
  if (convertedPath !== media.path) {
    try { fs.unlinkSync(media.path); } catch {}
  }

  logger.info(`[wacalls out] áudio normalizado para OGG/Opus: ${convertedPath}`);


  return {
    ...media,
    path: convertedPath,
    filename: convertedName,
    originalname: convertedName,
    mimetype: "audio/ogg; codecs=opus"
  } as Express.Multer.File;
};

export const SendWacallsMediaMessage = async ({
  ticket,
  media,
  body,
  quotedMsg
}: SendWacallsMediaParams): Promise<Message> => {
  const whatsapp = ticket.whatsapp as Whatsapp;
  if (!whatsapp?.wacallsChatSessionId) throw new Error("Conexão WhatsApp Plus - Voz + Msg não pareada");
  const toJid = resolveJid(ticket);
  if (!toJid) throw new Error("Contato sem número/JID para envio da mensagem");

  let mediaToSend = media;
  const isPtt = media.fieldname === "audio" || isAudioFile(media.mimetype || "", media.originalname || media.filename || "");
  if (isPtt) {
    mediaToSend = await normalizeWacallsAudio(media);
  }

  const { finalPath, filename } = moveToPublic(mediaToSend, ticket.companyId);

  // O mimetype do multer vem do cliente e frequentemente chega genérico
  // (application/octet-stream) — ex: reenvio/encaminhamento de uma mídia já
  // recebida, ou arquivo salvo sem extensão. Nesse caso a foto era enviada
  // como DOCUMENTO e o contato recebia um anexo sem preview no celular.
  // Aqui o tipo real é detectado pela assinatura binária do arquivo.
  const detected = isPtt
    ? { kind: "audio" as const, mime: mediaToSend.mimetype || "audio/ogg; codecs=opus" }
    : resolveMediaKind(finalPath, mediaToSend.mimetype, filename);
  const mediaType = detected.kind;
  if (!isPtt && detected.mime !== mediaToSend.mimetype) {
    logger.info(
      `[wacalls out] mime corrigido: "${mediaToSend.mimetype}" -> "${detected.mime}" (${mediaType}, ${filename})`
    );
  }

  // Duração explícita p/ áudio: evita que o WhatsApp mostre "0:00" quando o
  // parser de granule OGG do bridge Go falha em determinados streams.
  let audioSeconds = 0;
  if (isPtt) {
    try {
      // Publica também um MP3 irmão para o player do sistema no iPhone/Safari;
      // o WhatsApp recebe OGG/Opus, mas o chat interno usa <audio> do browser.
      await convertToMp3Sibling(finalPath);
      const { probeAudioSeconds } = await import("../../utils/AudioUtils");
      audioSeconds = await probeAudioSeconds(finalPath);
      if (!audioSeconds && mediaToSend.path && mediaToSend.path !== finalPath) {
        audioSeconds = await probeAudioSeconds(mediaToSend.path);
      }
      if (audioSeconds > 0) {
        audioSeconds = Math.ceil(audioSeconds);
      }
      logger.info(`[wacalls out] duração do áudio enviada: ${audioSeconds || 0}s (${filename})`);
    } catch (e: any) {
      logger.warn(`[wacalls out] probeAudioSeconds falhou: ${e?.message}`);
    }
    if (!audioSeconds || audioSeconds < 1) {
      audioSeconds = 1;
      logger.warn(`[wacalls out] duração do áudio não detectada; enviando fallback seconds=1 (${filename})`);
    }
  }

  // Vídeo: mesmo comportamento do Baileys — ffprobe no arquivo final para
  // enviar seconds/width/height no protobuf. Sem isso o celular do contato
  // mostra "0:00".
  let videoSeconds = 0;
  let videoWidth = 0;
  let videoHeight = 0;
  if (mediaType === "video") {
    try {
      const { probeVideoMeta } = await import("../../utils/VideoUtils");
      const meta = await probeVideoMeta(finalPath);
      videoSeconds = meta.seconds;
      videoWidth = meta.width;
      videoHeight = meta.height;
      logger.info(
        `[wacalls out] vídeo: ${videoSeconds}s ${videoWidth}x${videoHeight} (${filename})`
      );
    } catch (e: any) {
      logger.warn(`[wacalls out] probeVideoMeta falhou: ${e?.message}`);
    }
  }

  const { id: wid } = await sendChatMedia({
    sessionId: whatsapp.wacallsChatSessionId,
    jid: toJid,
    filePath: finalPath,
    mimetype: detected.mime || "application/octet-stream",
    filename,
    caption: body || "",
    kind: mediaType as any,
    seconds: isPtt ? audioSeconds : videoSeconds || undefined,
    width: videoWidth || undefined,
    height: videoHeight || undefined,
    quotedId: (quotedMsg as any)?.wid ? String((quotedMsg as any).wid) : undefined
  });


  const message = await CreateMessageService({
    messageData: {
      wid: String(wid || `wacalls-${Date.now()}`),
      ticketId: ticket.id,
      contactId: (ticket.contact as any)?.id,
      body: body || mediaToSend.originalname || `[${mediaType}]`,
      fromMe: true,
      read: true,
      mediaType,
      // Message.mediaUrl é getter (models/Message.ts) que já monta
      // `${BACKEND_URL}/public/company{id}/` sozinha em cima do valor cru —
      // gravar `url` (que já vem com "/public/companyN/" de publicUrlFor)
      // duplicava o prefixo e quebrava a mídia enviada pelo próprio agente
      // também. Só o nome do arquivo, igual o fluxo de entrada.
      mediaUrl: filename,
      ack: 1,
      channel: "wacalls",
      quotedMsgId: quotedMsg?.id || null
    },
    companyId: ticket.companyId
  });
  await ticket.update({ lastMessage: body || `[${mediaType}]` });
  await emitAppMessage(message as any, ticket.companyId);
  return message as any;
};

interface EditWacallsParams {
  message: Message;
  ticket: Ticket;
  body: string;
}

/**
 * Edita/apaga mensagens via bridge. As chamadas HTTP para o microserviço
 * são best-effort: se o Go ainda não implementar SendEdit/Revoke, o backend
 * ao menos persiste a mudança no banco para o UI refletir.
 */
export const EditWacallsMessage = async ({ message, ticket, body }: EditWacallsParams): Promise<Message> => {
  const whatsapp = ticket.whatsapp as Whatsapp;
  try {
    if (whatsapp?.wacallsChatSessionId) {
      await editChatMessage(whatsapp.wacallsChatSessionId, resolveJid(ticket), String((message as any).wid || message.id), body);
    }
  } catch (err: any) {
    logger.warn(`[wacalls edit] wacalls-chat falhou: ${err?.message}`);
  }
  await message.update({ body, isEdited: true } as any);
  return message;
};

export const DeleteWacallsMessage = async (message: Message, ticket: Ticket): Promise<Message> => {
  const whatsapp = ticket.whatsapp as Whatsapp;
  try {
    if (whatsapp?.wacallsChatSessionId) {
      await deleteChatMessage(whatsapp.wacallsChatSessionId, resolveJid(ticket), String((message as any).wid || message.id));
    }
  } catch (err: any) {
    logger.warn(`[wacalls delete] wacalls-chat falhou: ${err?.message}`);
  }
  await message.update({ isDeleted: true } as any);
  return message;
};

interface SendWacallsReactionParams {
  message: Message;
  ticket: Ticket;
  emoji: string;
}

/**
 * Reage (curtir) a uma mensagem. Requer o endpoint /react no wacalls-chat —
 * ver wacalls-chat-reacoes-PATCH.md, precisa ser aplicado manualmente no
 * repo Go do wacalls-chat (não faz parte do backend Node do EquipeChat).
 * Cria uma Message local com mediaType "reactionMessage" + quotedMsgId
 * apontando pra mensagem original, igual o frontend já sabe renderizar.
 */
export const SendWacallsReaction = async ({
  message,
  ticket,
  emoji
}: SendWacallsReactionParams): Promise<Message> => {
  const whatsapp = ticket.whatsapp as Whatsapp;
  if (!whatsapp?.wacallsChatSessionId) throw new Error("Conexão WhatsApp Plus - Voz + Msg não pareada");
  const toJid = resolveJid(ticket);
  if (!toJid) throw new Error("Contato sem número/JID para envio da mensagem");

  const targetWid = String((message as any).wid || message.id);
  const { message: sent } = await sendChatReaction(whatsapp.wacallsChatSessionId, toJid, targetWid, emoji);

  const reactionMessage = await CreateMessageService({
    messageData: {
      wid: String(sent?.id || `wacalls-react-${Date.now()}`),
      ticketId: ticket.id,
      contactId: (ticket.contact as any)?.id,
      body: emoji,
      fromMe: true,
      read: true,
      mediaType: "reactionMessage",
      ack: 1,
      channel: "wacalls",
      quotedMsgId: message.id
    },
    companyId: ticket.companyId
  });
  await emitAppMessage(reactionMessage as any, ticket.companyId);
  return reactionMessage as any;
};

export default SendWacallsText;
