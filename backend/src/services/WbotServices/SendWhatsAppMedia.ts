import { WAMessage, AnyMessageContent } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import fs from "fs";

import path from "path";
import { exec } from "child_process";
import ffmpeg from "fluent-ffmpeg";

import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import mime from "mime-types";
import Contact from "../../models/Contact";
import { getWbot } from "../../libs/wbot";
import CreateMessageService from "../MessageServices/CreateMessageService";
import formatBody from "../../helpers/Mustache";
import logger from "../../utils/logger";
import friendlySendError from "../../helpers/FriendlySendError";
import { getJidOf } from "./getJidOf";
import Whatsapp from "../../models/Whatsapp";
import { buildJid } from "../WacallsServices/WacallsBridgeService";
// sendWacallsMedia (WacallsBridgeService, wacalls-voip) descontinuado — igual
// ao que já aconteceu no envio de texto (ver comentário em
// SendWhatsAppMessage.ts): checava whatsapp.wacallsSessionId, campo que
// nenhuma conexão nova preenche desde a migração pro wacalls-chat. Toda
// mídia mandada por uma conexão WhatsApp Plus caía direto no erro "conexão
// não está pareada", mesmo com a conexão 100% ativa — porque a checagem
// olhava pro campo errado do banco. Trocado pro bridge atual.
import { sendChatMedia } from "../WacallsServices/WacallsChatMessageService";


// ✅ Resolver um caminho de binário ffmpeg confiável e que REALMENTE executa.
// (testa `<bin> -version` antes de usar — evita "ffmpeg exited with code 127")
import { FFMPEG_BIN, FFPROBE_BIN, FFMPEG_AVAILABLE } from "../../utils/ffmpegPath";
import { resolveMediaKind } from "../../utils/MediaSniff";

// Configura o fluent-ffmpeg com o mesmo binário resolvido (usado no ffprobe etc.)
try {
  ffmpeg.setFfmpegPath(FFMPEG_BIN);
  ffmpeg.setFfprobePath(FFPROBE_BIN);
} catch (e) {
  logger.warn(`[ffmpeg] Falha ao configurar fluent-ffmpeg: ${(e as Error)?.message}`);
}

const AUDIO_CONVERT_TIMEOUT_MS = 30000;

// ✅ Timeout máximo para o wbot.sendMessage. O Baileys, ao enviar áudio (PTT),
// às vezes tenta gerar waveform/duração internamente e PODE ficar pendurado
// para sempre. Esse timeout garante que a requisição HTTP sempre retorna.
const SEND_MESSAGE_TIMEOUT_MS = 35000;

// Envia a mensagem com um teto de tempo: se o Baileys travar, rejeita com erro
// claro em vez de deixar o botão "girando" indefinidamente no frontend.
const sendMessageWithTimeout = async (
  wbot: any,
  jid: string,
  options: AnyMessageContent,
  timeoutMs: number = SEND_MESSAGE_TIMEOUT_MS
): Promise<WAMessage> => {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Tempo esgotado ao enviar mensagem pelo WhatsApp (>${timeoutMs}ms). ` +
            `O envio pode ter travado no Baileys.`
        )
      );
    }, timeoutMs);
  });

  try {
    const result = (await Promise.race([
      wbot.sendMessage(jid, options),
      timeoutPromise
    ])) as WAMessage;
    return result;
  } finally {
    clearTimeout(timer!);
  }
};

// ✅ Conversão robusta via child_process.exec (estilo ticketz).
// Garante que a Promise SEMPRE resolve/rejeita (timeout incluso), evitando
// que a requisição HTTP fique "girando para sempre" caso o ffmpeg trave.
const convertToOggOpus = async (inputFile: string): Promise<string> => {
  const parsed = path.parse(inputFile);
  const outputFile = path.join(parsed.dir, `${parsed.name}-${Date.now()}.ogg`);

  await new Promise<void>((resolve, reject) => {
    // ✅ Formato recomendado pela documentação do Baileys para nota de voz (PTT):
    // ogg/opus, mono, com -avoid_negative_ts make_zero para compatibilidade total.
    // ✅ FIX duração 0:00 no WhatsApp: Opus precisa ser 48kHz (taxa nativa),
    // container ogg explícito e page_duration baixo p/ que o WhatsApp leia
    // corretamente o granule (caso contrário só mostra duração após reproduzir).
    const cmd = `"${FFMPEG_BIN}" -y -i "${inputFile}" -vn -c:a libopus -ar 48000 -ac 1 -b:a 32k -application voip -vbr on -compression_level 10 -frame_duration 60 -page_duration 60000 -f ogg "${outputFile}"`;

    logger.info(`[AUDIO CONVERT] cmd: ${cmd}`);

    const child = exec(
      cmd,
      { timeout: AUDIO_CONVERT_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 16 },
      (error, _stdout, stderr) => {
        if (error) {
          logger.error(
            `[AUDIO CONVERT] ffmpeg falhou: ${error.message} | stderr: ${String(
              stderr || ""
            ).slice(-500)}`
          );
          return reject(error);
        }
        if (!fs.existsSync(outputFile)) {
          return reject(new Error("ffmpeg não gerou arquivo de saída"));
        }
        return resolve();
      }
    );

    child.on("error", err => reject(err));
  });

  return outputFile;
};

const probeAudioSeconds = async (filePath: string): Promise<number> => {
  return new Promise<number>(resolve => {
    try {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return resolve(0);
        const duration = Number(metadata?.format?.duration) || 0;
        resolve(Math.max(0, Math.round(duration)));
      });
    } catch {
      resolve(0);
    }
  });
};

const getMediaTypeFromMimeType = (mimetype: string): string => {
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
    "application/vnd.apple.pages",
    "application/x-msdownload",
    "application/x-executable",
    "application/x-msdownload",
    "application/acad",
    "application/x-pkcs12",
    "application/x-ret"
  ];

  const archiveMimeTypes = [
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/x-tar",
    "application/gzip",
    "application/x-bzip2"
  ];

  if (mimetype === "audio/webm") {
    return "audio";
  }

  if (documentMimeTypes.includes(mimetype)) {
    return "document";
  }

  if (archiveMimeTypes.includes(mimetype)) {
    return "document";
  }

  return mimetype.split("/")[0];
};

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  companyId?: number;
  body?: string;
  isPrivate?: boolean;
  isForwarded?: boolean;
}

const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");

// ✅ CORREÇÃO: Função de conversão de áudio otimizada

export const convertAudioToOgg = async (
  inputPath: string,
  companyId: number
): Promise<string> => {
  const newMediaFileName = `${new Date().getTime()}.ogg`;
  const outputFile = path.join(
    publicFolder,
    `company${companyId}`,
    newMediaFileName
  );


  await new Promise<void>((resolve, reject) => {
    const cmd = `"${FFMPEG_BIN}" -y -i "${inputPath}" -vn -c:a libopus -ar 48000 -ac 1 -b:a 32k -application voip -vbr on -compression_level 10 -frame_duration 60 -page_duration 60000 -f ogg "${outputFile}"`;

    const child = exec(
      cmd,
      { timeout: AUDIO_CONVERT_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 16 },
      (error, _stdout, stderr) => {
        if (error) {
          console.error(
            "❌ Erro na conversão de áudio:",
            error.message,
            String(stderr || "").slice(-500)
          );
          return reject(error);
        }
        if (!fs.existsSync(outputFile)) {
          return reject(new Error("ffmpeg não gerou arquivo de saída"));
        }
        return resolve();
      }
    );

    child.on("error", err => reject(err));
  });

  return outputFile;
};

// ✅ Função para converter PNG/WebP para JPG usando ffmpeg
export const convertPngToJpg = async (
  inputPath: string,
  companyId: number
): Promise<Buffer> => {
  try {

    const outputPath = path.join(
      publicFolder,
      `company${companyId}`,
      `temp_${new Date().getTime()}.jpg`
    );

    // Usar ffmpeg para converter qualquer formato de imagem para JPG
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputFormat('mjpeg')
        .outputOptions('-q:v', '2') // Qualidade alta
        .on('end', () => {
          resolve();
        })
        .on('error', (err) => {
          console.error("❌ Erro na conversão para JPG:", err);
          reject(err);
        })
        .save(outputPath);
    });

    // Ler o arquivo JPG convertido
    const imageBuffer = fs.readFileSync(outputPath);

    // Limpar arquivo temporário
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    return imageBuffer;
  } catch (error) {
    console.error("❌ Erro na conversão para JPG:", error);
    throw error;
  }
};

export const getMessageOptions = async (
  fileName: string,
  pathMedia: string,
  companyId: string,
  body: string = " "
): Promise<any> => {
  // mime.lookup olha só a EXTENSÃO, e para ".webm" devolve sempre
  // "video/webm" — mesmo quando o arquivo tem apenas áudio. Era por isso que
  // a nota de voz chegava como vídeo também por este caminho (campanhas,
  // fluxos, mensagens rápidas). O resolveMediaKind lê o conteúdo do arquivo e
  // já trata o contêiner WebM corretamente.
  const detected = resolveMediaKind(pathMedia, mime.lookup(pathMedia) || undefined, fileName);
  const mimeType = detected.mime;
  // Tipado como string de propósito: o ramo mais abaixo compara com
  // "document" e com "application", e um tipo literal estreito faria o
  // TypeScript considerar essa comparação impossível.
  const typeMessage: string =
    detected.kind === "document" ? "application" : detected.kind;


  try {
    if (!mimeType) {
      throw new Error("Invalid mimetype");
    }

    let options: AnyMessageContent;

    if (typeMessage === "video") {
      options = {
        video: fs.readFileSync(pathMedia),
        caption: body ? body : null,
        fileName: fileName
      };
    } else if (typeMessage === "audio") {
      // ✅ CORREÇÃO: Verificar se o arquivo já está em formato adequado
      const isAlreadyOgg = pathMedia.toLowerCase().endsWith(".ogg");
      let audioPath = pathMedia;

      if (!isAlreadyOgg) {
        audioPath = await convertAudioToOgg(pathMedia, +companyId);
      } else {
      }

      const seconds = await probeAudioSeconds(audioPath);

      options = {
        audio: fs.readFileSync(audioPath),
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        ...(seconds > 0 ? { seconds } : {})
      } as AnyMessageContent;

      // Limpar arquivo temporário se foi convertido
      if (audioPath !== pathMedia && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } else if (typeMessage === "document" || typeMessage === "application") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: body ? body : null,
        fileName: fileName,
        mimetype: mimeType
      };
    } else {
      options = {
        image: fs.readFileSync(pathMedia),
        caption: body ? body : null
      };
    }

    return options;
  } catch (e) {
    Sentry.captureException(e);
    console.error("❌ Erro ao processar mídia:", e);
    return null;
  }
};

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body = "",
  isPrivate = false,
  isForwarded = false
}: Request): Promise<WAMessage> => {
  try {
    const companyId = ticket.companyId.toString();

    // Roteamento wacalls: envia a mídia via microserviço whatsmeow (bridge HTTP)
    const wa = await Whatsapp.findByPk(ticket.whatsappId);
    if (wa?.channel === "wacalls") {
      const contact = await Contact.findByPk(ticket.contactId);
      if (!contact) throw new Error("Contato do ticket não encontrado");

      // Resolver caminho absoluto do arquivo
      let mediaPath: string;
      if (media.path.startsWith("/") && !media.path.includes("public")) {
        mediaPath = path.join(publicFolder, media.path);
      } else if (media.path.includes("public")) {
        mediaPath = media.path;
      } else {
        mediaPath = path.join(publicFolder, media.path);
      }
      if (!fs.existsSync(mediaPath)) {
        throw new Error(`Arquivo de mídia não encontrado: ${mediaPath}`);
      }

      // O mimetype do upload pode chegar genérico (application/octet-stream),
      // o que fazia foto/vídeo serem enviados como DOCUMENTO (o contato recebe
      // um anexo sem preview). Detecta o tipo real pelo conteúdo do arquivo.
      const detectedWacalls = resolveMediaKind(mediaPath, media.mimetype, media.originalname);
      if (detectedWacalls.mime !== media.mimetype) {
        logger.info(
          `[SEND MEDIA][WACALLS] mime corrigido: "${media.mimetype}" -> "${detectedWacalls.mime}"`
        );
        media = { ...media, mimetype: detectedWacalls.mime } as any;
      }
      const isAudio = (media.mimetype || "").startsWith("audio/");
      const isVideo = (media.mimetype || "").startsWith("video/");
      const jidWa = buildJid(contact.number, !!ticket.isGroup);
      const caption = body ? formatBody(body, ticket) : "";
      let wacallsMediaPath = mediaPath;
      let wacallsMimeType = media.mimetype;
      let wacallsFilename = media.originalname;
      let wacallsAudioSeconds = 0;
      let wacallsVideoSeconds = 0;
      let wacallsVideoWidth = 0;
      let wacallsVideoHeight = 0;
      let wacallsTempToCleanup: string | null = null;

      if (isAudio) {
        const { convertToCloudApiOpus } = await import("../../utils/AudioUtils");
        wacallsMediaPath = await convertToCloudApiOpus(mediaPath, path.dirname(mediaPath));
        wacallsTempToCleanup = wacallsMediaPath;
        wacallsMimeType = "audio/ogg; codecs=opus";
        wacallsFilename = `${path.parse(media.originalname || path.basename(mediaPath)).name || "audio"}.ogg`;
        wacallsAudioSeconds = await probeAudioSeconds(wacallsMediaPath);
        if (!wacallsAudioSeconds || wacallsAudioSeconds < 1) {
          wacallsAudioSeconds = 1;
        } else {
          wacallsAudioSeconds = Math.ceil(wacallsAudioSeconds);
        }
      }

      if (isVideo) {
        // Mesmo tratamento do Baileys: ffprobe define seconds/width/height.
        const { probeVideoMeta } = await import("../../utils/VideoUtils");
        const vmeta = await probeVideoMeta(wacallsMediaPath);
        wacallsVideoSeconds = vmeta.seconds;
        wacallsVideoWidth = vmeta.width;
        wacallsVideoHeight = vmeta.height;
        logger.info(
          `[SEND MEDIA][WACALLS] vídeo: ${wacallsVideoSeconds}s ${wacallsVideoWidth}x${wacallsVideoHeight}`
        );
      }

      // Mesma verificação já corrigida em SendWhatsAppMessage.ts — o campo
      // certo é wacallsChatSessionId, não o wacallsSessionId legado.
      if (!wa.wacallsChatSessionId) {
        throw new Error(
          "A conexão WhatsApp Plus não está pareada. Abra Conexões, leia o QR Code novamente e tente enviar de novo."
        );
      }

      let result: any;
      try {
        const wacallsKind: "image" | "video" | "audio" | "document" | "sticker" = isAudio
          ? "audio"
          : isVideo
          ? "video"
          : wacallsMimeType === "image/webp"
          ? "sticker"
          : wacallsMimeType.startsWith("image/")
          ? "image"
          : "document";

        result = await sendChatMedia({
          sessionId: wa.wacallsChatSessionId,
          jid: jidWa,
          filePath: wacallsMediaPath,
          mimetype: wacallsMimeType,
          filename: wacallsFilename,
          caption,
          kind: wacallsKind,
          seconds: isAudio ? wacallsAudioSeconds : wacallsVideoSeconds || undefined,
          width: wacallsVideoWidth || undefined,
          height: wacallsVideoHeight || undefined
        });
      } finally {
        if (wacallsTempToCleanup && fs.existsSync(wacallsTempToCleanup)) {
          try { fs.unlinkSync(wacallsTempToCleanup); } catch {}
        }
      }

      const mediaType = (media.mimetype || "").split("/")[0] || "document";

      // mediaUrl precisa ser o nome REAL do arquivo no disco.
      //
      // Estava gravando media.originalname (o nome que o arquivo tinha no
      // computador do atendente), mas o multer salva com um prefixo de
      // timestamp — o disco fica com "1785417902813_video.mp4" enquanto o
      // banco apontava pra "video.mp4". Duas consequências, as duas ruins:
      //
      //   1. O getter de Message.mediaUrl montava uma URL que não existe, e
      //      o vídeo/áudio enviado NÃO aparecia na conversa da plataforma
      //      (chegava normal no WhatsApp do cliente — o erro era só na
      //      exibição interna).
      //   2. O arquivo de verdade ficava sem nenhuma referência no banco,
      //      virando lixo permanente no disco.
      //
      // Usa o basename do caminho realmente gravado. Fallback pra filename e,
      // em último caso, originalname (fluxos que não passam pelo multer).
      const nomeNoDisco =
        path.basename(mediaPath) ||
        (media as any).filename ||
        media.originalname;

      await CreateMessageService({
        messageData: {
          wid: result?.id || `wa-${Date.now()}`,
          ticketId: ticket.id,
          contactId: contact.id,
          body: caption || media.originalname,
          fromMe: true,
          read: true,
          mediaType: isAudio ? "audio" : mediaType,
          mediaUrl: nomeNoDisco,
          ack: 1,
          channel: "wacalls",
          isForwarded
        },
        companyId: ticket.companyId
      });
      await ticket.update({ lastMessage: caption || `📎 ${media.originalname}` });
      return { key: { id: result?.id, remoteJid: jidWa, fromMe: true } } as any;
    }

    logger.info(
      `[SEND MEDIA][WBOT] usando fluxo direto da versão referência ticket=${ticket.id} whatsappId=${ticket.whatsappId} channel=${ticket.channel}`
    );
    const wbot = getWbot(ticket.whatsappId);


    // Construir o caminho absoluto baseado no companyId
    let pathMedia;

    // Verificar se media.path já é um caminho absoluto ou relativo
    if (media.path.startsWith('/') && !media.path.includes('public')) {
      // Caminho relativo como /company1/fileList/4/arquivo.pdf
      pathMedia = path.join(publicFolder, media.path);
    } else if (media.path.includes('public')) {
      // Caminho já absoluto, usar diretamente
      pathMedia = media.path;
    } else if (media.path.startsWith('company')) {
      // Caminho que começa com company (ex: company1/fileList/4/arquivo.pdf)
      pathMedia = path.join(publicFolder, media.path);
    } else {
      // Caminho relativo sem barra inicial
      pathMedia = path.join(publicFolder, media.path);
    }

    // Debug: verificar se o arquivo existe

    if (!fs.existsSync(pathMedia)) {
      throw new Error(`Arquivo de mídia não encontrado: ${pathMedia}`);
    }

    // Idem: sem isso, um upload com Content-Type genérico virava documento.
    const detectedWbot = resolveMediaKind(pathMedia, media.mimetype, media.originalname);
    if (detectedWbot.mime !== media.mimetype) {
      logger.info(
        `[SEND MEDIA][WBOT] mime corrigido: "${media.mimetype}" -> "${detectedWbot.mime}"`
      );
      media = { ...media, mimetype: detectedWbot.mime } as any;
    }
    const typeMessage = media.mimetype.split("/")[0];
    let options: AnyMessageContent;
    let bodyTicket = "";
    // ✅ Arquivo temporário de áudio convertido a ser removido após o envio
    let audioTempToCleanup: string | null = null;
    const bodyMedia = ticket ? formatBody(body, ticket) : body;


    if (typeMessage === "video") {
      options = {
        video: fs.readFileSync(pathMedia),
        caption: bodyMedia,
        fileName: media.originalname.replace("/", "-"),
        contextInfo: {
          forwardingScore: isForwarded ? 2 : 0,
          isForwarded: isForwarded
        }
      };
      bodyTicket = "🎥 Arquivo de vídeo";
    } else if (
      typeMessage === "audio" ||
      media.mimetype.includes("audio") ||
      /^audio_.*\.(mp3|ogg|m4a|webm|opus|wav|aac)$/i.test(media.originalname || "") ||
      /\.(mp3|ogg|m4a|webm|opus|wav|aac)$/i.test(media.originalname || "")
    ) {
      // ✅ Tratamento específico para áudio (nota de voz no WhatsApp).
      // O WhatsApp só toca nota de voz corretamente em ogg/opus, então a
      // conversão via ffmpeg é OBRIGATÓRIA aqui. Diferente das outras mídias
      // (pdf/imagem/vídeo), o áudio NÃO pode usar fallback do arquivo original.
      logger.info(
        `[SEND MEDIA][AUDIO] start mimetype=${media.mimetype} originalname=${media.originalname} size=${media.size} pathMedia=${pathMedia} exists=${fs.existsSync(pathMedia)} ffmpegBin=${FFMPEG_BIN} ffmpegAvailable=${FFMPEG_AVAILABLE}`
      );

      // ✅ Falha rápida e clara se o ffmpeg não estiver disponível/funcional.
      if (!FFMPEG_AVAILABLE) {
        throw new Error(
          "ffmpeg indisponível ou incompatível no servidor. Instale com 'apt-get install -y ffmpeg' " +
            "ou garanta os pacotes npm (ffmpeg-static / @ffmpeg-installer/ffmpeg). " +
            `Binário atual: ${FFMPEG_BIN}`
        );
      }

      // ✅ SEMPRE re-converter (mesmo se já for .ogg) para garantir que o
      // arquivo final tenha cabeçalho/duração corretos. Áudios .ogg gravados
      // pelo navegador (webm/opus renomeado) frequentemente saem com duração
      // 0:00 no WhatsApp porque o granule do container está zerado.
      const audioPath = await convertToOggOpus(pathMedia);
      const seconds = await probeAudioSeconds(audioPath);

      // ✅ Substituir o arquivo público original pela versão convertida
      // (mesma extensão .ogg). Assim a reprodução pelo próprio sistema
      // mostra a duração correta — e não só "0:00" até dar play.
      try {
        const parsedOriginal = path.parse(pathMedia);
        const publicOggPath = path.join(
          parsedOriginal.dir,
          `${parsedOriginal.name}.ogg`
        );
        fs.copyFileSync(audioPath, publicOggPath);
        // Atualiza filename no DB (ext .ogg garantida) para o frontend achar.
        if (publicOggPath !== pathMedia) {
          try { fs.unlinkSync(pathMedia); } catch {}
        }
        media.filename = path.basename(publicOggPath);
        media.path = publicOggPath;

        // ✅ Gera um .mp3 irmão para reprodução em iPhone/Safari, onde Opus
        // não toca de forma confiável (dá erro ao abrir o áudio).
        try {
          const { convertToMp3Sibling } = await import("../../utils/AudioUtils");
          await convertToMp3Sibling(publicOggPath);
        } catch (mp3Err) {
          logger.warn(
            `[SEND MEDIA][AUDIO] Falha ao gerar mp3 sibling: ${(mp3Err as Error)?.message}`
          );
        }
      } catch (copyErr) {
        logger.warn(
          `[SEND MEDIA][AUDIO] Falha ao publicar ogg convertido: ${(copyErr as Error)?.message}`
        );
      }

      // ✅ Ler o buffer em memória (NÃO usar { url }).
      const audioBuffer = fs.readFileSync(audioPath);
      options = {
        audio: audioBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        ...(seconds > 0 ? { seconds } : {}),
        contextInfo: {
          forwardingScore: isForwarded ? 2 : 0,
          isForwarded: isForwarded
        }
      } as AnyMessageContent;

      // Temp convertido pode ser removido após o envio.
      audioTempToCleanup = audioPath;

      bodyTicket = bodyMedia || "🎵 Mensaje de voz";
    } else if (typeMessage === "document" || typeMessage === "text") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: bodyMedia,
        fileName: media.originalname.replace("/", "-"),
        mimetype: media.mimetype,
        contextInfo: {
          forwardingScore: isForwarded ? 2 : 0,
          isForwarded: isForwarded
        }
      };
      bodyTicket = "📂 Documento";
    } else if (typeMessage === "application") {
      options = {
        document: fs.readFileSync(pathMedia),
        caption: bodyMedia,
        fileName: media.originalname.replace("/", "-"),
        mimetype: media.mimetype,
        contextInfo: {
          forwardingScore: isForwarded ? 2 : 0,
          isForwarded: isForwarded
        }
      };
      bodyTicket = "📎 Outros anexos";
    } else {
      if (media.mimetype.includes("gif")) {
        options = {
          image: fs.readFileSync(pathMedia),
          caption: bodyMedia,
          mimetype: "image/gif",
          contextInfo: {
            forwardingScore: isForwarded ? 2 : 0,
            isForwarded: isForwarded
          },
          gifPlayback: true
        };
      } else {
        if (media.mimetype.includes("png") || media.mimetype.includes("webp")) {
          // ✅ Tentar converter PNG/WebP para JPG (melhor compatibilidade).
          // Se o ffmpeg não estiver disponível (exit code 127) ou falhar,
          // faz fallback para o arquivo original — WhatsApp aceita PNG/WebP.
          let imageBuffer: Buffer;
          try {
            imageBuffer = await convertPngToJpg(pathMedia, ticket.companyId);
          } catch (convErr) {
            console.warn(
              "[SEND MEDIA] Falha ao converter PNG/WebP para JPG, enviando arquivo original:",
              (convErr as Error)?.message
            );
            imageBuffer = fs.readFileSync(pathMedia);
          }
          options = {
            image: imageBuffer,
            caption: bodyMedia,
            mimetype: media.mimetype.includes("webp")
              ? "image/webp"
              : "image/png",
            contextInfo: {
              forwardingScore: isForwarded ? 2 : 0,
              isForwarded: isForwarded
            }
          };
        } else {
          options = {
            image: fs.readFileSync(pathMedia),
            caption: bodyMedia,
            contextInfo: {
              forwardingScore: isForwarded ? 2 : 0,
              isForwarded: isForwarded
            }
          };
        }
      }
      bodyTicket = "🖼️ Imagem";
    }

    if (isPrivate === true) {
      const messageData = {
        wid: `PVT${companyId}${ticket.id}${body.substring(0, 6)}`,
        ticketId: ticket.id,
        contactId: undefined,
        body: bodyMedia,
        fromMe: true,
        mediaUrl: media.filename,
        mediaType: getMediaTypeFromMimeType(media.mimetype),
        read: true,
        quotedMsgId: null,
        ack: 2,
        remoteJid: null,
        participant: null,
        dataJson: null,
        ticketTrakingId: null,
        isPrivate
      };

      await CreateMessageService({ messageData, companyId: ticket.companyId });
      return;
    }

    const contactNumber = await Contact.findByPk(ticket.contactId);
    if (!contactNumber) {
      throw new AppError("Contato do ticket não encontrado");
    }

    const sentMessage = await sendMessageWithTimeout(
      wbot,
      getJidOf(ticket),
      options
    );

    // ✅ Remover o arquivo de áudio temporário convertido após o envio
    if (audioTempToCleanup && fs.existsSync(audioTempToCleanup)) {
      try { fs.unlinkSync(audioTempToCleanup); } catch {}
    }

    wbot.store(sentMessage);

    // ✅ Descrição amigável para mídias enviadas
    const mediaDescriptions: Record<string, string> = {
      video: "🎥 Vídeo", audio: "🎵 Áudio", image: "📷 Imagem",
      application: "📄 Documento", document: "📄 Documento",
    };
    let lastMsg = body !== media.filename ? body : bodyMedia;
    if (!lastMsg || lastMsg === media.filename) {
      lastMsg = mediaDescriptions[typeMessage] || bodyMedia || media.filename;
    }
    await ticket.update({
      lastMessage: lastMsg,
      imported: null
    });

    return sentMessage;
  } catch (err: any) {
    console.error(
      `❌ ERRO AO ENVIAR MÍDIA ${ticket.id} media ${media.originalname} (mime=${media.mimetype}):`,
      err
    );
    logger.error(
      `[SEND MEDIA] Falha ticket=${ticket.id} mime=${media.mimetype} name=${media.originalname} size=${media.size} err=${err?.message} stack=${err?.stack}`
    );
    Sentry.captureException(err);
    // Mensagem amigável no lugar do código cru + stack do Baileys/ffmpeg.
    throw new AppError(
      friendlySendError(
        err,
        "Não foi possível enviar o arquivo. Verifique a conexão do WhatsApp em Conexões e tente novamente."
      )
    );
  }
};

export default SendWhatsAppMedia;
