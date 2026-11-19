// src/utils/ffmpegPath.ts
// ✅ Resolvedor de binário ffmpeg ROBUSTO.
//
// Problema original: a resolução anterior apenas verificava `fs.existsSync`,
// mas no servidor de produção o binário escolhido (ex.: @ffmpeg-installer)
// existia porém NÃO executava (arquitetura errada, sem permissão de execução,
// etc.), resultando em "ffmpeg exited with code 127" tanto no envio de áudio
// quanto na conversão de imagem PNG/WebP -> JPG.
//
// Solução: testar cada candidato de verdade rodando `<bin> -version` de forma
// síncrona e usar o PRIMEIRO que realmente funcionar. Inclui também caminhos
// comuns do sistema (/usr/bin/ffmpeg, /bin/ffmpeg) além do PATH.

import fs from "fs";
import { execFileSync } from "child_process";
import logger from "./logger";

let cachedFfmpeg: string | null = null;

// ✅ Indica se o binário ffmpeg resolvido REALMENTE executa (`<bin> -version`).
// Quando false, o envio de áudio deve falhar rápido com mensagem clara em vez
// de ficar "girando" para sempre tentando converter com um ffmpeg quebrado.
export let FFMPEG_AVAILABLE = false;

const safeRequirePath = (mod: string, prop: "path" = "path"): string | null => {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const required = require(mod);
    const value = required?.[prop] ?? required;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
};

// Testa se um binário ffmpeg realmente executa.
const ffmpegWorks = (bin: string): boolean => {
  try {
    execFileSync(bin, ["-version"], {
      stdio: "ignore",
      timeout: 5000
    });
    return true;
  } catch {
    return false;
  }
};

export const resolveFfmpegPath = (): string => {
  if (cachedFfmpeg) return cachedFfmpeg;

  const candidates: string[] = [];

  // 1) Pacotes npm PRIMEIRO (binário auto-contido, não depende das libs do SO).
  // No VPS o /usr/bin/ffmpeg estava quebrado (libavdevice.so.62 ausente),
  // então priorizar os binários npm evita o "ffmpeg exited" / áudio travado.
  const staticPath = safeRequirePath("ffmpeg-static");
  if (staticPath) candidates.push(staticPath);

  const installerPath = safeRequirePath("@ffmpeg-installer/ffmpeg");
  if (installerPath) candidates.push(installerPath);

  // 2) Caminhos comuns do sistema operacional
  candidates.push("/usr/bin/ffmpeg", "/bin/ffmpeg", "/usr/local/bin/ffmpeg");

  // 3) PATH do sistema (último recurso)
  candidates.push("ffmpeg");

  for (const bin of candidates) {
    // Para caminhos absolutos, exigir que o arquivo exista antes de testar.
    if (bin.startsWith("/") && !fs.existsSync(bin)) continue;

    if (ffmpegWorks(bin)) {
      logger.info(`[ffmpeg] usando binário funcional: ${bin}`);
      cachedFfmpeg = bin;
      FFMPEG_AVAILABLE = true;
      return bin;
    }

    logger.warn(`[ffmpeg] candidato indisponível/não executável: ${bin}`);
  }

  // Nenhum funcionou — retorna "ffmpeg" mesmo assim para não quebrar import,
  // mas registra erro claro (vai falhar no uso, com mensagem explícita).
  logger.error(
    "[ffmpeg] NENHUM binário ffmpeg funcional encontrado. " +
      "Instale com: apt-get install -y ffmpeg (ou garanta os pacotes npm)."
  );
  cachedFfmpeg = "ffmpeg";
  FFMPEG_AVAILABLE = false;
  return cachedFfmpeg;
};

export const FFMPEG_BIN = resolveFfmpegPath();

// ✅ Resolver também o ffprobe (usado pelo fluent-ffmpeg em ffprobe()).
// ffmpeg-static / @ffmpeg-installer NÃO trazem ffprobe, então tentamos:
// 1) ffprobe-static (se instalado)
// 2) ffprobe ao lado do binário ffmpeg resolvido
// 3) caminhos comuns do sistema
// 4) PATH (último recurso)
let cachedFfprobe: string | null = null;

const ffprobeWorks = (bin: string): boolean => {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

export const resolveFfprobePath = (): string => {
  if (cachedFfprobe) return cachedFfprobe;

  const candidates: string[] = [];

  const staticProbe = safeRequirePath("ffprobe-static");
  if (staticProbe) candidates.push(staticProbe);

  // ffprobe ao lado do ffmpeg resolvido (ex.: /usr/bin/ffmpeg -> /usr/bin/ffprobe)
  if (FFMPEG_BIN && FFMPEG_BIN.includes("ffmpeg")) {
    candidates.push(FFMPEG_BIN.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"));
  }

  candidates.push(
    "/usr/bin/ffprobe",
    "/bin/ffprobe",
    "/usr/local/bin/ffprobe"
  );
  candidates.push("ffprobe");

  for (const bin of candidates) {
    if (bin.startsWith("/") && !fs.existsSync(bin)) continue;
    if (ffprobeWorks(bin)) {
      logger.info(`[ffprobe] usando binário funcional: ${bin}`);
      cachedFfprobe = bin;
      return bin;
    }
  }

  logger.warn("[ffprobe] nenhum ffprobe funcional encontrado, usando 'ffprobe'.");
  cachedFfprobe = "ffprobe";
  return cachedFfprobe;
};

export const FFPROBE_BIN = resolveFfprobePath();

export default resolveFfmpegPath;
