// src/utils/VideoUtils.ts
// ✅ Metadados de vídeo no MESMO padrão do Baileys.
//
// O Baileys, antes de enviar um VideoMessage, roda ffprobe no arquivo e coloca
// `seconds`, `width` e `height` no protobuf. É isso que faz o celular do
// contato mostrar a duração correta (em vez de "0:00").
//
// O microserviço Go (WhatsApp Plus) nem sempre tem ffprobe/ffmpeg disponível,
// então calculamos aqui no backend Node — que já traz o ffmpeg resolvido em
// utils/ffmpegPath — e enviamos os valores junto com o upload.

import { exec } from "child_process";
import { FFPROBE_BIN } from "./ffmpegPath";
import logger from "./logger";

export interface VideoMeta {
  seconds: number;
  width: number;
  height: number;
}

const EMPTY: VideoMeta = { seconds: 0, width: 0, height: 0 };

export const probeVideoMeta = async (filePath: string): Promise<VideoMeta> => {
  return new Promise<VideoMeta>(resolve => {
    const cmd =
      `"${FFPROBE_BIN}" -v error -select_streams v:0 ` +
      `-show_entries stream=width,height,duration -show_entries format=duration ` +
      `-of default=nw=1:nk=1 "${filePath}"`;

    exec(cmd, { timeout: 20000 }, (err, stdout) => {
      if (err) {
        logger.warn(`[video probe] ffprobe falhou em ${filePath}: ${err.message}`);
        resolve(EMPTY);
        return;
      }

      const values = String(stdout || "")
        .split(/\s+/)
        .map(v => Number.parseFloat(v))
        .filter(v => Number.isFinite(v) && v > 0);

      // A ordem do ffprobe é width,height,[duration do stream],duration do
      // formato. Dimensões são inteiros e duração pode ser fracionária, então
      // separamos pelas duas primeiras posições e usamos o maior tempo restante.
      const [w, h, ...rest] = values;
      const seconds = rest.length ? Math.ceil(Math.max(...rest)) : 0;

      resolve({
        seconds: seconds > 0 ? seconds : 0,
        width: Number.isFinite(w) && w > 0 ? Math.round(w) : 0,
        height: Number.isFinite(h) && h > 0 ? Math.round(h) : 0
      });
    });
  });
};

export default probeVideoMeta;
