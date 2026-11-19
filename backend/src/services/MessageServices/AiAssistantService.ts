import OpenAI from "openai";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Prompt from "../../models/Prompt";
import logger from "../../utils/logger";
import { delay } from "../../utils/delay";
import { obterClienteIA } from "../../helpers/ControleDeIA";

interface AiSuggestReplyRequest {
  ticketId: string | number;
  companyId: number;
  userMessage?: string;
}

interface AiSummarizeRequest {
  ticketId: string | number;
  companyId: number;
}

const LANGUAGE_MAP: Record<string, string> = {
  "pt-BR": "Portuguese (Brazilian)",
  "pt": "Portuguese",
  "en": "English",
  "en-US": "English",
  "es": "Spanish",
  "ar": "Arabic",
  "tr": "Turkish",
  "fr": "French",
  "de": "German",
  "it": "Italian",
  "ja": "Japanese",
  "zh": "Chinese",
  "ko": "Korean",
  "ru": "Russian"
};

const TONE_MAP: Record<string, string> = {
  "amigavel": "friendly and approachable",
  "formal": "formal and professional",
  "tecnico": "technical and precise",
  "casual": "casual and relaxed",
  "empatico": "empathetic and understanding"
};

const getLanguageLabel = (langCode: string): string => {
  return LANGUAGE_MAP[langCode] || langCode;
};

const getOpenAiClient = async (companyId: number): Promise<{ client: OpenAI; model: string; prompt: Prompt } | null> => {
  const prompt = await Prompt.findOne({
    where: { companyId },
    order: [["id", "ASC"]]
  });

  if (prompt?.apiKey) {
    const model = prompt.aiModel || "gpt-4o-mini";
    // Cliente compartilhado por apiKey, com timeout e retries explicitos
    // (helpers/ControleDeIA.ts). Antes era `new OpenAI(...)` sem timeout:
    // o padrao do SDK e 10 MINUTOS com 2 retries, ou seja, uma unica
    // mensagem podia segurar a requisicao por meia hora.
    return { client: obterClienteIA(prompt.apiKey), model, prompt };
  }

  return null;
};

const buildLanguageInstruction = (prompt: Prompt): string => {
  try {
    const langs = JSON.parse(prompt.languages || '["pt-BR"]');
    const primaryLang = Array.isArray(langs) && langs.length > 0 ? langs[0] : "pt-BR";
    return `You MUST respond in ${getLanguageLabel(primaryLang)}.`;
  } catch {
    return "You MUST respond in Portuguese (Brazilian).";
  }
};

const buildPersonalityInstruction = (prompt: Prompt): string => {
  const parts: string[] = [];

  if (prompt.voiceTone) {
    const toneDesc = TONE_MAP[prompt.voiceTone] || prompt.voiceTone;
    parts.push(`Tone: ${toneDesc}.`);
  }

  if (prompt.personality) {
    parts.push(`Personality: ${prompt.personality}.`);
  }

  if (prompt.prompt) {
    parts.push(`Context: ${prompt.prompt}`);
  }

  return parts.join(" ");
};

const getConversationMessages = async (ticketId: string | number, limit = 50): Promise<Message[]> => {
  const messages = await Message.findAll({
    where: { ticketId },
    order: [["createdAt", "DESC"]],
    limit,
    include: [{ model: Contact, as: "contact", attributes: ["name"] }]
  });
  return messages.reverse();
};

const formatMessagesForAi = (messages: Message[], contactName: string): string => {
  return messages.map(msg => {
    const sender = msg.fromMe ? "Agent" : contactName;
    return `${sender}: ${msg.body}`;
  }).join("\n");
};

export const suggestReply = async ({ ticketId, companyId, userMessage }: AiSuggestReplyRequest): Promise<string> => {
  const aiConfig = await getOpenAiClient(companyId);
  if (!aiConfig) {
    throw new Error("No AI agent configured with API key. Configure an AI agent first.");
  }

  const { client, model, prompt: agentPrompt } = aiConfig;

  const ticket = await Ticket.findByPk(ticketId, {
    include: [{ model: Contact, as: "contact" }]
  });

  if (!ticket) throw new Error("Ticket não encontrado");

  const messages = await getConversationMessages(ticketId);
  const contactName = ticket.contact?.name || "Cliente";
  const conversation = formatMessagesForAi(messages, contactName);

  const langInstruction = buildLanguageInstruction(agentPrompt);
  const personalityInstruction = buildPersonalityInstruction(agentPrompt);

  const systemPrompt = `You are a customer service assistant. Your task is to suggest a professional and empathetic response for the agent to send to the customer.

${langInstruction}
${personalityInstruction}

Rules:
- Respond ONLY with the suggested message, no additional explanations
- The response MUST be entirely in the language specified above
- Be professional, cordial and objective
- Use natural and friendly language
- Do not use markdown formatting
- The response should be short and direct (maximum 3-4 sentences)
- If there is context from the customer's last message, respond specifically to it
- Maintain a professional customer support tone`;

  const userPrompt = userMessage 
    ? `Current conversation:\n${conversation}\n\nThe agent wants to respond about: "${userMessage}"\n\nSuggest a response:`
    : `Current conversation:\n${conversation}\n\nSuggest a response to the customer's last message:`;

  const temperature = agentPrompt.temperature ?? 0.7;
  const maxTokens = agentPrompt.maxTokens ?? 500;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature
  });

  const result = response.choices[0]?.message?.content || "";

  // Apply configured delay
  const responseDelay = agentPrompt.responseDelay ?? 0;
  if (responseDelay > 0) {
    await delay(responseDelay * 1000);
  }

  return result || "Could not generate a suggestion.";
};

export const summarizeConversation = async ({ ticketId, companyId }: AiSummarizeRequest): Promise<string> => {  const aiConfig = await getOpenAiClient(companyId);
  if (!aiConfig) {
    throw new Error("No AI agent configured with API key. Configure an AI agent first.");
  }

  const { client, model, prompt: agentPrompt } = aiConfig;

  const ticket = await Ticket.findByPk(ticketId, {
    include: [{ model: Contact, as: "contact" }]
  });

  if (!ticket) throw new Error("Ticket não encontrado");

  const messages = await getConversationMessages(ticketId, 200);
  const contactName = ticket.contact?.name || "Cliente";
  const conversation = formatMessagesForAi(messages, contactName);

  const langInstruction = buildLanguageInstruction(agentPrompt);

  const systemPrompt = `You are an assistant specialized in analyzing customer service conversations.

${langInstruction}
ALL section headers, labels, bullet points, and content MUST be written in the same language specified above. Do NOT use English headers if the language is not English.

Your task is to generate a complete and structured summary of the conversation.

The summary MUST contain these sections (translate the section names to the target language):
1. Main Subject - The reason for contact in one sentence
2. Conversation Summary - The main points discussed (3-5 topics)
3. Customer Requests - What the customer asked for or needed
4. Actions Taken - What the agent did or promised to do
5. Status/Resolution - Whether the problem was resolved and how, or if it's pending
6. Observations - Any attention points or necessary follow-up

Use clear formatting with bullet points. Be concise but complete. Remember: EVERYTHING must be in the specified language.`;

  const userPrompt = `Analyze and summarize this customer service conversation between the agent and ${contactName}:\n\n${conversation}`;

  const temperature = agentPrompt.temperature != null ? Math.min(agentPrompt.temperature, 0.5) : 0.3;
  const maxTokens = agentPrompt.maxTokens ? Math.max(agentPrompt.maxTokens, 1000) : 1000;

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature
  });

  const result = response.choices[0]?.message?.content || "";

  // Apply configured delay
  const responseDelay = agentPrompt.responseDelay ?? 0;
  if (responseDelay > 0) {
    await delay(responseDelay * 1000);
  }

  return result || "Could not generate the summary.";
};

interface AiGenerateVariantsRequest {
  companyId: number;
  baseMessage: string;
  count?: number;
}

// Usada pelo botão "Gerar 5 variantes da mensagem" no CampaignModal. Pede pra
// IA reescrever a mensagem base de N jeitos diferentes (mesmo sentido, texto
// variado) — é o "spintax por IA" que preenche as abas Variação 2..5
// automaticamente, reduzindo o padrão repetitivo de texto que dispara
// bloqueio anti-spam do WhatsApp quando a mesma frase é mandada em massa.
export const generateMessageVariants = async ({
  companyId,
  baseMessage,
  count = 5
}: AiGenerateVariantsRequest): Promise<string[]> => {
  const aiConfig = await getOpenAiClient(companyId);
  if (!aiConfig) {
    throw new Error("No AI agent configured with API key. Configure an AI agent first.");
  }
  if (!baseMessage || !baseMessage.trim()) {
    throw new Error("Escreva a Mensagem 1 antes de gerar variantes.");
  }

  const { client, model, prompt: agentPrompt } = aiConfig;
  const langInstruction = buildLanguageInstruction(agentPrompt);
  const n = Math.min(Math.max(count, 1), 5);

  const systemPrompt = `You are a copywriting assistant for WhatsApp broadcast campaigns.

${langInstruction}

Your task: rewrite the given message in ${n} different ways, keeping the SAME
meaning, tone and call to action, but varying the wording, sentence order and
punctuation enough that the messages look distinct to spam/pattern detection
systems.

Rules:
- Output EXACTLY ${n} variants, one per line, each starting with "1)" "2)" etc.
- Never translate or alter placeholders that look like {word} (e.g. {nome},
  {numero}, {email}, {empresa}, {cidade}, {protocol}, {atendente},
  {greeting}, {primeiroNome}) — copy them verbatim, in the same relative
  position/meaning as the original.
- Keep roughly the same length as the original message.
- Do not add explanations, headers, or anything besides the ${n} numbered
  lines.
- The response MUST be entirely in the language specified above.`;

  const userPrompt = `Original message:\n"""${baseMessage}"""\n\nGenerate ${n} variants now.`;

  const temperature = Math.max(agentPrompt.temperature ?? 0.7, 0.7); // precisa de alguma criatividade pra variar de verdade
  const maxTokens = Math.max(agentPrompt.maxTokens ?? 500, 600);

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: maxTokens,
    temperature
  });

  const raw = response.choices[0]?.message?.content || "";

  // Parse das linhas "1) texto" / "1. texto" / "1 - texto" — tolera os
  // formatos mais comuns que o modelo pode usar mesmo pedindo um específico.
  const variants = raw
    .split("\n")
    .map(line => line.trim())
    .filter(line => /^\d+[).\-]\s*/.test(line))
    .map(line => line.replace(/^\d+[).\-]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, n);

  if (variants.length === 0) {
    throw new Error("A IA não retornou variantes num formato reconhecível. Tente novamente.");
  }

  return variants;
};
