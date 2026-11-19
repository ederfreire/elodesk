import OpenAI from "openai";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Prompt from "../../models/Prompt";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import { saveWebchatMessage } from "./WebchatHelpers";
import { obterClienteIA } from "../../helpers/ControleDeIA";

// Debounce: agrega mensagens em rajada do visitante e responde uma só vez.
const pendingRuns: Map<string, number> = new Map();
const AGGREGATE_WINDOW_MS = 3000;

const loadPrompt = async (ticket: Ticket): Promise<Prompt | null> => {
  let promptId: number | null = (ticket as any).promptId || null;
  if (!promptId) {
    const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
    promptId = (whatsapp as any)?.promptId || null;
  }
  if (!promptId) return null;
  return Prompt.findByPk(promptId);
};

export const respondToWebchatVisitor = async (
  ticket: Ticket,
  contact: Contact
): Promise<void> => {
  try {
    if (contact.disableBot) return;

    // Debounce por ticket
    const key = String(ticket.id);
    const stamp = Date.now();
    pendingRuns.set(key, stamp);
    await new Promise((r) => setTimeout(r, AGGREGATE_WINDOW_MS));
    if (pendingRuns.get(key) !== stamp) return; // outra mensagem chegou
    pendingRuns.delete(key);

    const prompt = await loadPrompt(ticket);
    if (!prompt || !prompt.apiKey || !prompt.prompt) {
      logger.info(`[Webchat AI] Sem prompt/apiKey configurado - ticket ${ticket.id}`);
      return;
    }

    const maxMessages = prompt.maxMessages || 10;
    const history = await Message.findAll({
      where: { ticketId: ticket.id },
      order: [["createdAt", "DESC"]],
      limit: maxMessages
    });
    history.reverse();

    const messages: any[] = [
      { role: "system", content: prompt.prompt }
    ];
    for (const m of history) {
      if (!m.body) continue;
      messages.push({
        role: m.fromMe ? "assistant" : "user",
        content: m.body
      });
    }

    // Cliente compartilhado por apiKey, com timeout e retries explicitos
    // (helpers/ControleDeIA.ts). Antes era `new OpenAI(...)` sem timeout:
    // o padrao do SDK e 10 MINUTOS com 2 retries, ou seja, uma unica
    // mensagem podia segurar a requisicao por meia hora.
    const openai = obterClienteIA(prompt.apiKey);
    const completion = await openai.chat.completions.create({
      model: (prompt as any).aiModel || "gpt-4o-mini",
      temperature: Number(prompt.temperature ?? 1),
      max_tokens: prompt.maxTokens || 300,
      messages
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) return;

    await saveWebchatMessage({
      ticket,
      contact,
      body: reply,
      fromMe: true
    });
  } catch (err: any) {
    logger.error(`[Webchat AI] Falha ao responder ticket ${ticket.id}: ${err?.message || err}`);
  }
};