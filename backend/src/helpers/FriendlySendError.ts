/**
 * Traduz erros técnicos de envio (Baileys, bridge wacalls, ffmpeg, rede) em
 * mensagens curtas e acionáveis pro atendente.
 *
 * Antes, o toast do frontend mostrava coisas como
 * "ERR_SENDING_WAPP_MSG: Sessão WhatsApp Plus - Voz + Msg não pareada" — o
 * código cru vazava pra tela e não dizia o que fazer. Agora devolvemos uma
 * frase pronta, em português, dizendo a causa provável e o próximo passo.
 */

type Rule = { test: RegExp; message: string };

const RULES: Rule[] = [
  {
    test: /n[ãa]o pareada|not paired|no such session|session not found|sess[ãa]o (n[ãa]o encontrada|inexistente)/i,
    message:
      "A conexão do WhatsApp não está pareada. Abra Conexões, leia o QR Code novamente e tente enviar de novo."
  },
  {
    test: /not connected|disconnected|connection closed|websocket|socket closed|conex[ãa]o (fechada|perdida)/i,
    message:
      "A conexão com o WhatsApp caiu. Aguarde a reconexão ou reinicie a conexão em Conexões e tente novamente."
  },
  {
    test: /logged out|401|unauthorized|deslogad/i,
    message:
      "O WhatsApp desconectou esta sessão (logout no celular). Reconecte lendo o QR Code em Conexões."
  },
  {
    test: /timed? ?out|timeout|etimedout|deadline exceeded/i,
    message:
      "O WhatsApp demorou demais para responder. A mensagem pode não ter sido entregue — verifique o chat antes de reenviar."
  },
  {
    test: /econnrefused|enotfound|ehostunreach|econnreset|network|fetch failed|socket hang up/i,
    message:
      "Não foi possível falar com o servidor de mensagens. Verifique a internet do servidor e tente novamente."
  },
  {
    test: /not.*on whatsapp|n[ãa]o (existe|possui) whatsapp|invalid jid|jid inv[áa]lido|item-not-found/i,
    message:
      "Este número não tem WhatsApp ativo ou o contato está com o número incorreto. Confira o número do contato."
  },
  {
    test: /forbidden|403|blocked|bloquead|not-authorized|n[ãa]o [ée] membro|not a participant/i,
    message:
      "O WhatsApp recusou o envio: você pode ter sido bloqueado pelo contato ou não faz mais parte do grupo."
  },
  {
    test: /arquivo de m[íi]dia n[ãa]o encontrado|enoent|no such file/i,
    message:
      "O arquivo enviado não foi encontrado no servidor. Anexe o arquivo novamente e reenvie."
  },
  {
    test: /file too large|too large|payload too large|413|excede|size limit/i,
    message:
      "O arquivo é grande demais para o WhatsApp. Reduza o tamanho (limite recomendado: 16 MB) e tente de novo."
  },
  {
    test: /ffmpeg|ffprobe|convert|codec|unsupported (media|format)|formato n[ãa]o suportado/i,
    message:
      "Não foi possível converter este arquivo para um formato aceito pelo WhatsApp. Tente enviar em outro formato (MP4, JPG, PDF ou MP3)."
  },
  {
    test: /rate ?limit|429|too many requests|overlimit/i,
    message:
      "Muitos envios em pouco tempo. Aguarde alguns instantes antes de enviar novamente."
  },
  {
    test: /encrypt|decrypt|cripto|no sessions|session error|bad mac/i,
    message:
      "Falha de criptografia com este contato. Peça para ele enviar uma mensagem e tente responder em seguida."
  },
  {
    test: /contato do ticket n[ãa]o encontrado/i,
    message:
      "O contato deste atendimento não foi encontrado. Recarregue a página e abra o ticket novamente."
  },
  {
    test: /plano|plan feature|upgrade/i,
    message:
      "Seu plano não permite este envio. Fale com o administrador para liberar o recurso."
  }
];

export const friendlySendError = (
  err: any,
  fallback = "Não foi possível enviar a mensagem. Verifique a conexão do WhatsApp em Conexões e tente novamente."
): string => {
  const raw = [err?.message, err?.response?.data?.error, err?.output?.payload?.message]
    .filter(Boolean)
    .join(" | ");

  if (!raw) return fallback;

  const rule = RULES.find(r => r.test.test(raw));
  if (rule) return rule.message;

  // Sem regra específica: entrega o texto do erro sem o código interno,
  // ainda assim mais legível que "ERR_SENDING_WAPP_MSG: <stack>".
  const clean = String(raw)
    .replace(/^ERR_[A-Z_]+:?\s*/i, "")
    .split("\n")[0]
    .trim();

  if (!clean || clean.length > 180) return fallback;
  return `${fallback} (detalhe: ${clean})`;
};

export default friendlySendError;
