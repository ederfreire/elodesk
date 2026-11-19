/**
 * Cadência de inatividade: qual mensagem sai, e depois de quanto tempo.
 *
 * Antes existia UMA mensagem e UM tempo, repetidos N vezes. Agora o agente
 * pode ter etapas diferentes — por exemplo: 15 min "ainda está aí?", 2 h
 * "vou encerrar por aqui". As etapas ficam no campo inactivitySteps:
 *
 *   [{ minutes: 15, message: "..." }, { minutes: 120, message: "..." }]
 *
 * `minutes` é o tempo contado A PARTIR do evento anterior (a última mensagem
 * do agente, ou o lembrete anterior) — não desde o início da conversa.
 *
 * Escrito sem sintaxe exclusiva de TypeScript de propósito: assim o mesmo
 * arquivo roda em teste direto no Node, sem depender de compilação.
 */

/**
 * Normaliza a configuração do prompt numa lista de etapas.
 * Se não houver etapas, cai na configuração antiga (tempo + mensagem +
 * quantidade de lembretes), então quem já usava não sente diferença.
 *
 * @param {any} prompt
 * @returns {Array<{minutes: number, message: string}>}
 */
export const resolverEtapasInatividade = prompt => {
  if (!prompt || !prompt.inactivityEnabled) return [];

  let brutas = prompt.inactivitySteps;
  if (typeof brutas === "string") {
    try {
      brutas = JSON.parse(brutas);
    } catch (e) {
      brutas = null;
    }
  }

  if (Array.isArray(brutas)) {
    const etapas = brutas
      .map(e => ({
        minutes: Number(e && e.minutes),
        message: String((e && e.message) || "").trim()
      }))
      // Etapa sem tempo ou sem texto não serve para nada e só causaria um
      // envio vazio ou imediato.
      .filter(e => e.minutes > 0 && e.message.length > 0);

    if (etapas.length > 0) return etapas;
  }

  // ── Formato antigo ──
  const minutos = Number(prompt.inactivityTimeout || 0);
  const mensagem = String(prompt.inactivityMessage || "").trim();
  if (minutos <= 0 || !mensagem) return [];

  const quantidade = Math.max(1, Number(prompt.inactivityMaxReminders || 1));
  const etapas = [];
  for (let i = 0; i < quantidade; i += 1) {
    etapas.push({ minutes: minutos, message: mensagem });
  }
  return etapas;
};

/**
 * Qual etapa enviar agora, dado quantos lembretes já foram enviados.
 * Devolve null quando a cadência terminou.
 *
 * @param {Array<{minutes: number, message: string}>} etapas
 * @param {number} jaEnviados
 * @returns {{minutes: number, message: string, indice: number, ultima: boolean}|null}
 */
export const proximaEtapa = (etapas, jaEnviados) => {
  if (!Array.isArray(etapas) || etapas.length === 0) return null;
  const indice = Number(jaEnviados) || 0;
  if (indice < 0 || indice >= etapas.length) return null;
  return {
    minutes: etapas[indice].minutes,
    message: etapas[indice].message,
    indice,
    ultima: indice === etapas.length - 1
  };
};

export default resolverEtapasInatividade;
