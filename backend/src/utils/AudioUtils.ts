// src/utils/AudioUtils.ts
import ffmpeg from "fluent-ffmpeg";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { FFMPEG_BIN, FFPROBE_BIN } from "./ffmpegPath";

// ✅ Binário ffmpeg/ffprobe resolvido E verificado (roda `<bin> -version` antes
// de usar). Isso evita "ffmpeg exited with code 127" / "/usr/bin/ffmpeg ENOENT"
// quando o binário do SO existe mas não é executável (ou nem existe).
try {
  ffmpeg.setFfmpegPath(FFMPEG_BIN);
  ffmpeg.setFfprobePath(FFPROBE_BIN);
} catch {}

const AUDIO_CONVERT_TIMEOUT_MS = 30000;

/**
 * ✅ CORREÇÃO KISS: Utilitário simples para áudio mobile
 * Detecta e converte arquivos de áudio para formato compatível com WhatsApp Mobile
 */

// Tipos de áudio suportados pelo WhatsApp em dispositivos móveis
const MOBILE_AUDIO_CONFIG = {
  format: "ogg",
  codec: "libopus", 
  mimetype: "audio/ogg; codecs=opus",
  frequency: 16000, // 16kHz é otimal para voz
  bitrate: 32, // 32kbps é suficiente para voz
  channels: 1 // Mono para economizar dados
};

// Lista simples de extensões de áudio
const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.webm', '.m4a', '.aac'];

// Lista simples de mimetypes de áudio
const AUDIO_MIMETYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 
  'audio/webm', 'audio/m4a', 'audio/aac', 'audio/x-wav'
];

/**
 * Detecta se um arquivo é áudio de forma simples e direta
 */
export const isAudio = (mimetype: string, filename: string = ''): boolean => {
  // Verificar mimetype
  if (AUDIO_MIMETYPES.includes(mimetype) || mimetype.startsWith('audio/')) {
    return true;
  }
  
  // Verificar extensão do arquivo
  const lowerFilename = filename.toLowerCase();
  if (AUDIO_EXTENSIONS.some(ext => lowerFilename.endsWith(ext))) {
    return true;
  }
  
  // Verificar padrões de nome de áudio gravado
  if (lowerFilename.includes('audio_') || lowerFilename.includes('áudio')) {
    return true;
  }
  
  return false;
};

/**
 * Converte áudio para formato otimizado para WhatsApp Mobile.
 * ✅ Usa child_process.exec com timeout para garantir que a Promise SEMPRE
 * resolve/rejeita — evitando que a requisição fique "girando para sempre"
 * caso o ffmpeg trave.
 */
export const convertToMobileAudio = async (
  inputPath: string,
  outputDir: string
): Promise<string> => {
  const timestamp = new Date().getTime();
  const outputFileName = `mobile_audio_${timestamp}.ogg`;
  const outputPath = path.join(outputDir, outputFileName);

  await new Promise<void>((resolve, reject) => {
    const cmd = `"${FFMPEG_BIN}" -y -i "${inputPath}" -vn -c:a libopus -ar 48000 -ac ${MOBILE_AUDIO_CONFIG.channels} -b:a ${MOBILE_AUDIO_CONFIG.bitrate}k -application voip -vbr on -compression_level 10 -frame_duration 60 -page_duration 60000 -f ogg "${outputPath}"`;

    const child = exec(
      cmd,
      { timeout: AUDIO_CONVERT_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 16 },
      (error, _stdout, stderr) => {
        if (error) {
          try {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch {}
          console.error(
            "❌ Erro na conversão de áudio mobile:",
            error.message,
            String(stderr || "").slice(-500)
          );
          return reject(error);
        }
        if (!fs.existsSync(outputPath)) {
          return reject(new Error("ffmpeg não gerou arquivo de saída"));
        }
        return resolve();
      }
    );

    child.on("error", err => reject(err));
  });

  return outputPath;
};

/**
 * ✅ Conversão específica para o WhatsApp Cloud API (WA Plus/Oficial).
 * A Meta rejeita silenciosamente OGGs "complexos" (frame_duration/page_duration
 * customizados, application=voip com VBR, taxas fora do padrão) — o upload
 * retorna 200 mas o áudio aparece como "Este áudio não está mais disponível"
 * no destinatário (principalmente no iPhone).
 *
 * Aqui usamos o perfil de áudio de voz que chega do próprio WhatsApp/iPhone:
 * OGG container, codec libopus, mono, 16 kHz, ~24 kbps. O granule clock do
 * Opus continua sendo 48 kHz internamente, mas o sample rate sinalizado no
 * header fica como áudio de voz gravado no celular.
 */
export const convertToCloudApiOpus = async (
  inputPath: string,
  outputDir: string
): Promise<string> => {
  const timestamp = new Date().getTime();
  const outputFileName = `cloud_audio_${timestamp}.ogg`;
  const outputPath = path.join(outputDir, outputFileName);
  const tmpWavPath = path.join(outputDir, `cloud_audio_${timestamp}.wav`);

  // ✅ Duração "14:42" / "99:99" no iPhone = WebM do MediaRecorder sem
  // duração no header EBML. Se codificar Opus direto do WebM, o ffmpeg
  // estima pelos timestamps e erra feio (o granule do OGG sai gigante e
  // o WhatsApp mostra duração absurda).
  //
  // Solução em 2 passes:
  //   1) decodifica pra WAV PCM (samples reais, duração exata)
  //   2) codifica de WAV → OGG/Opus com o perfil usado em PTT pelo
  //      WhatsApp/iPhone: mono, 16 kHz, libopus e mimetype
  //      "audio/ogg; codecs=opus" no envio. O iPhone é mais exigente que
  //      Android/Web e pode mostrar 0:00 quando o Opus sai em perfil/rate
  //      diferente ou sem waveform no AudioMessage.
  const step1 = `"${FFMPEG_BIN}" -y -fflags +genpts -i "${inputPath}" -vn -ac 1 -ar 16000 -c:a pcm_s16le -f wav "${tmpWavPath}"`;
  const step2 = `"${FFMPEG_BIN}" -y -i "${tmpWavPath}" -vn -ac 1 -ar 16000 -c:a libopus -b:a 24k -vbr off -application voip -frame_duration 20 -compression_level 10 -avoid_negative_ts make_zero -map_metadata -1 -f ogg "${outputPath}"`;

  const runStep = (cmd: string, label: string) =>
    new Promise<void>((resolve, reject) => {
      const child = exec(
        cmd,
        { timeout: AUDIO_CONVERT_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 16 },
        (error, _stdout, stderr) => {
          if (error) {
            console.error(
              `❌ Erro na conversão (Cloud API - ${label}):`,
              error.message,
              String(stderr || "").slice(-500)
            );
            return reject(error);
          }
          resolve();
        }
      );
      child.on("error", err => reject(err));
    });

  try {
    await runStep(step1, "webm→wav");
    if (!fs.existsSync(tmpWavPath) || fs.statSync(tmpWavPath).size < 1024) {
      throw new Error("WAV intermediário vazio");
    }
    await runStep(step2, "wav→opus");
    if (!fs.existsSync(outputPath)) {
      throw new Error("ffmpeg não gerou arquivo de saída (cloud api)");
    }
  } catch (err) {
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    throw err;
  } finally {
    try { if (fs.existsSync(tmpWavPath)) fs.unlinkSync(tmpWavPath); } catch {}
  }

  return outputPath;
};

/**
 * ✅ Retorna a duração do áudio em segundos (inteiro, mínimo 1) usando
 * ffprobe. Usado para preencher explicitamente o campo `Seconds` do
 * AudioMessage do WhatsApp — a duração calculada aqui é sempre mais
 * confiável do que o parser de granule OGG do bridge Go, que falha
 * silenciosamente em certos streams e faz o cliente WhatsApp mostrar
 * "0:00".
 */
export const probeAudioSeconds = async (filePath: string): Promise<number> => {
  return new Promise<number>(resolve => {
    const cmd = `"${FFPROBE_BIN}" -v error -show_entries format=duration:stream=duration -of default=nw=1:nk=1 "${filePath}"`;
    exec(cmd, { timeout: 10000 }, (err, stdout) => {
      const candidates = String(stdout || "")
        .split(/\s+/)
        .map(v => Number.parseFloat(v))
        .filter(v => Number.isFinite(v) && v > 0);
      const best = candidates.length ? Math.max(...candidates) : 0;
      if (!err && best > 0) {
        // Use ceil instead of round: WhatsApp/iPhone renders 0:00 when a short
        // but valid voice note is rounded down before reaching the Go bridge.
        resolve(Math.ceil(best));
        return;
      }

      // Fallback mais forte: decodifica para PCM cru e calcula pelos bytes.
      // Isso independe do header/duração do WebM/OGG, que é justamente onde o
      // iPhone/WhatsApp costuma mostrar 0:00 quando o metadata vem incompleto.
      const sampleRate = 16000;
      const pcmCmd = `"${FFMPEG_BIN}" -hide_banner -loglevel error -i "${filePath}" -vn -ac 1 -ar ${sampleRate} -f s16le pipe:1`;
      exec(pcmCmd, { timeout: 15000, encoding: "buffer", maxBuffer: 1024 * 1024 * 64 }, (pcmErr, pcmStdout) => {
        if (pcmErr || !Buffer.isBuffer(pcmStdout) || pcmStdout.length < 2) {
          resolve(0);
          return;
        }
        const samples = Math.floor(pcmStdout.length / 2);
        const seconds = Math.ceil(samples / sampleRate);
        resolve(seconds > 0 ? seconds : 0);
      });
    });
  });
};



/**
 * ✅ Converte um áudio para MP3 (audio/mpeg).
 * Usado para gerar um "sibling" do .ogg que toca nativamente em iPhone/Safari,
 * onde o navegador não consegue reproduzir Opus de forma confiável.
 * Retorna o caminho do .mp3 gerado ou null em caso de falha (não-fatal).
 */
export const convertToMp3Sibling = async (
  inputPath: string
): Promise<string | null> => {
  try {
    const parsed = path.parse(inputPath);
    const outputPath = path.join(parsed.dir, `${parsed.name}.mp3`);

    await new Promise<void>((resolve, reject) => {
      const cmd = `"${FFMPEG_BIN}" -y -fflags +genpts+igndts -i "${inputPath}" -vn -af "aresample=async=1:first_pts=0" -c:a libmp3lame -b:a 64k -ar 44100 -ac 1 -avoid_negative_ts make_zero -write_xing 1 -f mp3 "${outputPath}"`;
      const child = exec(
        cmd,
        { timeout: AUDIO_CONVERT_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 16 },
        (error, _stdout, stderr) => {
          if (error) {
            try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
            return reject(error);
          }
          if (!fs.existsSync(outputPath)) {
            return reject(new Error("ffmpeg não gerou arquivo de saída (mp3)"));
          }
          return resolve();
        }
      );
      child.on("error", err => reject(err));
    });

    return outputPath;
  } catch (err) {
    console.warn(
      "[convertToMp3Sibling] Falha ao gerar mp3 alternativo:",
      (err as Error)?.message
    );
    return null;
  }
};

/**
 * Limpa arquivos temporários de áudio
 */
export const cleanupTempAudio = (filePath: string, delayMs: number = 5000): void => {
  setTimeout(() => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
    }
  }, delayMs);
};

/**
 * Obter configuração de áudio mobile padrão
 */
export const getMobileAudioOptions = (audioBuffer: Buffer) => {
  return {
    audio: audioBuffer,
    mimetype: MOBILE_AUDIO_CONFIG.mimetype,
    ptt: true // Sempre como push-to-talk para melhor compatibilidade
  };
};

/**
 * Validar se arquivo de áudio é válido
 */
export const validateAudioFile = (filePath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve(false);
        return;
      }
      
      // Verificar se tem stream de áudio
      const hasAudioStream = metadata.streams.some(stream => stream.codec_type === 'audio');
      
      if (!hasAudioStream) {
        resolve(false);
        return;
      }
      
      resolve(true);
    });
  });
};

/**
 * Obter informações do arquivo de áudio
 */
export const getAudioInfo = (filePath: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      
      const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
      
      if (!audioStream) {
        reject(new Error('Nenhum stream de áudio encontrado'));
        return;
      }
      
      resolve({
        duration: metadata.format.duration,
        bitrate: metadata.format.bit_rate,
        codec: audioStream.codec_name,
        sampleRate: audioStream.sample_rate,
        channels: audioStream.channels
      });
    });
  });
};