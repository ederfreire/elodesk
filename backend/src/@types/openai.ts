export interface IOpenAi {
  name: string;
  prompt: string;
  voice: string;
  voiceKey: string;
  voiceRegion: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  queueId: number;
  maxMessages: number;
  model: string;
  provider?: "openai" | "gemini";
  responseMode?: "text" | "audio" | "both";
  
  // Campos para controle de fluxo
  flowMode?: "permanent" | "temporary";
  maxInteractions?: number;
  continueKeywords?: string[];
  completionTimeout?: number;
  objective?: string;
  autoCompleteOnObjective?: boolean;

  // Campos do agente de IA
  responseDelay?: number;
  charLimit?: number;
  humanizeConversation?: boolean;
  allowTransfer?: boolean;
  transferKeywords?: string;
  transferMessage?: string;
  transcribeAudio?: boolean;
  audioEnabled?: boolean;
  agentVoice?: string;
  sendAsPTT?: boolean;
  languages?: string | string[];
}