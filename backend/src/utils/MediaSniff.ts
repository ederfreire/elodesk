import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { FFPROBE_BIN } from "./ffmpegPath";

/**
 * Detecção robusta do tipo real de uma mídia antes de enviar ao WhatsApp.
 *
 * Motivo: o mimetype que chega do multer vem do navegador/cliente e, em vários
 * caminhos (reenvio de uma mídia já recebida, encaminhamento, upload via API,
 * arquivos salvos sem extensão), vem como `application/octet-stream` ou vazio.
 * Nesse caso o envio classificava a mídia como "document" e o contato recebia
 * a FOTO como um anexo/arquivo genérico — sem preview de imagem no celular.
 *
 * Ordem de decisão: assinatura binária (magic bytes) > extensão do arquivo >
 * mimetype informado.
 */

export type MediaKind = "image" | "video" | "audio" | "document";

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".3gp": "video/3gpp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".amr": "audio/amr",
  ".flac": "audio/flac"
};

const isGenericMime = (mime: string): boolean => {
  const m = String(mime || "").toLowerCase().trim();
  return (
    !m ||
    m === "application/octet-stream" ||
    m === "binary/octet-stream" ||
    m === "application/binary" ||
    m === "text/plain"
  );
};

const kindFromMime = (mime: string): MediaKind | null => {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return null;
};

/** Lê a assinatura binária do arquivo e devolve o mime real, se reconhecido. */
export const sniffMimeFromFile = (filePath: string): string | null => {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(32);
    const read = fs.readSync(fd, buf, 0, 32, 0);
    if (read < 12) return null;
    return sniffMimeFromBuffer(buf.subarray(0, read));
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* noop */
      }
    }
  }
};

export const sniffMimeFromBuffer = (buf: Buffer): string | null => {
  const ascii = (start: number, len: number) =>
    buf.subarray(start, start + len).toString("latin1");

  // Imagens
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (ascii(0, 3) === "GIF") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(0, 2) === "BM") return "image/bmp";
  if (ascii(0, 4) === "II*\x00" || ascii(0, 4) === "MM\x00*") return "image/tiff";

  // Contêiner ISO-BMFF (mp4/mov/heic/m4a) — o brand diz o que é de fato
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4).toLowerCase();
    if (brand.startsWith("hei") || brand.startsWith("mif")) return "image/heic";
    if (brand.startsWith("avif")) return "image/avif";
    if (brand === "m4a " || brand.startsWith("m4a")) return "audio/mp4";
    if (brand.startsWith("qt")) return "video/quicktime";
    if (brand.startsWith("3g")) return "video/3gpp";
    return "video/mp4";
  }

  // Vídeo / áudio
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3)
    return "video/webm";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "AVI ") return "video/x-msvideo";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 3) === "ID3") return "audio/mpeg";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(0, 5) === "#!AMR") return "audio/amr";

  // Documentos comuns (só pra não classificar como imagem por engano)
  if (ascii(0, 4) === "%PDF") return "application/pdf";

  return null;
};

/**
 * Resolve o mime e o "kind" reais de um arquivo que será enviado ao WhatsApp.
 * Nunca devolve "document" para um arquivo cujo conteúdo é claramente
 * imagem/vídeo/áudio, mesmo que o mimetype informado seja genérico.
 */
/**
 * WebM e Matroska são CONTÊINERES: servem tanto para vídeo quanto para áudio
 * puro, e a assinatura binária (1A 45 DF A3) é a mesma nos dois casos.
 *
 * Por isso o áudio gravado no navegador (o MediaRecorder produz
 * `audio/webm;codecs=opus`) era classificado como `video/webm` e o contato
 * recebia um VÍDEO no lugar da mensagem de voz.
 *
 * Aqui a pergunta é feita a quem sabe responder: o ffprobe diz se existe
 * faixa de vídeo de verdade dentro do arquivo. Sem faixa de vídeo, é áudio.
 *
 * Em caso de falha do ffprobe devolvemos `true` (segue como vídeo), que é o
 * comportamento anterior — uma detecção indisponível não deve mudar o
 * resultado de forma imprevisível.
 */
const webmTemFaixaDeVideo = (filePath: string): boolean => {
  try {
    const saida = execFileSync(
      FFPROBE_BIN,
      [
        "-v", "error",
        "-select_streams", "v",
        "-show_entries", "stream=codec_type",
        "-of", "csv=p=0",
        filePath
      ],
      { timeout: 5000, encoding: "utf8" }
    );
    return String(saida).trim().length > 0;
  } catch {
    return true;
  }
};

export const resolveMediaKind = (
  filePath: string,
  declaredMime?: string,
  filename?: string
): { kind: MediaKind; mime: string } => {
  let sniffed = sniffMimeFromFile(filePath);

  // Refina o contêiner WebM/Matroska antes de qualquer decisão: sem esta
  // checagem, todo áudio gravado no navegador viraria vídeo.
  if (sniffed === "video/webm" && !webmTemFaixaDeVideo(filePath)) {
    sniffed = "audio/webm";
  }
  const declaredKind = kindFromMime(declaredMime || "");

  // Assinatura binária vence quando o mimetype declarado é genérico ou quando
  // discorda da categoria real do conteúdo.
  if (sniffed) {
    const sniffedKind = kindFromMime(sniffed);
    if (sniffedKind && (isGenericMime(declaredMime || "") || !declaredKind)) {
      return { kind: sniffedKind, mime: sniffed };
    }
    if (sniffedKind && declaredKind && sniffedKind !== declaredKind) {
      return { kind: sniffedKind, mime: sniffed };
    }
  }

  if (declaredKind) {
    return { kind: declaredKind, mime: String(declaredMime) };
  }

  // Sem assinatura útil e mime genérico: tenta pela extensão.
  const ext = path.extname(String(filename || filePath || "")).toLowerCase();
  const extMime = EXT_MIME[ext];
  const extKind = extMime ? kindFromMime(extMime) : null;
  if (extKind && extMime) {
    return { kind: extKind, mime: extMime };
  }

  return {
    kind: "document",
    mime: isGenericMime(declaredMime || "")
      ? sniffed || "application/octet-stream"
      : String(declaredMime)
  };
};

export default resolveMediaKind;
