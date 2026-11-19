import axios from "axios";

import Whatsapp from "../../models/Whatsapp";
import OfficialCall from "../../models/OfficialCall";
import logger from "../../utils/logger";

/**
 * Chamadas de voz pela API Oficial (WhatsApp Business Calling API).
 *
 * Fala DIRETO com a Graph API usando o que a conexão já guarda —
 * `phone_number_id` e `send_token`, os mesmos usados para enviar mensagem.
 * Chamada e mensagem compartilham credencial e número na Meta, então não há
 * nada novo para cadastrar.
 *
 * Todas as ações usam o mesmo endpoint, mudando só o campo `action`:
 *
 *   connect     nós ligamos (manda oferta SDP, recebe o call_id)
 *   pre_accept  prepara a mídia antes de atender
 *   accept      atende (manda resposta SDP)
 *   reject      recusa
 *   terminate   desliga
 *
 * Sobre o pre_accept: a Meta recomenda estabelecer a conexão de mídia antes
 * do accept. Sem ele o áudio só começa a fluir depois do aceite e o cliente
 * perde as primeiras palavras. Com ele o canal já está pronto.
 */

// A Calling API (POST /{phone_number_id}/calls) não existe nas versões
// antigas da Graph. Em v20.0 o endpoint pode simplesmente não estar lá, e a
// resposta da Meta nesses casos não deixa isso óbvio. Ajustável por env caso
// o app esteja preso a outra versão.
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type CallAction =
  | "connect"
  | "pre_accept"
  | "accept"
  | "reject"
  | "terminate";

interface AcaoParams {
  whatsapp: Whatsapp;
  action: CallAction;
  callId?: string;
  to?: string;
  sdp?: string;
  sdpType?: "offer" | "answer";
}

interface Resultado {
  success: boolean;
  callId?: string;
  error?: string;
  status?: number;
}

const credenciais = (whatsapp: Whatsapp) => ({
  phoneNumberId: (whatsapp as any).phone_number_id as string,
  token: (whatsapp as any).send_token as string
});

/**
 * Testa o token contra um endpoint que só lê dados do próprio número.
 *
 * Serve para separar duas causas que produzem o mesmo 401 na chamada:
 * token inválido/desatualizado versus token bom sem permissão de chamadas.
 * Não altera nada na Meta.
 */
const verificarToken = async (
  phoneNumberId: string,
  token: string
): Promise<{ tokenValido: boolean; resumo: string }> => {
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${phoneNumberId}`, {
      params: { fields: "id,display_phone_number,verified_name" },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000
    });

    return {
      tokenValido: true,
      resumo: `token OK — número ${data?.display_phone_number ?? "?"} (${
        data?.verified_name ?? "?"
      }). O 401 é específico da ação de chamada.`
    };
  } catch (erro: any) {
    const corpo = erro?.response?.data?.error;
    return {
      tokenValido: false,
      resumo: `token recusado também fora de chamadas (HTTP ${
        erro?.response?.status ?? "-"
      }, código ${corpo?.code ?? "-"}): ${corpo?.message ?? erro?.message}`
    };
  }
};

/** Executa uma ação de chamada na Graph API. */
export const executarAcao = async ({
  whatsapp,
  action,
  callId,
  to,
  sdp,
  sdpType
}: AcaoParams): Promise<Resultado> => {
  const { phoneNumberId, token } = credenciais(whatsapp);

  if (!phoneNumberId || !token) {
    return {
      success: false,
      error:
        "Conexão oficial sem phone_number_id ou token. Reconecte a conexão em Conexões."
    };
  }

  const body: Record<string, any> = {
    messaging_product: "whatsapp",
    action
  };
  if (callId) body.call_id = callId;
  if (to) body.to = to;
  if (sdp && sdpType) body.session = { sdp_type: sdpType, sdp };

  try {
    const { data } = await axios.post(
      `${GRAPH_URL}/${phoneNumberId}/calls`,
      body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        // A janela para atender é de 30 a 60s. Timeout curto de propósito:
        // esperar mais que isso é esperar por uma chamada que já caiu.
        timeout: 10000
      }
    );

    const novoCallId =
      data?.calls?.[0]?.id || data?.call_id || callId || undefined;

    logger.info(
      `[OFFICIAL-CALL] ${action} ok whatsappId=${whatsapp.id} callId=${novoCallId ?? "-"}`
    );
    return { success: true, callId: novoCallId };
  } catch (err: any) {
    const status = err?.response?.status;
    const metaErro =
      err?.response?.data?.error?.message ||
      err?.response?.data?.error?.error_user_msg ||
      err?.message;

    const erroMeta = err?.response?.data?.error;
    const codigoMeta = erroMeta?.code;
    const subcodigoMeta = erroMeta?.error_subcode;

    logger.warn(
      `[OFFICIAL-CALL] ${action} falhou whatsappId=${whatsapp.id} (HTTP ${
        status ?? "-"
      }) codigo=${codigoMeta ?? "-"} subcodigo=${subcodigoMeta ?? "-"}: ${metaErro}`
    );

    // "Authentication Error" é o texto genérico da Meta e não diz a causa.
    // Sem a resposta inteira sobra adivinhação — e adivinhar já custou tempo
    // demais aqui.
    if (err?.response?.data) {
      logger.warn(
        `[OFFICIAL-CALL] resposta completa da Meta: ${JSON.stringify(
          err.response.data
        )}`
      );
    }

    let mensagem = metaErro;

    if (status === 401 || codigoMeta === 190) {
      // Discriminador automático: o MESMO token consulta um endpoint inofensivo.
      // Se a consulta passa, o token é válido e o problema é específico de
      // chamadas (permissão do app, chamadas não habilitadas no número, versão
      // da Graph). Se a consulta também falha, o token guardado aqui é que não
      // presta — o que pode acontecer mesmo com o envio de mensagens
      // funcionando, já que quem envia é a API Oficial, com a cópia dela.
      const diag = await verificarToken(phoneNumberId, token);

      logger.warn(`[OFFICIAL-CALL] diagnóstico do token: ${diag.resumo}`);

      mensagem = diag.tokenValido
        ? `A Meta recusou esta ligação (código ${
            codigoMeta ?? "-"
          }). O token está válido e responde por este número, então não é problema de credencial. Ligação iniciada pela empresa exige que o contato tenha autorizado receber chamadas — a resposta completa da Meta está no log.`
        : `A Meta recusou o token guardado nesta conexão (código ${
            codigoMeta ?? "-"
          }). Reabra Conexões → editar → Token de envio e salve o token novo.`;
    }

    // A Meta diz "SDP Validation error" sem apontar a linha. Sem ver o que foi
    // enviado, sobra adivinhação. O SDP é descartável (credenciais ICE valem
    // só para esta chamada), então registrá-lo na falha não expõe nada.
    if (/sdp/i.test(String(metaErro)) && sdp) {
      logger.warn(`[OFFICIAL-CALL] SDP recusado na ação ${action}:\n${sdp}`);
    }
    return { success: false, error: mensagem, status };
  }
};

/**
 * Pede ao contato permissão para receber ligação da empresa.
 *
 * Regra da Meta: uma ligação FEITA pela empresa exige autorização explícita do
 * contato, e receber uma ligação dele NÃO conta como autorização. É por isso
 * que atender funciona e discar é recusado. O contato recebe uma mensagem com
 * os botões de permitir/recusar; autorizando, abre uma janela curta em que a
 * ligação passa.
 *
 * O formato é o de mensagem interativa da Cloud API. Se a Meta recusar o
 * corpo, a resposta inteira vai para o log — é ela que diz o que ajustar.
 */
export const pedirPermissaoDeChamada = async (
  whatsapp: Whatsapp,
  to: string,
  texto?: string
): Promise<Resultado> => {
  const { phoneNumberId, token } = credenciais(whatsapp);

  if (!phoneNumberId || !token) {
    return {
      success: false,
      error: "Conexão oficial sem phone_number_id ou token."
    };
  }

  const numero = String(to || "").replace(/\D/g, "");
  if (!numero) return { success: false, error: "Número inválido." };

  const corpo = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: numero,
    type: "interactive",
    interactive: {
      type: "call_permission_request",
      body: {
        text:
          texto ||
          "Podemos te ligar pelo WhatsApp? A chamada é gratuita, feita pela internet."
      },
      action: { name: "call_permission_request" }
    }
  };

  try {
    const { data } = await axios.post(
      `${GRAPH_URL}/${phoneNumberId}/messages`,
      corpo,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    logger.info(
      `[OFFICIAL-CALL] permissão de chamada solicitada whatsappId=${
        whatsapp.id
      } para ${numero} (id ${data?.messages?.[0]?.id ?? "-"})`
    );
    return { success: true };
  } catch (err: any) {
    const corpoErro = err?.response?.data;
    logger.warn(
      `[OFFICIAL-CALL] falha ao pedir permissão whatsappId=${whatsapp.id}: ${
        corpoErro ? JSON.stringify(corpoErro) : err?.message
      }`
    );
    return {
      success: false,
      error:
        corpoErro?.error?.error_user_msg ||
        corpoErro?.error?.message ||
        err?.message,
      status: err?.response?.status
    };
  }
};

export const conectar = (whatsapp: Whatsapp, to: string, sdpOffer: string) =>
  executarAcao({
    whatsapp,
    action: "connect",
    to,
    sdp: sdpOffer,
    sdpType: "offer"
  });

export const preAceitar = (
  whatsapp: Whatsapp,
  callId: string,
  sdpAnswer: string
) =>
  executarAcao({
    whatsapp,
    action: "pre_accept",
    callId,
    sdp: sdpAnswer,
    sdpType: "answer"
  });

export const aceitar = (
  whatsapp: Whatsapp,
  callId: string,
  sdpAnswer: string
) =>
  executarAcao({
    whatsapp,
    action: "accept",
    callId,
    sdp: sdpAnswer,
    sdpType: "answer"
  });

export const recusar = (whatsapp: Whatsapp, callId: string) =>
  executarAcao({ whatsapp, action: "reject", callId });

export const desligar = (whatsapp: Whatsapp, callId: string) =>
  executarAcao({ whatsapp, action: "terminate", callId });

/**
 * Liga ou desliga chamadas no número.
 *
 * É isso que faz o botão de ligar APARECER no WhatsApp do cliente. Enquanto
 * estiver desabilitado, o ícone não é exibido e nenhum webhook de chamada
 * chega — por mais correto que o resto esteja.
 */
export const configurarChamadas = async (
  whatsapp: Whatsapp,
  habilitado: boolean,
  permitirCallback = true
): Promise<Resultado> => {
  const { phoneNumberId, token } = credenciais(whatsapp);
  if (!phoneNumberId || !token) {
    return { success: false, error: "Conexão sem credenciais da Meta" };
  }

  try {
    await axios.post(
      `${GRAPH_URL}/${phoneNumberId}/settings`,
      {
        calling: {
          status: habilitado ? "ENABLED" : "DISABLED",
          call_icon_visibility: "DEFAULT",
          callback_permission_status: permitirCallback ? "ENABLED" : "DISABLED"
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );
    logger.info(
      `[OFFICIAL-CALL] chamadas ${habilitado ? "habilitadas" : "desabilitadas"} na conexão ${whatsapp.id}`
    );
    return { success: true };
  } catch (err: any) {
    const metaErro = err?.response?.data?.error?.message || err?.message;
    logger.warn(`[OFFICIAL-CALL] falha ao configurar: ${metaErro}`);
    return {
      success: false,
      error: metaErro,
      status: err?.response?.status
    };
  }
};

/** Lê a configuração atual de chamadas do número. */
export const lerConfiguracao = async (whatsapp: Whatsapp) => {
  const { phoneNumberId, token } = credenciais(whatsapp);
  if (!phoneNumberId || !token) {
    return { success: false, error: "Conexão sem credenciais da Meta" };
  }
  try {
    const { data } = await axios.get(`${GRAPH_URL}/${phoneNumberId}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
    return { success: true, calling: data?.calling };
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error?.message || err?.message
    };
  }
};

/** Registra ou atualiza a chamada no histórico. Nunca derruba o fluxo. */
export const registrarChamada = async (dados: {
  callId: string;
  companyId: number;
  whatsappId?: number;
  contactId?: number;
  ticketId?: number;
  userId?: number;
  direction?: string;
  status?: string;
  number?: string;
  durationSeconds?: number;
  startedAt?: Date;
  endedAt?: Date;
  endReason?: string;
}): Promise<OfficialCall | null> => {
  try {
    const existente = await OfficialCall.findOne({
      where: { callId: dados.callId, companyId: dados.companyId }
    });

    if (existente) {
      // Só sobrescreve o que veio preenchido — o webhook de terminate não
      // repete contato nem ticket, e não pode apagar o que já sabíamos.
      const patch: any = {};
      for (const [k, v] of Object.entries(dados)) {
        if (v !== undefined && v !== null && k !== "callId" && k !== "companyId") {
          patch[k] = v;
        }
      }
      if (Object.keys(patch).length) await existente.update(patch);
      return existente;
    }

    return await OfficialCall.create(dados as any);
  } catch (err: any) {
    logger.warn(
      `[OFFICIAL-CALL] falha ao registrar chamada ${dados.callId}: ${err?.message}`
    );
    return null;
  }
};

export default {
  executarAcao,
  conectar,
  preAceitar,
  aceitar,
  recusar,
  desligar,
  configurarChamadas,
  lerConfiguracao,
  registrarChamada
};
