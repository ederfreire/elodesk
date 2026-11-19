import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";
import { getIO } from "../../libs/socket";
import { registrarChamada } from "./OfficialCallService";

/**
 * Recebe os eventos de chamada que o api_oficial repassa do webhook da Meta
 * e leva até a tela do atendente.
 *
 * Dois eventos importam:
 *
 *   connect    o cliente está ligando AGORA. Traz a oferta SDP dele. Temos
 *              de 30 a 60 segundos para responder, senão a Meta encerra
 *              sozinha com "Não atendida".
 *
 *   terminate  a chamada acabou (atendida, recusada, perdida ou falha).
 *              Traz duração e motivo.
 *
 * Este arquivo NÃO fala com a Meta — só traduz o evento e avisa a interface.
 * Quem responde à Meta é o handler do socket, depois que o atendente decide.
 */

interface EventoChamada {
  token?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  callId?: string;
  event?: string;
  direction?: string;
  from?: string;
  to?: string;
  timestamp?: string | number;
  status?: string;
  duration?: number;
  startTime?: string | number;
  endTime?: string | number;
  session?: { sdp_type?: string; sdp?: string };
  bizOpaqueCallbackData?: string;
  contactName?: string;
}

const soDigitos = (v: any): string => String(v || "").replace(/\D/g, "");

const paraData = (v: any): Date | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isNaN(n) && n > 0) {
    // A Meta manda em segundos; Date espera milissegundos.
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * Descobre a conexão pelo phone_number_id.
 *
 * Prefere esse campo ao token porque ele identifica o NÚMERO, e uma empresa
 * pode ter vários números oficiais na mesma conta.
 */
const acharConexao = async (
  companyId: number,
  ev: EventoChamada
): Promise<Whatsapp | null> => {
  try {
    if (ev.phoneNumberId) {
      const porId = await Whatsapp.findOne({
        where: { companyId, phone_number_id: String(ev.phoneNumberId) } as any
      });
      if (porId) return porId;
    }
    // Sem phone_number_id (webhook antigo), cai pra qualquer conexão oficial
    // conectada da empresa. Só funciona bem com um número, mas é melhor que
    // descartar a chamada.
    return await Whatsapp.findOne({
      where: { companyId, channel: "whatsapp_oficial" } as any
    });
  } catch (err: any) {
    logger.warn(`[OFFICIAL-CALL] falha ao achar conexão: ${err?.message}`);
    return null;
  }
};

const acharContato = async (
  companyId: number,
  numero: string
): Promise<Contact | null> => {
  if (!numero) return null;
  try {
    return await Contact.findOne({ where: { companyId, number: numero } });
  } catch {
    return null;
  }
};

export const HandleOfficialCall = async (
  companyId: number,
  ev: EventoChamada
): Promise<void> => {
  if (!ev?.callId) {
    logger.warn("[OFFICIAL-CALL] evento sem callId — ignorado");
    return;
  }

  const io = getIO();
  const evento = String(ev.event || "").toLowerCase();
  // Ligação feita PELA EMPRESA: a Meta manda "connect" quando o cliente
  // atende, com a RESPOSTA SDP (sdp_type "answer"). Antes isso era tratado
  // como chamada entrante e a resposta nunca chegava ao navegador de quem
  // discou: a chamada ficava "conectada" mas muda.
  const sdpTipo = String(ev.session?.sdp_type || "").toLowerCase();
  const daEmpresa =
    String(ev.direction || "").toLowerCase() === "business_initiated" || sdpTipo === "answer";
  const entrante = !daEmpresa;
  const numero = soDigitos(entrante ? ev.from : ev.to);

  const conexao = await acharConexao(companyId, ev);
  const contato = await acharContato(companyId, numero);

  logger.info(
    `[OFFICIAL-CALL] evento=${evento} callId=${ev.callId} numero=${numero} conexao=${conexao?.id ?? "-"}`
  );

  if (evento === "connect" && daEmpresa) {
    await registrarChamada({
      callId: ev.callId,
      companyId,
      whatsappId: conexao?.id,
      contactId: contato?.id,
      direction: "outbound",
      status: "connected",
      number: numero
    });

    if (!ev.session?.sdp) {
      logger.warn(`[OFFICIAL-CALL] connect da ligação ${ev.callId} veio sem session.sdp — sem ele não há áudio`);
    }

    // Só o navegador que discou (o que tem este callId) aplica a resposta.
    io.of(String(companyId)).emit(`company-${companyId}-official-call`, {
      action: "answer",
      callId: ev.callId,
      number: numero,
      sdp: ev.session?.sdp || null,
      sdpType: ev.session?.sdp_type || "answer"
    });
    return;
  }

  if (evento === "connect") {
    await registrarChamada({
      callId: ev.callId,
      companyId,
      whatsappId: conexao?.id,
      contactId: contato?.id,
      direction: entrante ? "inbound" : "outbound",
      status: "ringing",
      number: numero,
      startedAt: paraData(ev.timestamp) || new Date()
    });

    // Toca para a empresa inteira. Quem atender primeiro fica com a
    // chamada — a Meta recusa um segundo accept no mesmo callId, então
    // não há risco de dois atendentes assumirem a mesma ligação.
    io.of(String(companyId)).emit(`company-${companyId}-official-call`, {
      action: "incoming",
      callId: ev.callId,
      whatsappId: conexao?.id,
      contactId: contato?.id,
      name: contato?.name || ev.contactName || numero,
      number: numero,
      profilePicUrl: contato?.profilePicUrl || null,
      // A oferta SDP do cliente. O navegador precisa dela para montar a
      // resposta.
      sdp: ev.session?.sdp || null,
      sdpType: ev.session?.sdp_type || "offer"
    });
    return;
  }

  if (evento === "terminate") {
    const fim = paraData(ev.endTime) || new Date();
    const status =
      ev.status === "COMPLETED" || Number(ev.duration) > 0
        ? "ended"
        : ev.status === "REJECTED"
          ? "rejected"
          : ev.status === "FAILED"
            ? "failed"
            : "missed";

    await registrarChamada({
      callId: ev.callId,
      companyId,
      whatsappId: conexao?.id,
      contactId: contato?.id,
      status,
      durationSeconds: Number(ev.duration) || 0,
      endedAt: fim,
      endReason: ev.status || undefined
    });

    io.of(String(companyId)).emit(`company-${companyId}-official-call`, {
      action: "ended",
      callId: ev.callId,
      status,
      durationSeconds: Number(ev.duration) || 0,
      reason: ev.status || null
    });
    return;
  }

  logger.debug(`[OFFICIAL-CALL] evento não tratado: ${evento}`);
};

export default HandleOfficialCall;
