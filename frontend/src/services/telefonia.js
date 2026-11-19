/**
 * Telefonia unificada.
 *
 * O sistema tem quatro formas de ligar, cada uma com sua própria tecnologia:
 * ramal interno, WhatsApp Plus, API Oficial e troncal SIP. Antes cada uma
 * tinha seu próprio botão e sua própria janela, o que obrigava o atendente a
 * saber de antemão por onde a ligação sai.
 *
 * Este módulo resolve duas coisas:
 *
 *   1. QUAIS canais mostrar. Um canal só aparece quando está habilitado E
 *      configurado — sem conexão conectada, sem ramal cadastrado ou sem
 *      troncal ativa, ele simplesmente não existe pro usuário. Mostrar uma
 *      opção que só leva a mensagem de erro é pior do que não mostrar.
 *
 *   2. COMO acionar cada canal. A lógica de WebRTC de ramal e de API Oficial
 *      já vive nos painéis, que ficam montados o tempo todo pra poder receber
 *      chamadas. Em vez de mover esse código (e arriscar quebrar a chamada
 *      recebida), o discador publica um evento e o painel responsável atende.
 *      O painel se mostra sozinho quando entra em ligação.
 */

/** Identificadores dos canais. Usados como valor do seletor e nas traduções. */
export const CANAL = {
  RAMAL: "ramal",
  WHATSAPP: "whatsapp",
  OFICIAL: "oficial",
  SIP: "sip"
};

/**
 * Decide quais canais o discador deve oferecer.
 *
 * Função pura de propósito: dá pra testar as combinações sem montar a tela.
 *
 * @param {object} p
 * @param {Array}  p.ramais            ramais da empresa (do evento ramais:list)
 * @param {Array}  p.sessoesPlus       sessões WhatsApp Plus conectadas
 * @param {Array}  p.conexoes          todas as conexões da empresa
 * @param {boolean} p.sipHabilitado    troncal SIP ligada nas configurações
 * @returns {Array<{id: string, chave: string}>} canais na ordem de exibição
 */
export const canaisDisponiveis = ({
  ramais = [],
  sessoesPlus = [],
  conexoes = [],
  sipHabilitado = false
} = {}) => {
  const lista = [];

  // Ramal: só faz sentido se existir alguém pra chamar. A lista que chega já
  // exclui o próprio usuário, então lista vazia significa "ninguém mais tem
  // ramal cadastrado" — e ligar seria impossível.
  if (Array.isArray(ramais) && ramais.length > 0) {
    lista.push({ id: CANAL.RAMAL, chave: "dialer.canais.ramal" });
  }

  // WhatsApp Plus: precisa de sessão de chamada ativa, não basta a conexão
  // existir. Sessão é o que sustenta o áudio.
  if (Array.isArray(sessoesPlus) && sessoesPlus.length > 0) {
    lista.push({ id: CANAL.WHATSAPP, chave: "dialer.canais.whatsapp" });
  }

  // API Oficial: conexão do canal oficial E conectada. A Meta recusa chamada
  // de conexão fora do ar, então oferecer aqui só geraria erro no meio da
  // discagem.
  const temOficial = (conexoes || []).some(
    c => c && c.channel === "whatsapp_oficial" && c.status === "CONNECTED"
  );
  if (temOficial) {
    lista.push({ id: CANAL.OFICIAL, chave: "dialer.canais.oficial" });
  }

  if (sipHabilitado) {
    lista.push({ id: CANAL.SIP, chave: "dialer.canais.sip" });
  }

  return lista;
};

/**
 * Escolhe qual canal deixar selecionado.
 *
 * Mantém o canal atual se ele continuar disponível — senão o usuário perderia
 * a escolha toda vez que uma conexão oscilasse. Se sumiu, cai no primeiro.
 */
export const canalInicial = (canais, atual) => {
  if (!canais.length) return null;
  if (atual && canais.some(c => c.id === atual)) return atual;
  return canais[0].id;
};

/**
 * O ramal suporta vídeo?
 *
 * Diferente do WhatsApp Plus, o ramal é WebRTC puro: `getUserMedia` mais
 * `addTrack` (ver services/ramalCall.js). Não passa por WebCodecs, então não
 * faz sentido exigir VideoEncoder/MediaStreamTrackProcessor aqui — essa
 * exigência existe só para o caminho de vídeo do WhatsApp Plus, que encoda
 * H.264 na mão e manda por DataChannel.
 *
 * Basta o navegador ter WebRTC e acesso a dispositivos de mídia.
 */
export const videoSuportadoNoRamal = () =>
  typeof window !== "undefined" &&
  typeof window.RTCPeerConnection === "function" &&
  !!(navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

/** Decide se o botão de câmera aparece para o canal selecionado. */
export const canalTemVideo = (canal, videoWebCodecsOk) => {
  if (canal === CANAL.RAMAL) return videoSuportadoNoRamal();
  if (canal === CANAL.WHATSAPP) return !!videoWebCodecsOk;
  // SIP não carrega vídeo; a API Oficial só faz chamada de voz.
  return false;
};

// ---------------------------------------------------------------------------
// Barramento
// ---------------------------------------------------------------------------

const EVENTO_RAMAL = "telefonia:discar-ramal";
const EVENTO_OFICIAL = "telefonia:discar-oficial";

/** Pede ao RamaisPanel que ligue para um ramal. */
export const discarRamal = (ramal, comVideo = false) => {
  window.dispatchEvent(
    new CustomEvent(EVENTO_RAMAL, { detail: { ramal: String(ramal || ""), comVideo } })
  );
};

/** Pede ao OfficialCallPanel que ligue por uma conexão oficial. */
export const discarOficial = (numero, conexaoId) => {
  window.dispatchEvent(
    new CustomEvent(EVENTO_OFICIAL, {
      detail: { numero: String(numero || ""), conexaoId }
    })
  );
};

/**
 * Assina um dos eventos e devolve a função de cancelamento.
 * O retorno serve direto como limpeza de useEffect.
 */
export const ouvirDiscagemRamal = manipulador => {
  const fn = e => manipulador(e.detail || {});
  window.addEventListener(EVENTO_RAMAL, fn);
  return () => window.removeEventListener(EVENTO_RAMAL, fn);
};

export const ouvirDiscagemOficial = manipulador => {
  const fn = e => manipulador(e.detail || {});
  window.addEventListener(EVENTO_OFICIAL, fn);
  return () => window.removeEventListener(EVENTO_OFICIAL, fn);
};

export default {
  CANAL,
  videoSuportadoNoRamal,
  canalTemVideo,
  canaisDisponiveis,
  canalInicial,
  discarRamal,
  discarOficial,
  ouvirDiscagemRamal,
  ouvirDiscagemOficial
};
