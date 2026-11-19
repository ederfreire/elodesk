import Whatsapp from "../../models/Whatsapp";
import CallHistory from "../../models/CallHistory";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindCompanySettingsService from "../CompaniesSettings/FindCompanySettingsService";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import { resolvePN as resolveCachedLidPn, addLidPnMapping } from "../../utils/LidPnCache";
import { nomeDeContatoOuNumero } from "../../helpers/NomeDeContato";

export type WacallsCallAction =
  | "call.incoming"
  | "call.outgoing"
  | "call.answered"
  | "call.ended";

export interface WacallsCallEvent {
  action: WacallsCallAction;
  sessionId: string;
  callId: string;
  from?: string;        // JID do peer
  chatJid?: string;     // chat/group JID quando aplicável
  reason?: string;      // motivo do encerramento
  pushName?: string;
  timestamp?: number;
  /**
   * Id do usuário do EquipeChat dono da chamada — quem discou, no caso de
   * saída, ou quem atendeu, no caso de entrada. O microserviço chama isso de
   * "owner" e envia em todo evento de status.
   */
  owner?: string;
}

const parsePhone = (jid?: string): string =>
  String(jid || "").split("@")[0].split(":")[0];

const isLidJid = (jid?: string): boolean => String(jid || "").endsWith("@lid");

/**
 * Pra contatos @lid (identificador interno do WhatsApp, não o número de
 * telefone de verdade — comum quando o cliente nunca compartilhou o número
 * real com o WhatsApp), o card de chamada mostrava os dígitos crus do LID
 * em vez do número da pessoa, o que é ilegível/sem sentido pro atendente.
 * Resolve pro número real via cache local (rápido) e, se não tiver, via
 * client.Store.LIDs do próprio wacalls-chat (WacallsChatCallService.
 * resolveLidToPhone) — só faz a chamada de rede quando é de fato um @lid
 * (a maioria dos contatos já é PN direto, sem custo nenhum pra eles).
 * Se não conseguir resolver (WhatsApp nunca revelou o número real desse
 * contato pro cliente — acontece), cai de volta pros dígitos do LID, igual
 * o comportamento de antes.
 */
const resolveDisplayNumber = async (peerJid: string, sessionId: string): Promise<string> => {
  const raw = parsePhone(peerJid);
  if (!isLidJid(peerJid)) return raw;

  const cached = resolveCachedLidPn(peerJid);
  if (cached) return cached;

  if (!sessionId) return raw;
  try {
    const { resolveLidToPhone } = await import("./WacallsChatCallService");
    const resolved = await resolveLidToPhone(sessionId, peerJid);
    if (resolved) {
      addLidPnMapping(peerJid, resolved);
      return resolved;
    }
  } catch (err: any) {
    logger.debug(`[wacalls call] resolveDisplayNumber falhou pra ${peerJid}: ${err?.message}`);
  }
  return raw;
};

const statusFromAction = (
  action: WacallsCallAction,
  reason?: string,
  wasAnswered?: boolean
): string => {
  switch (action) {
    case "call.incoming":
    case "call.outgoing":
      return "PENDING";
    case "call.answered":
      return "ANSWERED";
    case "call.ended":
      // Uma chamada que já tinha sido atendida sempre termina como concluída,
      // independente do motivo do encerramento (quem desliga manda "reason").
      if (wasAnswered) return "COMPLETED";
      if (reason && /reject|declin|busy/i.test(reason)) return "REJECTED";
      if (reason && /timeout|no.?answer|miss|cancel/i.test(reason)) return "MISSED";
      return "MISSED";
    default:
      return "PENDING";
  }
};


/**
 * Trata os eventos de chamada emitidos pelo microserviço wacalls-voip
 * (CallOffer/CallTerminate + start/answer da API do softphone).
 *
 * 1) Cria/atualiza o registro em CallHistory (chave: token_wavoip = callId).
 * 2) No primeiro CallOffer recebido, cria/atualiza um Ticket e insere uma
 *    mensagem "📞 Chamada recebida" para o cliente aparecer no atendimento.
 * 3) Emite eventos de socket:
 *      - company-{id}-call-history (compat com histórico existente)
 *      - company-{id}-call        (status ao vivo p/ o softphone)
 */
export interface WacallsCallHandlerResult {
  contact: any;
  ticket: any;
}

const HandleWacallsCall = async (
  whatsapp: Whatsapp,
  ev: WacallsCallEvent
): Promise<WacallsCallHandlerResult | null> => {
  if (!ev.callId) {
    logger.warn(`[wacalls call] evento sem callId, ignorando (${ev.action})`);
    return null;
  }
  const companyId = whatsapp.companyId;
  const isIncoming = ev.action === "call.incoming";
  const status = statusFromAction(ev.action, ev.reason);

  const peerJid = ev.from || ev.chatJid || "";
  const rawNumber = parsePhone(peerJid);
  const number = await resolveDisplayNumber(peerJid, ev.sessionId);
  const isGroup = String(peerJid).endsWith("@g.us");
  const lidId = isLidJid(peerJid) ? rawNumber : "";

  // 1) contato
  let contact = null as any;
  if (number) {
    contact = await CreateOrUpdateContactService({
      name: nomeDeContatoOuNumero(ev.pushName, number),
      number,
      isGroup,
      companyId,
      channel: "wacalls",
      remoteJid: peerJid,
      // Ancora a busca do contato pelo LID (estável) em vez de só pelo
      // número exibido — sem isso, uma vez que a gente passa a resolver o
      // número real (em vez dos dígitos crus do LID), a busca por número
      // exato deixa de achar contatos antigos que ainda estão salvos com o
      // LID no campo number, e cada ligação seguinte criaria um contato
      // duplicado em vez de reaproveitar o histórico existente.
      lid: lidId,
      whatsappId: whatsapp.id
    });

    // Contato antigo, criado antes desse fix: number ainda guarda os dígitos
    // do LID (bem mais longo que um telefone real) mesmo já tendo resolvido
    // o número de verdade agora — corrige direto, sem depender da lógica
    // compartilhada de CreateOrUpdateContactService (que nunca atualiza
    // `number` de um contato já existente).
    if (contact && lidId && number !== rawNumber && contact.number !== number) {
      const looksLikeOldLidNumber = String(contact.number || "").replace(/\D/g, "").length >= 14;
      if (looksLikeOldLidNumber) {
        try {
          await contact.update({ number });
          getIO().of(String(companyId)).emit(`company-${companyId}-contact`, { action: "update", contact });
        } catch (err: any) {
          logger.debug(`[wacalls call] falha ao corrigir number do contato ${contact.id}: ${err?.message}`);
        }
      }
    }
  }

  // 2) CallHistory (find-or-create por token_wavoip=callId)
  let call = await CallHistory.findOne({
    where: { token_wavoip: ev.callId, company_id: companyId }
  });
  let created = false;

  // O atendente da ligação. Ficava fixo em 0 na criação e nunca era
  // preenchido depois — por isso TODA linha do relatório aparecia como
  // "Sistema", mesmo quando alguém discou ou atendeu.
  const idDoAtendente = Number(ev.owner);
  const atendente =
    Number.isInteger(idDoAtendente) && idDoAtendente > 0 ? idDoAtendente : 0;

  if (!call) {
    call = await CallHistory.create({
      user_id: atendente,
      token_wavoip: ev.callId,
      whatsapp_id: whatsapp.id,
      contact_id: contact?.id || 0,
      company_id: companyId,
      phone_to: number,
      name: contact?.name || number,
      url: "",
      status,
      direction: isIncoming ? "INCOMING" : "OUTGOING",
      duration: 0
    } as any);
    created = true;
  } else {
    const prevStatus = String((call as any).status || "").toUpperCase();
    const wasAnswered = ["ANSWERED", "IN_CALL", "COMPLETED"].includes(prevStatus);
    const nextStatus = statusFromAction(ev.action, ev.reason, wasAnswered);
    const patch: any = { status: nextStatus };
    if (contact && !call.contact_id) patch.contact_id = contact.id;

    // A chamada recebida só ganha dono no momento em que alguém atende, e o
    // evento de criação chega antes disso. Por isso o atendente é preenchido
    // aqui também, assim que aparece.
    if (atendente > 0 && Number(call.user_id) !== atendente) {
      patch.user_id = atendente;
    }

    if (ev.action === "call.ended") {
      // Duração conta do atendimento até o encerramento. `updatedAt` foi
      // gravado no evento call.answered, então serve como início da conversa;
      // se a chamada nunca foi atendida, duração fica 0 (não atendida).
      // O wacalls-chat manda o instante do encerramento em MILISSEGUNDOS
      // (UnixMilli, ver broker.go). Aqui ele era multiplicado por 1000 de
      // novo, como se fosse segundos: a conta virava um número astronômico e
      // a duração estourava a coluna inteira do banco —
      // "value 1784449918213 is out of range for type integer". O evento
      // call-ended morria nesse erro, a chamada nunca era marcada como
      // encerrada e a tela de ligação ficava aberta para sempre.
      //
      // A unidade é deduzida pela grandeza para funcionar com qualquer versão
      // do microserviço: acima de 10^12 é milissegundo, abaixo é segundo.
      const ended = (() => {
        const bruto = Number(ev.timestamp);
        if (!bruto || !Number.isFinite(bruto)) return Date.now();
        return bruto > 1e12 ? bruto : bruto * 1000;
      })();
      const answeredAtRaw = wasAnswered
        ? (call as any).updatedAt || (call as any).createdAt
        : null;
      if (answeredAtRaw) {
        const started = new Date(answeredAtRaw as any).getTime();
        const segundos = Math.round((ended - started) / 1000);
        // Trava de segurança: mesmo com a unidade certa, um relógio torto ou
        // um registro antigo poderiam gerar um número que a coluna não aceita.
        // 24h é teto de sobra para uma ligação e evita derrubar o evento.
        const LIMITE = 24 * 60 * 60;
        patch.duration =
          Number.isFinite(segundos) && segundos > 0
            ? Math.min(segundos, LIMITE)
            : 0;
      } else {
        patch.duration = 0;
      }
    }
    await call.update(patch);
  }


  // 3) Ticket (apenas no incoming — evita ruído em call.answered/ended)
  let ticket: any = null;
  if (isIncoming && contact) {
    const settings = await FindCompanySettingsService({ companyId });
    ticket = await FindOrCreateTicketService(
      contact,
      whatsapp,
      1,
      companyId,
      null,
      null,
      isGroup ? contact : undefined,
      "wacalls",
      false,
      false,
      settings
    );
    await FindOrCreateATicketTrakingService({
      ticketId: ticket.id,
      companyId,
      whatsappId: whatsapp.id,
      userId: null
    });

    const body = "📞 Chamada recebida";
    await CreateMessageService({
      messageData: {
        wid: `call:${ev.callId}`,
        ticketId: ticket.id,
        contactId: contact.id,
        body,
        fromMe: false,
        read: false,
        mediaType: "call",
        ack: 2,
        channel: "wacalls"
      },
      companyId
    });
    await ticket.update({ lastMessage: body });

    // Aviso "não aceita ligação no WhatsApp" (config "acceptCallWhatsapp") —
    // mesma config/texto do Baileys (wbotMonitor.ts), mas disparado aqui na
    // hora do CallOffer (WhatsApp Plus tem suporte nativo a chamada via
    // ponte SIP, então "informar que não aceita" é só um aviso automático
    // pro cliente, não bloqueia a chamada em si — mesma semântica do
    // Baileys, que também só avisa, nunca rejeita a ligação sozinho).
    if ((settings as any)?.acceptCallWhatsapp === "enabled") {
      try {
        const { SendWacallsText } = await import("./SendWacallsMessageService");
        await SendWacallsText({
          body: `‎ ${(settings as any)?.AcceptCallWhatsappMessage || ""}`,
          ticket
        });
      } catch (err: any) {
        logger.error(`[wacalls call] Falha ao enviar aviso de "não aceita ligação": ${err?.message}`);
      }
    }
  }

  // 4) sockets
  //
  // Chamada de campanha não abre tela: é disparo automático, ninguém precisa
  // atender nem desligar. O registro no banco acima já foi feito, então
  // histórico e relatório continuam completos — o que se evita aqui é a tela
  // de ligação piscando no navegador do atendente a cada contato da lista.
  const { ehChamadaDeCampanha } = await import(
    "../CampaignService/ChamadasDeCampanha"
  );
  if (ehChamadaDeCampanha(ev.callId)) {
    logger.info(
      `[wacalls call] ${ev.action} callId=${ev.callId} (campanha de voz — sem aviso na tela)`
    );
    return;
  }

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-call-history`, {
    action: created ? "create" : "update",
    call
  });
  io.of(String(companyId)).emit(`company-${companyId}-call`, {
    action: ev.action,
    callId: ev.callId,
    status: (call as any)?.status || status,

    reason: ev.reason,
    call,
    contact,
    ticket
  });

  logger.info(
    `[wacalls call] ${ev.action} callId=${ev.callId} contact=${contact?.id} status=${status}`
  );

  return { contact, ticket };
};

export default HandleWacallsCall;
