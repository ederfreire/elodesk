import OpenAI from "openai";
import fs from "fs";
import path from "path";
import logger from "../utils/logger";
import { obterClienteIA } from "./ControleDeIA";

// Vozes disponíveis na OpenAI TTS
export const OPENAI_TTS_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", 
  "onyx", "nova", "sage", "shimmer"
] as const;

export type OpenAiTTSVoice = typeof OPENAI_TTS_VOICES[number];

/**
 * Gera áudio via OpenAI TTS API e salva em arquivo MP3
 */
export const generateOpenAiTTS = async (
  text: string,
  outputPath: string,
  apiKey: string,
  voice: OpenAiTTSVoice = "nova",
  model: string = "tts-1"
): Promise<string> => {
  try {
    // Cliente compartilhado por apiKey, com timeout e retries explicitos
    // (helpers/ControleDeIA.ts). Antes era `new OpenAI(...)` sem timeout:
    // o padrao do SDK e 10 MINUTOS com 2 retries, ou seja, uma unica
    // mensagem podia segurar a requisicao por meia hora.
    const openai = obterClienteIA(apiKey);

    // Limitar texto a 4096 caracteres (limite da API)
    const truncatedText = text.length > 4096 
      ? text.substring(0, 4093) + "..." 
      : text;

    const mp3Path = `${outputPath}.mp3`;

    const response = await openai.audio.speech.create({
      model: model, // "tts-1" (rápido) ou "tts-1-hd" (alta qualidade)
      voice: voice,
      input: truncatedText,
      response_format: "mp3",
      speed: 1.0,
    });

    // Converter response em buffer e salvar
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(mp3Path, buffer);

    logger.info(`[OpenAI TTS] Áudio gerado com sucesso: ${mp3Path} (${buffer.length} bytes)`);
    return mp3Path;
  } catch (error: any) {
    logger.error(`[OpenAI TTS] Erro ao gerar áudio:`, error?.message || error);
    throw error;
  }
};

/**
 * Verifica se uma voz é válida para OpenAI TTS
 */
export const isValidOpenAiVoice = (voice: string): voice is OpenAiTTSVoice => {
  return OPENAI_TTS_VOICES.includes(voice as OpenAiTTSVoice);
};

/**
 * Mapeia nomes amigáveis para vozes OpenAI
 */
export const VOICE_DESCRIPTIONS: Record<OpenAiTTSVoice, string> = {
  alloy: "Neutra e equilibrada",
  ash: "Masculina, suave",
  ballad: "Feminina, expressiva",
  coral: "Feminina, clara",
  echo: "Masculina, profunda",
  fable: "Masculina, britânica",
  onyx: "Masculina, grave",
  nova: "Feminina, energética",
  sage: "Masculina, calma",
  shimmer: "Feminina, delicada",
};
