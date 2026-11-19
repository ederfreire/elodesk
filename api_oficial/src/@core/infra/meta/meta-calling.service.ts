import { Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * Cliente da WhatsApp Business Calling API (Cloud API).
 *
 * Todas as ações de chamada usam o MESMO endpoint —
 * `POST /{PHONE_NUMBER_ID}/calls` — mudando só o campo `action`:
 *
 *   connect     → nós ligamos pro cliente (manda oferta SDP)
 *   pre_accept  → aceita a negociação de mídia ANTES de atender de fato
 *   accept      → atende (manda resposta SDP)
 *   reject      → recusa
 *   terminate   → desliga
 *
 * Por que o pre_accept importa: a Meta recomenda estabelecer a conexão de
 * mídia antes do accept. Sem ele, o áudio começa a fluir só depois do
 * aceite e o cliente perde as primeiras palavras ("audio clipping"). Com
 * ele, o canal já está pronto e o som sai limpo desde o primeiro instante.
 *
 * Janela de resposta: a Meta dá de 30 a 60 segundos após o webhook de
 * "connect" para aceitar. Passou disso, a chamada cai como "Não atendida"
 * no aparelho do cliente e chega um webhook de terminate.
 */

export type CallAction =
  | 'connect'
  | 'pre_accept'
  | 'accept'
  | 'reject'
  | 'terminate';

export interface CallSession {
  sdp_type: 'offer' | 'answer';
  sdp: string;
}

export interface CallActionParams {
  phoneNumberId: string;
  token: string;
  callId?: string;
  /** Telefone do destinatário — só em `connect`. */
  to?: string;
  action: CallAction;
  session?: CallSession;
  /** String livre devolvida no webhook de terminate. Útil pra rastrear. */
  bizOpaqueCallbackData?: string;
}

export interface CallActionResult {
  success: boolean;
  callId?: string;
  error?: string;
  /** Código HTTP real da Meta, pra quem chamou decidir o que fazer. */
  status?: number;
}

export class MetaCallingService {
  private readonly logger: Logger = new Logger(`${MetaCallingService.name}`);

  urlMeta = `https://graph.facebook.com/v20.0`;

  /**
   * Executa uma ação de chamada. É a única porta de saída pra Meta —
   * connect/pre_accept/accept/reject/terminate passam todos por aqui.
   */
  async callAction(params: CallActionParams): Promise<CallActionResult> {
    const {
      phoneNumberId,
      token,
      callId,
      to,
      action,
      session,
      bizOpaqueCallbackData,
    } = params;

    if (!phoneNumberId || !token) {
      return { success: false, error: 'phoneNumberId ou token ausente' };
    }
    if (action === 'connect' && !to) {
      return { success: false, error: 'connect exige o telefone de destino' };
    }
    if (action !== 'connect' && !callId) {
      return { success: false, error: `${action} exige callId` };
    }

    const body: Record<string, any> = {
      messaging_product: 'whatsapp',
      action,
    };
    if (callId) body.call_id = callId;
    if (to) body.to = to;
    if (session) body.session = session;
    if (bizOpaqueCallbackData) {
      body.biz_opaque_callback_data = bizOpaqueCallbackData;
    }

    try {
      const { data } = await axios.post(
        `${this.urlMeta}/${phoneNumberId}/calls`,
        body,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          // Sinalização de chamada é sensível a tempo: a janela pra atender
          // é de 30 a 60s. Um timeout longo aqui seguraria o aceite até
          // depois da chamada já ter caído.
          timeout: 10000,
        },
      );

      // Em `connect`, a Meta devolve o call_id gerado — é ele que
      // identifica a chamada em todas as ações seguintes.
      const novoCallId =
        data?.calls?.[0]?.id || data?.call_id || callId || undefined;

      this.logger.log(`[calling] ${action} ok call_id=${novoCallId ?? '-'}`);
      return { success: true, callId: novoCallId };
    } catch (err: any) {
      const status = err?.response?.status;
      const metaErro =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error?.error_user_msg ||
        err?.message;

      this.logger.error(
        `[calling] ${action} falhou (HTTP ${status ?? '-'}): ${metaErro}`,
      );
      return { success: false, error: metaErro, status };
    }
  }

  /** Nós ligamos para o cliente. Devolve o call_id criado pela Meta. */
  async connect(
    phoneNumberId: string,
    token: string,
    to: string,
    sdpOffer: string,
    bizOpaqueCallbackData?: string,
  ): Promise<CallActionResult> {
    return this.callAction({
      phoneNumberId,
      token,
      to,
      action: 'connect',
      session: { sdp_type: 'offer', sdp: sdpOffer },
      bizOpaqueCallbackData,
    });
  }

  /**
   * Prepara a mídia antes de atender. Chamar SEMPRE antes do accept —
   * é o que evita o cliente perder as primeiras palavras.
   */
  async preAccept(
    phoneNumberId: string,
    token: string,
    callId: string,
    sdpAnswer: string,
  ): Promise<CallActionResult> {
    return this.callAction({
      phoneNumberId,
      token,
      callId,
      action: 'pre_accept',
      session: { sdp_type: 'answer', sdp: sdpAnswer },
    });
  }

  /**
   * Atende de fato.
   *
   * A Meta avisa: como a conexão WebRTC já foi estabelecida no pre_accept,
   * só comece a mandar áudio DEPOIS de receber o 200 daqui. Cedo demais, o
   * cliente perde o começo; tarde demais, ele ouve silêncio.
   */
  async accept(
    phoneNumberId: string,
    token: string,
    callId: string,
    sdpAnswer: string,
    bizOpaqueCallbackData?: string,
  ): Promise<CallActionResult> {
    return this.callAction({
      phoneNumberId,
      token,
      callId,
      action: 'accept',
      session: { sdp_type: 'answer', sdp: sdpAnswer },
      bizOpaqueCallbackData,
    });
  }

  async reject(
    phoneNumberId: string,
    token: string,
    callId: string,
  ): Promise<CallActionResult> {
    return this.callAction({
      phoneNumberId,
      token,
      callId,
      action: 'reject',
    });
  }

  async terminate(
    phoneNumberId: string,
    token: string,
    callId: string,
  ): Promise<CallActionResult> {
    return this.callAction({
      phoneNumberId,
      token,
      callId,
      action: 'terminate',
    });
  }

  /**
   * Liga/desliga chamadas no número e define horário de atendimento.
   *
   * Enquanto `calling.status` estiver DISABLED, o botão de ligar nem aparece
   * pro cliente no WhatsApp — e nenhum webhook de chamada chega.
   */
  async configurarChamadas(
    phoneNumberId: string,
    token: string,
    config: {
      habilitado: boolean;
      /** Pergunta ao cliente se ele autoriza receber ligação de volta. */
      permitirCallback?: boolean;
      horarios?: {
        timezoneId: string;
        semana: { dia: string; abre: string; fecha: string }[];
      };
    },
  ): Promise<CallActionResult> {
    const calling: Record<string, any> = {
      status: config.habilitado ? 'ENABLED' : 'DISABLED',
      call_icon_visibility: 'DEFAULT',
    };

    if (config.permitirCallback !== undefined) {
      calling.callback_permission_status = config.permitirCallback
        ? 'ENABLED'
        : 'DISABLED';
    }

    if (config.horarios) {
      calling.call_hours = {
        status: 'ENABLED',
        timezone_id: config.horarios.timezoneId,
        weekly_operating_hours: config.horarios.semana.map((d) => ({
          day_of_week: d.dia,
          open_time: d.abre,
          close_time: d.fecha,
        })),
      };
    }

    try {
      await axios.post(
        `${this.urlMeta}/${phoneNumberId}/settings`,
        { calling },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );
      this.logger.log(
        `[calling] configuração salva: ${config.habilitado ? 'ENABLED' : 'DISABLED'}`,
      );
      return { success: true };
    } catch (err: any) {
      const metaErro =
        err?.response?.data?.error?.message || err?.message;
      this.logger.error(`[calling] falha ao configurar: ${metaErro}`);
      return {
        success: false,
        error: metaErro,
        status: err?.response?.status,
      };
    }
  }

  /** Lê a configuração atual de chamadas do número. */
  async lerConfiguracao(
    phoneNumberId: string,
    token: string,
  ): Promise<{ success: boolean; calling?: any; error?: string }> {
    try {
      const { data } = await axios.get(
        `${this.urlMeta}/${phoneNumberId}/settings`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 15000,
        },
      );
      return { success: true, calling: data?.calling };
    } catch (err: any) {
      return {
        success: false,
        error: err?.response?.data?.error?.message || err?.message,
      };
    }
  }
}
