/**
 * Gera a saudação padrão de um agente de IA no idioma configurado no Prompt.
 * Usa o primeiro idioma do array `languages` do Prompt como referência.
 */

type Greeter = (name: string) => string;

const GREETING_TEMPLATES: Record<string, Greeter> = {
  "pt-BR": (n) => "Olá! Sou " + n + ". Como posso ajudá-lo?",
  "pt-PT": (n) => "Olá! Sou " + n + ". Como posso ajudar?",
  "en-US": (n) => "Hello! I'm " + n + ". How can I help you?",
  "en-GB": (n) => "Hello! I'm " + n + ". How can I help you?",
  "es-ES": (n) => "¡Hola! Soy " + n + ". ¿En qué puedo ayudarte?",
  "es-MX": (n) => "¡Hola! Soy " + n + ". ¿En qué puedo ayudarte?",
  "fr-FR": (n) => "Bonjour ! Je suis " + n + ". Comment puis-je vous aider ?",
  "de-DE": (n) => "Hallo! Ich bin " + n + ". Wie kann ich Ihnen helfen?",
  "it-IT": (n) => "Ciao! Sono " + n + ". Come posso aiutarti?",
  "ar":    (n) => "مرحبًا! أنا " + n + ". كيف يمكنني مساعدتك؟",
  "tr-TR": (n) => "Merhaba! Ben " + n + ". Size nasıl yardımcı olabilirim?",
};

function pickTemplate(language?: string | null): Greeter {
  const lang = (language || "").trim();
  if (lang && GREETING_TEMPLATES[lang]) return GREETING_TEMPLATES[lang];
  if (lang) {
    const prefix = lang.split("-")[0].toLowerCase();
    const match = Object.keys(GREETING_TEMPLATES).find(k => k.toLowerCase().startsWith(prefix));
    if (match) return GREETING_TEMPLATES[match];
  }
  return GREETING_TEMPLATES["pt-BR"];
}

/**
 * Retorna a saudação localizada para o idioma informado (ex.: "pt-BR", "en-US").
 */
export function buildAiAgentGreeting(agentName: string, language?: string | null): string {
  const safeName = (agentName || "").trim() || "Assistente";
  return pickTemplate(language)(safeName);
}

/**
 * Resolve o idioma a partir do campo `languages` (TEXT JSON) do Prompt e devolve a saudação.
 * Aceita JSON array (ex.: '["en-US","pt-BR"]') ou string simples ("en-US").
 * Se a primeira posição for "auto", usa o segundo idioma; se nada for válido, faz fallback para pt-BR.
 */
export function buildAiAgentGreetingFromPromptLanguages(
  agentName: string,
  languagesField?: string | null
): string {
  let lang: string | undefined;
  if (languagesField) {
    try {
      const parsed = JSON.parse(languagesField);
      if (Array.isArray(parsed) && parsed.length > 0) {
        lang = parsed.find((l: string) => l && l !== "auto") || parsed[0];
      } else if (typeof parsed === "string") {
        lang = parsed;
      }
    } catch {
      lang = languagesField;
    }
  }
  return buildAiAgentGreeting(agentName, lang);
}
