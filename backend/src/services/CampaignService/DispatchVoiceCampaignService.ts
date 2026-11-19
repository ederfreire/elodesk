import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import {
  dialChatCall,
  hangupChatCall,
  playCampaignAudio
} from "../WacallsServices/WacallsChatCallService";
import {
  marcarChamadaDeCampanha,
  esquecerChamadaDeCampanha
} from "./ChamadasDeCampanha";

/**
 * Campanha de voz: liga para o contato e toca um áudio gravado.
 *
 * A sequência é sempre a mesma:
 *
 *   1. disca pelo WhatsApp Plus
 *   2. pede ao microserviço para tocar o áudio, informando quanto tempo
 *      esperar o atendimento
 *   3. se atendeu, espera o áudio terminar e desliga
 *   4. se não atendeu, devolve o motivo para quem chamou reagendar
 *
 * A espera pelo atendimento acontece DENTRO do microserviço (parâmetro
 * waitAnswerMs). Fazer isso aqui exigiria consultar status em laço pela rede,
 * o que é mais frágil e mais lento.
 *
 * O áudio vai por URL da pasta pública, e não por caminho de arquivo: os dois
 * processos podem estar em máquinas ou containers diferentes, e caminho
 * absoluto só funcionaria por coincidência.
 */

export type ResultadoVoz = {
  atendida: boolean;
  motivo?: string;
  duracaoMs?: number;
};

const urlDoAudio = (campaign: Campaign): string => {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
  const proxyPort = process.env.PROXY_PORT;
  const baseUrl = proxyPort ? `${backendUrl}:${proxyPort}` : backendUrl;
  return `${baseUrl}/public/company${campaign.companyId}/${campaign.voiceAudioPath}`;
};

/**
 * Só o número, sem sufixo de JID.
 *
 * O shipping guarda o número em formatos diferentes conforme a origem da
 * lista (com @s.whatsapp.net, com máscara, com espaços). O endpoint de
 * discagem espera o telefone puro.
 */
const somenteNumero = (valor: string): string =>
  String(valor || "").split("@")[0].replace(/\D/g, "");

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const DispatchVoiceCampaign = async (
  campaign: Campaign,
  campaignShipping: CampaignShipping
): Promise<ResultadoVoz> => {
  const whatsapp = campaign.whatsapp as Whatsapp;
  const sessionId = (whatsapp as any)?.wacallsChatSessionId;

  if (!sessionId) {
    throw new Error("Conexão WhatsApp Plus sem sessão pareada");
  }
  if (!campaign.voiceAudioPath) {
    throw new Error("Campanha de voz sem áudio configurado");
  }

  const numero = somenteNumero(campaignShipping.number);
  if (!numero) {
    throw new Error(`Número inválido: ${campaignShipping.number}`);
  }

  const segundosDeChamada = Number(campaign.voiceRingSeconds) || 30;

  const resposta = await dialChatCall(sessionId, numero, false);
  const callId = resposta?.call?.callId;
  if (!callId) {
    throw new Error("O microserviço não devolveu o id da chamada");
  }

  // Marca antes de qualquer evento voltar: a tela de ligação não deve abrir
  // no navegador dos atendentes para um disparo automático.
  marcarChamadaDeCampanha(callId);

  logger.info(
    `[CAMPANHA-VOZ] Ligando para ${numero} (campanha ${campaign.id}, chamada ${callId})`
  );

  try {
    const play = await playCampaignAudio(
      sessionId,
      callId,
      urlDoAudio(campaign),
      segundosDeChamada * 1000
    );

    if (!play?.answered) {
      const motivo = play?.reason || "não atendeu";
      logger.info(`[CAMPANHA-VOZ] ${numero} não atendeu (${motivo})`);
      return { atendida: false, motivo };
    }

    const duracaoMs = Number(play.durationMs) || 0;

    // Margem de um segundo: o áudio é injetado em blocos de 500ms e desligar
    // no milissegundo exato cortaria a última palavra.
    await esperar(duracaoMs + 1000);

    logger.info(
      `[CAMPANHA-VOZ] ${numero} ouviu o áudio (${Math.round(duracaoMs / 1000)}s)`
    );
    return { atendida: true, duracaoMs };
  } finally {
    // Desligar sempre, inclusive quando algo falhou no meio: uma chamada
    // esquecida em aberto ocupa a linha e trava os disparos seguintes.
    try {
      await hangupChatCall(sessionId, callId);
    } catch (err: any) {
      logger.warn(
        `[CAMPANHA-VOZ] Falha ao desligar a chamada ${callId}: ${err?.message}`
      );
    }
    // Mantém a marca por um instante para o evento de encerramento, que chega
    // logo depois, ainda ser reconhecido como disparo de campanha. A entrada
    // expira sozinha em seguida.
    setTimeout(() => esquecerChamadaDeCampanha(callId), 60000);
  }
};

export default DispatchVoiceCampaign;
