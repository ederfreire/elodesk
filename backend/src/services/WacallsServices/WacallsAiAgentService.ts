import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import axios from "axios";
import FormData from "form-data";
import { isNil } from "lodash";
import OpenAI from "openai";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import ShowPromptService from "../PromptServices/ShowPromptService";
import ShowContactService from "../ContactServices/ShowContactService";
import {
  resolveTransferTarget,
  applyAiTransfer,
  detectAiTransferIntent,
  getSafeAiTransferFallbackQueueId
} from "../WbotServices/wbotMessageListener";
import { SendWacallsText, SendWacallsMediaMessage } from "./SendWacallsMessageService";
import logger from "../../utils/logger";
import { FFMPEG_BIN } from "../../utils/ffmpegPath";
import { obterClienteIA, janelaDeHistorico, executarComControle } from "../../helpers/ControleDeIA";

/**
 * Agente de IA (Prompt) pro canal wacalls (WhatsApp Plus - Voz + Msg).
 *
 * Fork simplificado do trecho equivalente de
 * WhatsAppOficial/ReceivedWhatsApp.ts ("AGENTE DE IA - Processar mensagens
 * via promptId do ticket"), mesmo padrão adotado lá: chamada direta à OpenAI
 * (sem function-calling/tools) em vez de reaproveitar handleOpenAi/
 * handleOpenAiFlow do wbotMessageListener.ts, que são profundamente
 * acoplados ao objeto `wbot` do Baileys. As peças de transferência
 * (resolveTransferTarget/applyAiTransfer/detectAiTransferIntent/
 * getSafeAiTransferFallbackQueueId) já são agnósticas de wbot (o canal
 * whatsapp_oficial já as reaproveita do mesmo jeito) — só o envio final da
 * resposta troca pra SendWacallsText/SendWacallsMediaMessage.
 *
 * Chamado por WacallsBotEngine.ts tanto pra continuação de uma conversa já
 * vinculada ao ticket (`ticket.promptId`, aplicado via ApplyQueueAiAgent —
 * fila com agente) quanto pro Agente de IA vinculado direto à conexão
 * (`whatsapp.promptId`, passado via `options.promptIdOverride`, SEM
 * persistir no ticket — ver comentário em WacallsBotEngine.ts sobre por que
 * isso importa pro FlowBuilder continuar funcionando).
 */

// Mesmos caracteres invisíveis tratados em WhatsAppOficial/ReceivedWhatsApp.ts
// (ZERO WIDTH SPACE/NON-JOINER/JOINER/LTR MARK/RTL MARK + BOM) — montados por
// código de caractere (String.fromCharCode) em vez de literal na
// string-fonte, pra não depender de nenhum caractere invisível sobreviver
// intacto ao salvar/ler o arquivo.
const INVISIBLE_CHARS = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0xfeff]
  .map(code => String.fromCharCode(code))
  .join("");
const INVISIBLE_CHARS_RE = new RegExp(`[${INVISIBLE_CHARS}]`, "g");
const ZWNJ = String.fromCharCode(0x200e); // ‎ — mesmo prefixo "invisível" usado no envio (evita link preview/autoformat estranho)

const stripInvisibleText = (value?: string | null): string =>
  (value || "").replace(INVISIBLE_CHARS_RE, "").trim();

const hasVisibleText = (value?: string | null): boolean =>
  stripInvisibleText(value).length > 0;

const aiTransferRegex = /A[çc][ãa]o:\s*Transferir(?:\s+para\s+(?:o\s+setor\s+de\s+)?(.+?))?(?:\.|!|\n|$)/i;
const aiSameQueueFallbackMessage = "Você já está na fila correta. Como posso te ajudar?";

interface WacallsAiAgentOptions {
  // Prompt vinculado direto na conexão (whatsapp.promptId) em vez de
  // persistido no ticket — ver WacallsBotEngine.ts passo 6.
  promptIdOverride?: number;
  // Presente quando a mensagem recebida é um áudio — precisa ser transcrito
  // antes de virar entrada pra IA (se o Prompt tiver transcribeAudio
  // habilitado).
  incomingAudio?: { mediaUrl?: string; mimetype?: string; wid?: string };
}

const pickTranscriptionText = (payload: any): string => {
  if (typeof payload === "string") return payload.trim();
  if (!payload || typeof payload !== "object") return "";

  const value =
    payload.text ||
    payload.transcription ||
    payload.transcript ||
    payload.result ||
    payload.data?.text ||
    payload.data?.transcription ||
    payload.data?.transcript ||
    payload.data;

  return typeof value === "string" ? value.trim() : "";
};

const contentTypeForAudio = (mimetype?: string): string => {
  const clean = String(mimetype || "").split(";")[0].trim();
  return clean || "audio/ogg";
};

const extensionForAudio = (mimetype?: string, sourceName?: string): string => {
  const cleanMime = contentTypeForAudio(mimetype).toLowerCase();
  if (cleanMime.includes("wav")) return ".wav";
  if (cleanMime.includes("mpeg") || cleanMime.includes("mp3")) return ".mp3";
  if (cleanMime.includes("mp4") || cleanMime.includes("m4a")) return ".m4a";
  if (cleanMime.includes("aac")) return ".aac";
  if (cleanMime.includes("webm")) return ".webm";
  if (cleanMime.includes("flac")) return ".flac";
  if (cleanMime.includes("ogg") || cleanMime.includes("opus")) return ".ogg";

  const ext = path.extname(String(sourceName || "").split("?")[0]).toLowerCase();
  return ext && /^\.[a-z0-9]{2,5}$/.test(ext) ? ext : ".ogg";
};

const normalizeAudioToWav = async (inputPath: string, outputPath: string, ticketId: number): Promise<boolean> => {
  return new Promise<boolean>(resolve => {
    execFile(
      FFMPEG_BIN,
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-fflags",
        "+genpts+igndts",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        outputPath
      ],
      { timeout: 45000, maxBuffer: 1024 * 1024 * 8 },
      (error, _stdout, stderr) => {
        if (error) {
          logger.warn(
            `[AI AGENT WACALLS] Falha ao normalizar áudio para WAV - ticket ${ticketId}: ${error.message} ${String(stderr || "").slice(-300)}`
          );
          resolve(false);
          return;
        }

        try {
          const stat = fs.statSync(outputPath);
          resolve(stat.size > 1024);
        } catch {
          resolve(false);
        }
      }
    );
  });
};

const resolveLocalWacallsAudioPath = (mediaUrl: string, companyId: number): string | null => {
  const raw = String(mediaUrl || "").trim();
  if (!raw || /^https?:\/\//i.test(raw)) return null;

  const publicRoot = path.resolve(__dirname, "..", "..", "..", "public");
  const companyRoot = path.join(publicRoot, `company${companyId}`);
  const decoded = (() => {
    try {
      return decodeURIComponent(raw.replace(/^file:\/\//i, ""));
    } catch {
      return raw.replace(/^file:\/\//i, "");
    }
  })();

  const candidates: string[] = [];
  if (path.isAbsolute(decoded)) candidates.push(decoded);

  const normalized = decoded.replace(/\\/g, "/");
  const publicMarker = `/public/company${companyId}/`;
  const publicIdx = normalized.indexOf(publicMarker);
  if (publicIdx >= 0) {
    candidates.push(path.join(companyRoot, normalized.slice(publicIdx + publicMarker.length)));
  }

  const companyMarker = `company${companyId}/`;
  const companyIdx = normalized.indexOf(companyMarker);
  if (companyIdx >= 0) {
    candidates.push(path.join(publicRoot, normalized.slice(companyIdx)));
  }

  candidates.push(path.join(companyRoot, normalized.replace(/^\/+/, "")));
  candidates.push(path.join(companyRoot, path.basename(normalized)));

  return candidates.find(candidate => fs.existsSync(candidate)) || null;
};

/**
 * Baixa o áudio recebido (mediaUrl servida pelo microserviço wacalls-chat) e
 * transcreve via TRANSCRIBE_URL local (se configurado) ou OpenAI Whisper
 * como fallback — mesmo padrão de OpenAiService.ts/handleOpenAiFlow.
 */
const transcribeWacallsAudio = async (
  audio: { mediaUrl?: string; mimetype?: string },
  apiKey: string,
  ticketId: number,
  companyId: number
): Promise<string> => {
  if (!audio.mediaUrl) return "";

  const localAudioPath = resolveLocalWacallsAudioPath(audio.mediaUrl, companyId);
  const audioContentType = contentTypeForAudio(audio.mimetype);

  const tmpDir = path.resolve(__dirname, "..", "..", "..", "public", "tmp-wacalls-ai");
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
  } catch {
    /* ignora — se já existir ou não tiver permissão, tenta seguir assim mesmo */
  }
  const tmpBase = `${ticketId}_in_${Date.now()}`;
  const tmpSourcePath = path.join(tmpDir, `${tmpBase}${extensionForAudio(audio.mimetype, audio.mediaUrl)}`);
  const tmpWavPath = path.join(tmpDir, `${tmpBase}.wav`);
  let downloadedTmpPath: string | null = null;
  let normalizedTmpPath: string | null = null;

  try {
    let sourceAudioPath = localAudioPath;
    let sourceContentType = audioContentType;

    if (!sourceAudioPath) {
      if (!/^https?:\/\//i.test(String(audio.mediaUrl))) {
        logger.warn(`[AI AGENT WACALLS] Áudio local não encontrado para transcrição - ticket ${ticketId}: ${audio.mediaUrl}`);
        return "";
      }

      const downloadResponse = await axios.get(audio.mediaUrl, { responseType: "arraybuffer" });
      fs.writeFileSync(tmpSourcePath, Buffer.from(downloadResponse.data));
      downloadedTmpPath = tmpSourcePath;
      sourceAudioPath = tmpSourcePath;
      sourceContentType = contentTypeForAudio(String(downloadResponse.headers["content-type"] || audioContentType));
    }

    if (!fs.existsSync(sourceAudioPath)) {
      logger.warn(`[AI AGENT WACALLS] Arquivo de áudio não existe no disco - ticket ${ticketId}: ${sourceAudioPath}`);
      return "";
    }

    const wavReady = await normalizeAudioToWav(sourceAudioPath, tmpWavPath, ticketId);
    const transcriptionPath = wavReady ? tmpWavPath : sourceAudioPath;
    const transcriptionContentType = wavReady ? "audio/wav" : sourceContentType;
    const transcriptionFilename = wavReady ? "audio.wav" : path.basename(sourceAudioPath) || "audio.ogg";
    if (wavReady) normalizedTmpPath = tmpWavPath;

    if (process.env.TRANSCRIBE_URL) {
      try {
        const form = new FormData();
        form.append("audio", fs.createReadStream(transcriptionPath), {
          filename: transcriptionFilename,
          contentType: transcriptionContentType
        });
        const res = await axios.request({
          method: "post",
          maxBodyLength: Infinity,
          url: `${process.env.TRANSCRIBE_URL}/transcrever`,
          headers: {
            ...(process.env.TRANSCRIBE_API_KEY ? { Authorization: `Bearer ${process.env.TRANSCRIBE_API_KEY}` } : {}),
            ...form.getHeaders()
          },
          data: form
        });
        const text = pickTranscriptionText(res.data);
        if (hasVisibleText(text)) return text.trim();
      } catch (localErr: any) {
        logger.warn(
          `[AI AGENT WACALLS] Falha na transcrição local, tentando OpenAI Whisper - ticket ${ticketId}: ${localErr?.message}`
        );
      }
    }

    // Cliente compartilhado por apiKey, com timeout e retries explicitos
    // (helpers/ControleDeIA.ts). Antes era `new OpenAI(...)` sem timeout:
    // o padrao do SDK e 10 MINUTOS com 2 retries, ou seja, uma unica
    // mensagem podia segurar a requisicao por meia hora.
    const openaiWhisper = obterClienteIA(apiKey);
    const result = await openaiWhisper.audio.transcriptions.create({
      model: "whisper-1",
      file: fs.createReadStream(transcriptionPath)
    });
    return (result.text || "").trim();
  } catch (error: any) {
    logger.error(`[AI AGENT WACALLS] Erro ao transcrever áudio - ticket ${ticketId}:`, error);
    return "";
  } finally {
    for (const filePath of [downloadedTmpPath, normalizedTmpPath]) {
      if (!filePath) continue;
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* arquivo temporário pode nem ter chegado a ser criado */
      }
    }
  }
};

export const handleWacallsAiAgent = async (
  ticket: Ticket,
  contact: Contact,
  userText: string,
  options: WacallsAiAgentOptions = {}
): Promise<void> => {
  try {
    const effectivePromptId = options.promptIdOverride ?? ticket.promptId;

    if (ticket.imported || ticket.isGroup || ticket.userId || isNil(effectivePromptId)) {
      return;
    }

    const companyId = ticket.companyId;
    const promptRecord = await ShowPromptService({
      promptId: effectivePromptId as number,
      companyId
    });
    if (!promptRecord) return;
    if ((promptRecord as any).active === false) return;

    // Cliente compartilhado por apiKey, com timeout e retries explicitos
    // (helpers/ControleDeIA.ts). Antes era `new OpenAI(...)` sem timeout:
    // o padrao do SDK e 10 MINUTOS com 2 retries, ou seja, uma unica
    // mensagem podia segurar a requisicao por meia hora.
    const openai = obterClienteIA(promptRecord.apiKey);

    // ---- Transcrição, se a mensagem recebida for um áudio ----
    // O cliente mandando áudio deve receber resposta em áudio (quando
    // responseMode === "both") — ver `shouldSendAudioReply` mais abaixo.
    const hasIncomingAudio = !!options.incomingAudio?.mediaUrl;
    let effectiveUserText = userText;

    if (hasIncomingAudio) {
      if (!(promptRecord as any).transcribeAudio) {
        await SendWacallsText({
          body: `${ZWNJ} Desculpe, no momento só consigo processar mensagens de texto. Por favor, envie sua pergunta por escrito.`,
          ticket
        });
        return;
      }

      const audioToTranscribe = options.incomingAudio;
      if (!audioToTranscribe) return;

      const transcription = await transcribeWacallsAudio(
        audioToTranscribe,
        promptRecord.apiKey,
        ticket.id,
        companyId
      );

      if (!hasVisibleText(transcription)) {
        await SendWacallsText({
          body: `${ZWNJ} Desculpe, não consegui entender o áudio. Tente novamente ou envie uma mensagem de texto.`,
          ticket
        });
        return;
      }

      await SendWacallsText({ body: `${ZWNJ} 🎤 *Sua mensagem de voz:* ${transcription}`, ticket });
      if (options.incomingAudio?.wid) {
        try {
          await Message.update(
            { body: transcription, transcrito: true } as any,
            { where: { wid: options.incomingAudio.wid, companyId } }
          );
        } catch (updateErr: any) {
          logger.warn(`[AI AGENT WACALLS] Não consegui salvar transcrição no histórico - ticket ${ticket.id}: ${updateErr?.message}`);
        }
      }
      effectiveUserText = transcription;
    }

    // responseMode: "text" = sempre texto, "audio" = sempre áudio, "both" =
    // responde no mesmo formato que o cliente mandou (áudio → áudio, texto →
    // texto) — pedido explícito do usuário, diferente do canal baileys (lá
    // "both" manda texto E áudio juntos, sempre).
    const responseMode = (promptRecord as any).responseMode || "text";
    const shouldSendAudioReply = responseMode === "audio" || (responseMode === "both" && hasIncomingAudio);
    const shouldSendTextReply = !shouldSendAudioReply;

    const sendAgentReply = async (text: string): Promise<void> => {
      const clean = stripInvisibleText(text);
      if (!clean) return;

      if (!shouldSendAudioReply) {
        await SendWacallsText({ body: `${ZWNJ} ${clean}`, ticket });
        return;
      }

      try {
        const { generateOpenAiTTS, isValidOpenAiVoice } = await import("../../helpers/OpenAiTTS");
        const { convertToMobileAudio } = await import("../../utils/AudioUtils");
        const agentVoice = isValidOpenAiVoice((promptRecord as any).agentVoice || "")
          ? (promptRecord as any).agentVoice!
          : "nova";
        const publicFolder = path.resolve(__dirname, "..", "..", "..", "public", `company${companyId}`);
        try {
          fs.mkdirSync(publicFolder, { recursive: true });
        } catch {
          /* já deve existir na prática */
        }
        const fileNameTTS = `${ticket.id}_tts_${Date.now()}`;
        const outputPath = `${publicFolder}/${fileNameTTS}`;

        const mp3Path = await generateOpenAiTTS(clean, outputPath, promptRecord.apiKey, agentVoice as any);

        let audioPath = mp3Path;
        let audioMime = "audio/mpeg";
        try {
          audioPath = await convertToMobileAudio(mp3Path, publicFolder);
          audioMime = "audio/ogg; codecs=opus";
        } catch (convErr) {
          logger.error(`[AI AGENT WACALLS] Falha ao converter TTS pra OGG/Opus - ticket ${ticket.id}:`, convErr);
        }

        const audioFileName = path.basename(audioPath);
        await SendWacallsMediaMessage({
          ticket,
          media: {
            fieldname: "medias",
            originalname: audioFileName,
            encoding: "7bit",
            mimetype: audioMime,
            filename: audioFileName,
            path: audioPath
          } as Express.Multer.File
        });

        try {
          fs.unlinkSync(mp3Path);
        } catch {
          /* ignora */
        }
        if (audioPath !== mp3Path) {
          try {
            fs.unlinkSync(audioPath);
          } catch {
            /* ignora */
          }
        }
      } catch (ttsError) {
        logger.error(`[AI AGENT WACALLS] Erro no TTS, enviando texto - ticket ${ticket.id}:`, ttsError);
        await SendWacallsText({ body: `${ZWNJ} ${clean}`, ticket });
      }
    };

    // DESC + reverse: ver comentário longo em OpenAiService.ts. `ASC + limit`
    // devolvia as mensagens mais ANTIGAS do atendimento, então a IA nunca via
    // o contexto recente depois que a conversa passava do limite.
    const messages = (await Message.findAll({
      where: { ticketId: ticket.id },
      order: [["createdAt", "DESC"]],
      limit: janelaDeHistorico(promptRecord.maxMessages)
    })).reverse();

    const freshContact = await ShowContactService(ticket.contactId, companyId);
    const contactName = freshContact.name || "Amigo(a)";

    const companyQueues = await Queue.findAll({
      where: { companyId },
      attributes: ["id", "name"]
    });
    const queueNames = companyQueues.map(q => q.name).join(", ");

    // BASE DE CONHECIMENTO — não existia neste caminho. O agente de IA do
    // WhatsApp Plus roda por aqui (e não pelo OpenAiService.ts, usado pelo
    // Baileys/Oficial), e este prompt era montado só com o texto do Prompt.
    // Resultado: a base cadastrada era simplesmente ignorada nas conexões
    // WhatsApp Plus — a IA respondia "não tenho essa informação" mesmo com
    // tudo cadastrado. Agora carrega igual aos outros canais.
    let knowledgeContext = "";
    try {
      const { default: PromptKnowledgeBase } = await import(
        "../../models/PromptKnowledgeBase"
      );
      const knowledgeItems = await PromptKnowledgeBase.findAll({
        where: { promptId: promptRecord.id, companyId, active: true }
      });
      logger.info(
        `[WACALLS AI] Base de conhecimento: ${knowledgeItems?.length || 0} item(ns) ativo(s) para promptId=${promptRecord.id} (empresa ${companyId}, ticket ${ticket.id})`
      );
      if (knowledgeItems?.length) {
        const textParts: string[] = [];
        for (const item of knowledgeItems) {
          if (!(item as any).mediaUrl) {
            textParts.push(`[${(item as any).name}]:\n${(item as any).content || ""}`);
          }
        }
        if (textParts.length) {
          knowledgeContext =
            "\n\n=== BASE DE CONHECIMENTO (FONTE OFICIAL — TEM PRIORIDADE) ===\n" +
            "As informações abaixo foram cadastradas pela empresa e são a fonte oficial de verdade. Elas PREVALECEM sobre suposições suas e sobre conhecimento geral. Se a resposta estiver aqui, responda com base nela — literalmente quando for preço, prazo, link ou condição.\n" +
            textParts.join("\n\n---\n\n") +
            "\n\nAntes de dizer que não sabe ou que vai verificar, releia a base acima. Só diga que não tem a informação quando ela realmente não constar aqui.\n";
        }
      }
    } catch (err: any) {
      logger.warn(`[WACALLS AI] Falha ao carregar base de conhecimento: ${err?.message}`);
    }

    const promptSystem = `REGRA DE USO DO NOME: O nome do cliente é "${contactName}". Use o nome APENAS na primeira saudação da conversa. Nas mensagens seguintes, NÃO repita o nome — converse de forma natural e humanizada, como uma pessoa real. Só volte a citar o nome em momentos pontuais (encerramento, confirmação importante). NUNCA comece toda mensagem com "Olá, [nome]" — soa robótico.\nSua resposta deve usar no máximo ${promptRecord.maxTokens} tokens e cuide para não truncar o final.\nQuando a resposta requer uma transferência para atendimento humano, comece sua resposta com 'Ação: Transferir para [nome do setor]'.\nOs setores disponíveis são: ${queueNames}.\nSe o cliente não especificar o setor, use 'Ação: Transferir para o setor de atendimento' para transferir para o setor padrão.\n${promptRecord.prompt}\n${knowledgeContext}`;

    let messagesOpenAi: any[] = [{ role: "system", content: promptSystem }];

    for (let i = 0; i < Math.min(promptRecord.maxMessages, messages.length); i++) {
      const msg = messages[i];
      if (options.incomingAudio?.wid && msg.wid === options.incomingAudio.wid) continue;
      if (
        (
          msg.mediaType === "conversation" ||
          msg.mediaType === "extendedTextMessage" ||
          msg.mediaType === "chat" ||
          (msg.mediaType === "audio" && msg.transcrito)
        ) &&
        hasVisibleText(msg.body)
      ) {
        messagesOpenAi.push({
          role: msg.fromMe ? "assistant" : "user",
          content: stripInvisibleText(msg.body)
        });
      }
    }

    messagesOpenAi.push({ role: "user", content: stripInvisibleText(effectiveUserText) || "Olá" });

    const aiModel = ticket.aiModel || (promptRecord as any).aiModel || "gpt-4.1-mini";
    const chat = await openai.chat.completions.create({
      model: aiModel,
      messages: messagesOpenAi,
      max_tokens: promptRecord.maxTokens,
      temperature: promptRecord.temperature
    });

    let response = chat.choices[0].message?.content;

    // Detectar "Ação: Transferir para [nome da fila]"
    const transferMatch = response ? response.match(aiTransferRegex) : null;
    const aiSays = hasVisibleText(response) && !!(transferMatch || detectAiTransferIntent(response || ""));
    const userAsks = detectAiTransferIntent(effectiveUserText || "");

    if (aiSays || userAsks) {
      const requested = transferMatch?.[1]?.trim() || "";
      const combined = `${requested} ${effectiveUserText} ${response || ""}`;
      const { queue: tQueue, user: tUser } = await resolveTransferTarget(
        companyId,
        combined,
        getSafeAiTransferFallbackQueueId((promptRecord as any).queueId, ticket.queueId)
      );

      if (tQueue) {
        const isSameQueueTransfer =
          Number(tQueue.id) === Number(ticket.queueId) &&
          (!tUser?.id || Number(tUser.id) === Number(ticket.userId));
        if (response && transferMatch) {
          response = response.replace(aiTransferRegex, "").trim();
        }
        const transferred = isSameQueueTransfer ? false : await applyAiTransfer(ticket, freshContact, tQueue, tUser);
        const responseBody = stripInvisibleText(response) || (transferred ? "" : aiSameQueueFallbackMessage);

        if (hasVisibleText(responseBody)) {
          await sendAgentReply(responseBody);
        }

        if (transferred || isSameQueueTransfer) return;
      }
      logger.warn(`[AI AGENT WACALLS] Transferência solicitada sem fila válida - ticket ${ticket.id}`);
    }

    // Sanitiza rótulos de ação ("Ação: Transferir para X") que a IA às vezes
    // vaza no texto pro cliente.
    if (response) {
      response = response
        .replace(/^\s*(?:[-*•]\s*)?(?:a[cç][aã]o|action|acao)\s*[:：]\s*.*$/gim, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    if (hasVisibleText(response)) {
      await sendAgentReply(response || "");
    }
  } catch (error) {
    logger.error(`[AI AGENT WACALLS] Erro ao processar agente de IA para ticket ${ticket.id}:`, error);
  }
};

export default handleWacallsAiAgent;
