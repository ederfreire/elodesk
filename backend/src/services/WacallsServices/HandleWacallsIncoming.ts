import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import User from "../../models/User";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindCompanySettingsService from "../CompaniesSettings/FindCompanySettingsService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import Message from "../../models/Message";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import NotifyPendingTicketToUsers from "../UserServices/NotifyPendingTicketToUsers";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import { Op } from "sequelize";
import sequelize from "../../database";
import { createHash } from "crypto";
import {
  resolvePN,
  addLidPnMapping,
  lidEhIrresoluvel,
  marcarLidIrresoluvel
} from "../../utils/LidPnCache";
import { nomeDeContatoOuNumero } from "../../helpers/NomeDeContato";

/**
 * Locks em processo para evitar corrida entre webhooks concorrentes com
 * o mesmo wid (o WhatsApp/whatsmeow pode reenviar events.Message e
 * events.Receipt em paralelo). Escopado por companyId+wid.
 */
const inflight = new Map<string, Promise<any>>();
const withLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const prev = inflight.get(key);
  const run = (async () => {
    if (prev) { try { await prev; } catch { /* ignore */ } }
    return fn();
  })();
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    if (inflight.get(key) === run) inflight.delete(key);
  }
};

/**
 * Evento recebido do microserviço wacalls-voip.
 * O microserviço envia esses campos no webhook após ouvir events.Message do whatsmeow.
 */
export interface WacallsIncoming {
  sessionId: string;
  from: string;           // JID do remetente (ex: 5511999999999@s.whatsapp.net)
  id: string;             // id da mensagem no WhatsApp (para dedupe/ack)
  type: "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | string;
  text?: string;
  caption?: string;
  mediaUrl?: string;      // URL http servida pelo microserviço para baixar a mídia
  mimetype?: string;
  filename?: string;
  timestamp?: number;
  pushName?: string;
  isGroup?: boolean;
  groupJid?: string;
  fromMe?: boolean;       // se veio do próprio device pareado (echo)
  chat?: string;          // JID do chat (para fromMe direto, ev.from == meu jid)
  avatarUrl?: string;     // foto já resolvida/re-hospedada pelo chamador (wacalls-chat) — pula o fetch via WacallsBridgeService quando presente
  quotedWid?: string;     // wid da mensagem-alvo (usado por type="reactionMessage" pra grudar a reação na mensagem original)
  senderAltJid?: string;  // endereço alternativo (LID<->PN) que o whatsmeow já resolveu de graça no evento — equivalente a msg.key.senderPn do Baileys (ver messageContactHandler.ts)
  // forcedTicketStatus: "open"/"pending"/"closed" quando essa mensagem faz
  // parte de um import de histórico com status forçado pelo operador (ver
  // MessageRow.TicketStatus em wacalls-chat/cmd/server/messagestore.go) —
  // undefined pra mensagem ao vivo normal (nunca carrega esse campo).
  forcedTicketStatus?: string;
  // forcedQueueId: id da fila escolhida pelo operador no prompt de import
  // (ver MessageRow.TicketQueueID) — mesma técnica do forcedTicketStatus,
  // undefined pra mensagem ao vivo normal.
  forcedQueueId?: number;
}

const parsePhone = (jid: string): string => {
  return String(jid || "").split("@")[0].split(":")[0];
};

const filled = (...values: any[]): string => {
  const found = values.find(value => value !== undefined && value !== null && String(value).trim() !== "");
  return found === undefined || found === null ? "" : String(found).trim();
};

const hasDigits = (value: string): boolean => /\d/.test(String(value || ""));

const pickPeerJid = (ev: WacallsIncoming): string => {
  const from = filled(ev.from);
  const chat = filled(ev.chat);
  const group = filled(ev.groupJid);
  const isGroup = !!ev.isGroup || from.endsWith("@g.us") || chat.endsWith("@g.us") || group.endsWith("@g.us");

  const candidates = isGroup
    ? [group, chat, from]
    : ev.fromMe
      ? [chat, from]
      : [from, chat];

  return candidates.find(jid => jid && jid !== "status@broadcast" && hasDigits(parsePhone(jid))) || "";
};

const ensureMessageId = (ev: WacallsIncoming): string => {
  const id = filled(ev.id);
  if (id) return id;

  const seed = [
    ev.sessionId,
    filled(ev.from),
    filled(ev.chat),
    filled(ev.timestamp),
    filled(ev.type),
    filled(ev.text, ev.caption, ev.mediaUrl)
  ].join("|");

  return `wacalls-${createHash("sha1").update(seed).digest("hex")}`;
};

/**
 * Ingesta uma mensagem recebida pelo microserviço wacalls-voip:
 *   1) cria/atualiza contato
 *   2) find or create ticket (mesmo helper do Baileys)
 *   3) cria a mensagem no banco (dispara socket de atendimento)
 *
 * Sempre idempotente por wid: se já existir Message com o mesmo id, ignora.
 */
// Retorna o Contact resolvido (criado ou reaproveitado) pra quem chamou
// poder fazer coisas como buscar a foto de perfil sem precisar refazer a
// mesma busca (por remoteJid + channel) de novo — essa segunda busca
// independente é frágil (LID vs PN, contato reaproveitado de outro canal
// pela busca parcial por número em CreateOrUpdateContactService, etc.) e
// pode não achar o mesmo registro que acabamos de resolver aqui.
const HandleWacallsIncoming = async (
  whatsapp: Whatsapp,
  ev: WacallsIncoming
): Promise<Contact | null> => {
  const companyId = whatsapp.companyId;
  ev.id = ensureMessageId(ev);
  if (ev.id.startsWith("wacalls-")) {
    logger.warn(`[wacalls in] evento sem id original; usando id sintético ${ev.id}`);
  }

  return withLock(`in:${companyId}:${ev.id}`, async (): Promise<Contact | null> => {
    // Dedupe idempotente: consulta pelo campo wid escopado à empresa.
    const existing = await Message.findOne({
      where: { wid: ev.id, companyId },
      attributes: ["id"]
    });
    if (existing) {
      logger.debug(`[wacalls in] mensagem ${ev.id} já processada, ignorando`);
      return null;
    }

    return processIncoming(whatsapp, ev);
  });
};

const processIncoming = async (
  whatsapp: Whatsapp,
  ev: WacallsIncoming
): Promise<Contact | null> => {
  const companyId = whatsapp.companyId;

  // Descobre o JID do "outro lado" do chat. Em chats diretos, algumas versões
  // do whatsmeow podem preencher só Sender ou só Chat; em fromMe, o contato real
  // fica em Chat. Por isso fazemos fallback nos dois campos antes de criar contato.
  const peerJid = pickPeerJid(ev);
  const isGroup = !!ev.isGroup || peerJid.endsWith("@g.us");

  // GRUPO: o ticket precisa de DOIS contatos diferentes — o do GRUPO em si
  // (dono do ticket, igual o Baileys faz com `groupContact`) e o do MEMBRO
  // que mandou ESSA mensagem específica (Message.contactId). Antes disso,
  // as duas coisas usavam o mesmo "contact" (resolvido a partir do JID do
  // grupo), então toda mensagem de grupo ficava com contactId apontando pro
  // grupo — a tela não tinha como saber (nem mostrar) quem realmente
  // escreveu, só o nome/foto do grupo. Ver wbotMessageListener.ts (Baileys)
  // pro mesmo padrão: `contact` = remetente individual, `groupContact` = grupo.
  let groupContact: Contact | null = null;
  let senderPeerJid: string;

  if (isGroup) {
    const groupJid = filled(ev.groupJid, ev.chat, peerJid);
    const groupNumber = parsePhone(groupJid);
    if (!groupNumber || !hasDigits(groupNumber)) {
      logger.warn(`[wacalls in] evento de grupo ${ev.id} sem JID de grupo extraível, ignorando`);
      return null;
    }
    groupContact = await CreateOrUpdateContactService({
      name: groupNumber, // nome real do grupo chega depois via chat-meta sync (mesmo padrão de sempre)
      number: groupNumber,
      isGroup: true,
      companyId,
      channel: "wacalls",
      remoteJid: groupJid,
      whatsappId: whatsapp.id
    });

    // fromMe (a própria conexão postando no grupo) não tem "remetente
    // membro" de verdade — cai no JID do próprio grupo só pra satisfazer a
    // resolução abaixo; contactId da mensagem fica undefined nesse caso de
    // qualquer forma (ver mais abaixo).
    senderPeerJid = ev.fromMe ? groupJid : filled(ev.from, groupJid);
  } else {
    senderPeerJid = peerJid;
  }

  // Resolução LID→PN, espelhando getContactMessage do Baileys
  // (messageContactHandler.ts): quando o "outro lado" só se identifica por
  // LID (contato escondeu o número real — comum em contas novas/business),
  // tenta descobrir o telefone de verdade em camadas de custo crescente, na
  // MESMA ordem de prioridade que o Baileys usa lá:
  //   0) SenderAlt que o próprio whatsmeow já resolveu de graça no evento
  //      (ev.senderAltJid — equivalente a msg.key.senderPn do Baileys),
  //      sem nenhuma chamada de rede.
  //   1) cache compartilhado em memória (LidPnCache) — o MESMO cache de
  //      processo que o Baileys já alimenta (contacts.upsert, lid-mapping
  //      nativo, mensagens); wacalls e Baileys dividem esse cache, então um
  //      contato já resolvido por um canal beneficia o outro na hora.
  //   2) pede pro wacalls-chat resolver via loja local do whatsmeow
  //      (Store.LIDs) + warm-up USync — 1 chamada de rede, mesmo endpoint
  //      que HandleWacallsCall.ts já usa pra chamada (resolveLidToPhone).
  // Se nada resolver, mantém o LID cru — igual à degradação graciosa do
  // Baileys (não trava/derruba a mensagem, só não converte pra número real).
  let lidForContact: string | undefined;
  if (senderPeerJid.includes("@lid")) {
    lidForContact = senderPeerJid;
    const lidDigits = parsePhone(senderPeerJid);
    let resolved = "";

    if (ev.senderAltJid && hasDigits(parsePhone(ev.senderAltJid))) {
      resolved = ev.senderAltJid;
      addLidPnMapping(lidDigits, parsePhone(ev.senderAltJid));
    }

    if (!resolved) {
      const cachedPn = resolvePN(lidDigits);
      if (cachedPn) resolved = `${cachedPn}@s.whatsapp.net`;
    }

    // Terceiro nível: consulta de REDE (USync no wacalls-chat, timeout de 8s).
    // Só vale a pena se este LID não falhou há pouco — sem o cache negativo
    // um LID sem mapeamento refazia esta chamada a CADA mensagem, para
    // sempre, segurando o processamento por até 8 segundos cada vez.
    if (!resolved && !lidEhIrresoluvel(lidDigits)) {
      try {
        const { resolveLidToPhone } = await import("./WacallsChatCallService");
        const pn = await resolveLidToPhone(ev.sessionId, senderPeerJid);
        if (pn && hasDigits(pn)) {
          resolved = `${pn}@s.whatsapp.net`;
          addLidPnMapping(lidDigits, pn);
        } else {
          marcarLidIrresoluvel(lidDigits);
        }
      } catch {
        // mantém LID cru — mesmo fallback do Baileys
        marcarLidIrresoluvel(lidDigits);
      }
    }

    if (resolved) senderPeerJid = resolved;
  }

  const number = parsePhone(senderPeerJid);

  // ── CONSERTA O CONTATO QUE FICOU COM O LID NO LUGAR DO NÚMERO ─────────────
  //
  // Este é o motivo do contato duplicado no WhatsApp Plus.
  //
  // Quando a primeira mensagem de alguém chega com LID e NENHUM dos três
  // caminhos acima consegue resolver (sem senderAltJid, cache frio, whatsmeow
  // ainda sem o mapeamento), o contato nasce com `number` = dígitos do LID.
  //
  // Minutos depois o mapeamento aparece e a MESMA pessoa passa a chegar com o
  // telefone real. Aí:
  //   - a busca por `lid` não acontece, porque agora o jid não tem @lid e
  //     `lidForContact` fica indefinido;
  //   - a busca por número não acha, porque o contato antigo está gravado com
  //     os dígitos do LID;
  //   - a busca parcial pelos últimos 8/9 dígitos também não acha, porque
  //     LID e telefone não terminam igual.
  // Resultado: nasce um SEGUNDO contato para a mesma pessoa — os dois "Paulo
  // Sampaio" da lista, um com foto e outro sem.
  //
  // Agora, no instante em que o LID é resolvido, migramos o contato antigo
  // para o número real em vez de deixar os dois soltos. É migração de dado
  // existente, não criação: nenhum contato é apagado nem mesclado à força.
  if (lidForContact && number && hasDigits(number)) {
    const digitosDoLid = parsePhone(lidForContact);
    if (digitosDoLid && digitosDoLid !== number) {
      try {
        const contatoComLidNoNumero = await Contact.findOne({
          where: { companyId, number: digitosDoLid, isGroup: false }
        });
        if (contatoComLidNoNumero) {
          // Se JÁ existe um contato com o número real, o antigo é a duplicata.
          // Não apagamos nada aqui: só deixamos de usá-lo, e o vínculo de LID
          // aponta para o contato certo. A limpeza da duplicata é decisão do
          // operador, na tela de contatos.
          const contatoComNumeroReal = await Contact.findOne({
            where: { companyId, number, isGroup: false }
          });
          if (!contatoComNumeroReal) {
            await contatoComLidNoNumero.update({
              number,
              lid: lidForContact,
              remoteJid: senderPeerJid
            });
            logger.info(
              `[wacalls in] contato ${contatoComLidNoNumero.id} migrado de LID (${digitosDoLid}) para o número real ${number}`
            );
          } else {
            logger.warn(
              `[wacalls in] contato ${contatoComLidNoNumero.id} está com LID ${digitosDoLid} no número e já existe o contato ` +
                `${contatoComNumeroReal.id} com o número ${number}. São duplicados da mesma pessoa — junte na tela de contatos.`
            );
          }
        }
      } catch (err: any) {
        // Best-effort: nunca deixa de processar a mensagem por causa disso.
        logger.warn(`[wacalls in] falha ao migrar contato de LID para número: ${err?.message}`);
      }
    }
  }
  // Em eventos fromMe (mensagens saídas pelo dono da conexão — sync de
  // histórico, envio pelo celular pareado, etc.), o whatsmeow preenche
  // `ev.pushName` com o nome do DONO da conexão, não do peer. Se usarmos
  // esse valor como nome do contato do peer, TODO contato criado por
  // fromMe vira o nome do dono (sintoma: vários números diferentes na
  // agenda todos com o mesmo nome do usuário). Só aproveita o pushName
  // quando é mensagem realmente recebida — pra fromMe deixa o
  // CreateOrUpdateContact resolver o nome depois via WhatsApp/histórico.
  // pushName pode chegar como número mascarado ("+34•••••31") quando o
  // remetente usa privacidade de número. Nesse caso vale mais o número.
  const contactName = !ev.fromMe ? nomeDeContatoOuNumero(ev.pushName, number) : number;

  if (!number || !hasDigits(number)) {
    logger.warn(
      `[wacalls in] evento ${ev.id} sem number extraível (from=${ev.from} chat=${ev.chat} peer=${senderPeerJid}), ignorando`
    );
    return null;
  }

  const contact = await CreateOrUpdateContactService({
    name: contactName,
    number,
    isGroup: false,
    companyId,
    channel: "wacalls",
    remoteJid: senderPeerJid,
    lid: lidForContact,
    whatsappId: whatsapp.id,
    fromMe: !!ev.fromMe
  });

  // Espelha o padrão do Baileys (verifyContact.ts): sempre que um contato
  // tem LID conhecido, registra o mapeamento em WhatsappLidMap — tabela
  // compartilhada entre canais que outras partes do sistema já consultam
  // (GetContactService, ImportContacts, etc.). Sem isso, contatos wacalls
  // resolvidos por LID ficavam de fora dessa tabela mesmo já tendo o campo
  // `lid` preenchido no próprio Contact.
  if (lidForContact && contact) {
    try {
      await WhatsappLidMap.findOrCreate({
        where: { companyId, lid: lidForContact, contactId: contact.id },
        defaults: { companyId, lid: lidForContact, contactId: contact.id }
      });
    } catch { /* best-effort, não bloqueia a mensagem */ }
  }

  // Best-effort: se o chamador já resolveu a foto (wacalls-chat re-hospeda
  // antes de chamar aqui), usa direto. Removido o fallback que chamava
  // getWacallsProfilePicture (wacalls-voip) — esse serviço não roda mais
  // nesta instalação; a chamada só ia falhar/segurar o processamento da
  // mensagem à toa (era `await`ado ANTES da criação do ticket, bloqueando o
  // pipeline inteiro até o timeout do cliente HTTP). A busca de foto de
  // verdade agora acontece em background via ensureContactAvatar (ver
  // WacallsChatMessageService.ts), que não bloqueia a mensagem.
  if (!ev.fromMe && ev.avatarUrl && !(contact as any).profilePicUrl) {
    try { await contact.update({ profilePicUrl: ev.avatarUrl, urlPicture: ev.avatarUrl } as any); } catch { /* silencioso */ }
  }


  const settings = await FindCompanySettingsService({ companyId });
  let fullWhatsapp = whatsapp;
  let defaultQueueId: number | null = null;

  try {
    // Carrega as filas vinculadas à conexão. Sem queueId o frontend pode ocultar
    // o ticket em "Aguardando" para usuários que só veem suas filas.
    fullWhatsapp = await ShowWhatsAppService(whatsapp.id, companyId, 0);
    const queues = Array.isArray((fullWhatsapp as any).queues) ? (fullWhatsapp as any).queues : [];
    if (queues.length > 0) {
      defaultQueueId = Number(queues[0].id) || null;
      if (queues.length > 1) {
        logger.info(`[wacalls in] conexão ${whatsapp.id} tem ${queues.length} filas; usando fila padrão ${defaultQueueId}`);
      }
    }
  } catch (err: any) {
    logger.warn(`[wacalls in] não foi possível carregar filas da conexão ${whatsapp.id}: ${err?.message}`);
  }

  let ticket: Ticket | null = null;
  let reopenedFromClosed = false;

  // Wacalls: quando o cliente manda mensagem depois de o atendimento estar
  // fechado, a configuração `timeCreateNewTicket=0` fazia o helper padrão
  // criar outro ticket e deixava o ticket fechado antigo preso em
  // "Resolvidos". Antes de criar um novo, reaproveita o último `closed` da
  // mesma conexão/contato e volta ele para `pending` (sem atendente), que é a
  // aba "Aguardando".
  if (!ev.fromMe) {
    const ticketContactId = groupContact ? groupContact.id : contact.id;
    const activeTicket = await Ticket.findOne({
      where: {
        status: { [Op.or]: ["open", "pending", "group", "chatbot", "nps", "lgpd"] },
        contactId: ticketContactId,
        companyId,
        whatsappId: whatsapp.id
      },
      order: [["updatedAt", "DESC"]]
    });

    if (!activeTicket) {
      const closedTicket = await Ticket.findOne({
        where: {
          status: "closed",
          contactId: ticketContactId,
          companyId,
          whatsappId: whatsapp.id
        },
        order: [["updatedAt", "DESC"]]
      });

      if (closedTicket) {
        // Só grupo de verdade (groupContact resolvido a partir de @g.us)
        // volta para a aba Grupos; ticket comum sempre reabre em Aguardando.
        const reopenStatus = groupContact ? "group" : "pending";
        const reopenData: any = {
          status: reopenStatus,
          unreadMessages: Number(closedTicket.unreadMessages || 0) + 1,
          isBot: false
        };

        if (reopenStatus === "pending") {
          reopenData.userId = null;
        }

        // Se a conexão tem fluxo vinculado (flowIdWelcome/flowIdNotPhrase),
        // a reabertura precisa "zerar" o ticket pra o bot voltar a rodar:
        // sem esse reset, o queueId antigo bloqueia o handleWacallsBotFlow
        // (passo 5 exige !ticket.queueId) e o fluxo linkado nunca dispara.
        // Também limpa qualquer marcador de fluxo/campanha anterior.
        const hasLinkedFlow =
          !!(whatsapp as any).flowIdWelcome ||
          !!(whatsapp as any).flowIdNotPhrase;

        if (hasLinkedFlow && reopenStatus === "pending") {
          reopenData.queueId = null;
          reopenData.chatbot = false;
          reopenData.amountUsedBotQueues = 0;
          reopenData.flowWebhook = false;
          reopenData.flowStopped = null;
          reopenData.lastFlowId = null;
          reopenData.hashFlowId = null;
          reopenData.dataWebhook = null;
          reopenData.useIntegration = false;
          reopenData.integrationId = null;
          reopenData.promptId = null;
          reopenData.typebotSessionId = null;
        } else if (
          (!closedTicket.queueId || Number(closedTicket.queueId) === 0) &&
          defaultQueueId
        ) {
          reopenData.queueId = defaultQueueId;
        }

        await closedTicket.update(reopenData);

        // Zera o cache de "primeiro contato" desse ticket pra o
        // flowbuilderIntegration voltar a disparar flowIdWelcome/
        // flowIdNotPhrase mesmo em cima de um ticket reaberto.
        if (hasLinkedFlow) {
          try {
            const { default: cacheLayer } = await import("../../libs/cache");
            await cacheLayer.del(`first-contact-executed:${closedTicket.id}`);
          } catch {
            /* silencioso: cache indisponível não deve derrubar a ingestão */
          }
        }

        ticket = closedTicket;
        reopenedFromClosed = true;
        logger.info(
          `[wacalls in] ticket fechado ${ticket.id} reaberto como ${reopenStatus}${
            hasLinkedFlow ? " (fluxo vinculado reativado)" : ""
          }`
        );
      }
    }
  }

  // ── Eco da nossa própria mensagem não cria ticket novo ──────────────────
  //
  // Toda mensagem que o sistema envia volta pelo SSE do wacalls-chat como um
  // evento fromMe. O bloco de reabertura acima é intencionalmente restrito a
  // `!ev.fromMe` (só mensagem do CLIENTE reabre atendimento), então para o
  // eco o `ticket` seguia nulo e caía direto no FindOrCreateTicketService,
  // que abria um atendimento novo.
  //
  // Era exatamente isso que fazia o nó "Sair/Encerrar" do FlowBuilder
  // parecer não funcionar: ele fechava o ticket certinho, mandava a
  // despedida, e o eco dessa própria despedida abria outro ticket em
  // seguida ("Conversa criada" logo abaixo da mensagem de encerramento).
  //
  // Para fromMe, então, reaproveitamos o ticket fechado mais recente do
  // mesmo contato/conexão — a mensagem fica registrada no histórico certo e
  // o atendimento continua encerrado.
  if (!ticket && ev.fromMe) {
    const ticketContactIdEco = groupContact ? groupContact.id : contact.id;
    const ticketRecemFechado = await Ticket.findOne({
      where: {
        status: "closed",
        contactId: ticketContactIdEco,
        companyId,
        whatsappId: whatsapp.id
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticketRecemFechado) {
      ticket = ticketRecemFechado;
      logger.info(
        `[wacalls in] mensagem própria anexada ao ticket fechado ${ticket.id} (sem abrir atendimento novo)`
      );
    }
  }

  if (!ticket) {
    ticket = await FindOrCreateTicketService(
      contact,
      fullWhatsapp,
      ev.fromMe ? 0 : 1,
      companyId,
      defaultQueueId,
      null,
      groupContact || undefined,
      "wacalls",
      false,
      false,
      settings
    );
  }

  const ticketTraking = await FindOrCreateATicketTrakingService({
    ticketId: ticket.id,
    companyId,
    whatsappId: whatsapp.id,
    userId: null
  });

  // Tipo não reconhecido pelo classificador do wacalls-chat (protocolo/
  // sistema — ex: enquete, convite de grupo, mudança de config efêmera —
  // qualquer coisa que o whatsmeow decodifica mas ainda não temos um mapeamento
  // específico) E sem nenhum conteúdo aproveitável: em vez de criar uma
  // mensagem visível só com o texto cru "[unknown]" (que não representa nada
  // pro atendente), ignora silenciosamente. Se tiver mídia ou texto/legenda,
  // mostra do jeito que der — melhor um card genérico do que sumir com a
  // mensagem de verdade.
  if (ev.type === "unknown" && !ev.mediaUrl && !filled(ev.caption, ev.text)) {
    logger.info(`[wacalls in] evento ${ev.id} tipo não reconhecido sem conteúdo (mensagem de sistema/protocolo) — ignorado.`);
    return groupContact || contact;
  }

  const body =
    ev.type === "text"
      ? ev.text || ""
      : ev.caption || (ev.type === "image" ? "" : `[${ev.type}]`);

  // ── TRADUÇÃO DO TIPO DO wacalls-chat PARA O `mediaType` DO FRONTEND ───────
  //
  // O serviço Go usa nomes curtos ("contact", "location") e o frontend
  // (components/MessagesList/index.js) testa pelos nomes do Baileys
  // ("contactMessage", "locationMessage"). Só três traduções existiam, e
  // estavam espalhadas: "text"→"chat" aqui, "ptt"/"voice"→"audio" e
  // "reaction"→"reactionMessage" lá no WacallsChatMessageService.
  //
  // As duas que faltavam causavam bug visível SÓ no canal WhatsApp Plus:
  //   - contato (vCard): caía no ramo genérico de texto e imprimia o vCard
  //     CRU na bolha ("BEGIN:VCARD\nVERSION:3.0\nFN:...") em vez do cartão.
  //   - localização: o frontend só monta o mapa quando mediaType é
  //     "locationMessage", então a bolha aparecia vazia.
  //
  // Tabela explícita em vez de ternário aninhado justamente pra que a
  // próxima adição de tipo não repita o esquecimento.
  const TIPO_PARA_MEDIATYPE: Record<string, string> = {
    text: "chat",
    contact: "contactMessage",
    location: "locationMessage"
  };

  const mediaType = TIPO_PARA_MEDIATYPE[ev.type] || ev.type;

  // Reação (mediaType "reactionMessage") precisa do id LOCAL (PK) da
  // mensagem-alvo pra o frontend conseguir grudar a reação nela — o
  // wacalls-chat só manda o wid original, então resolve aqui.
  let quotedMsgId: number | undefined;
  if (ev.quotedWid) {
    try {
      const quoted = await Message.findOne({ where: { wid: ev.quotedWid, companyId }, attributes: ["id"] });
      if (quoted) quotedMsgId = quoted.id;
    } catch { /* silencioso */ }
  }

  logger.debug(
    `[wacalls in] processando wid=${ev.id} fromMe=${!!ev.fromMe} peer=${senderPeerJid} grupo=${groupContact?.id || "-"} ticket=${ticket.id} status=${ticket.status}`
  );

  try {
    await sequelize.transaction(async t => {
      await CreateMessageService({
        messageData: {
          wid: ev.id,
          ticketId: ticket.id,
          contactId: ev.fromMe ? undefined : contact.id,
          body,
          fromMe: !!ev.fromMe,
          read: !!ev.fromMe,
          mediaType,
          mediaUrl: ev.mediaUrl,
          ack: ev.fromMe ? 1 : 2,
          channel: "wacalls",
          quotedMsgId: quotedMsgId || null
        },
        companyId,
        // @ts-ignore CreateMessageService aceita transação quando disponível
        transaction: t
      });

      await ticket.update({ lastMessage: body || `[${ev.type}]` }, { transaction: t });
    });
  } catch (err: any) {
    const name = err?.name || err?.original?.name;
    const code = err?.original?.code || err?.parent?.code;
    if (name === "SequelizeUniqueConstraintError" || code === "23505") {
      logger.debug(`[wacalls in] unique violation p/ ${ev.id}, dedupe OK`);
      return groupContact || contact;
    }
    throw err;
  }

  // Aviso de "não aceita áudio" (config "acceptAudioMessageContact") — mesmo
  // critério/texto do Baileys (wbotMessageListener.ts, bloco "Verificação se
  // aceita audio do contato"): dispara quando o contato não tem consentimento
  // individual (contact.acceptAudioMessage) OU a empresa desabilitou áudio
  // globalmente. Só um aviso — não bloqueia a mensagem em si (mesmo
  // comportamento de lá: o áudio já foi persistido acima e continua
  // aparecendo pro atendente, só some o aviso automático pro cliente).
  if (
    ev.type === "audio" &&
    !ev.fromMe &&
    (isGroup ? (fullWhatsapp as any)?.groupAsTicket === "enabled" : true) &&
    (!contact?.acceptAudioMessage || settings?.acceptAudioMessageContact === "disabled")
  ) {
    try {
      const { SendWacallsText } = await import("./SendWacallsMessageService");
      await SendWacallsText({
        body: "‎*Assistente Virtual*:\nInfelizmente não conseguimos ouvir nem enviar áudios por este canal de atendimento. Por favor, envie uma mensagem de *texto*.",
        ticket
      });
    } catch (err: any) {
      logger.error(`[wacalls in] Falha ao enviar aviso de áudio não aceito: ${err?.message}`);
    }
  }

  // Se o ticket ainda estava fechado aqui, força status pending (ou group) —
  // mesmo tratamento do Baileys — e remove o atendente antigo.
  if (!ev.fromMe && ticket.status === "closed") {
    const reopenStatus = groupContact ? "group" : "pending";
    await ticket.update({
      status: reopenStatus,
      ...(reopenStatus === "pending" ? { userId: null } : {})
    });
    reopenedFromClosed = true;
  }

  // Recarrega o ticket com TODAS as associações que o frontend espera no
  // payload do socket. Sem esses includes (queue/user/contact/whatsapp) o
  // reducer do frontend descarta a atualização.
  await ticket.reload({
    include: [
      { model: Queue, as: "queue" },
      { model: User, as: "user" },
      { model: Contact, as: "contact" },
      { model: Whatsapp, as: "whatsapp" },
      { model: Tag, as: "tags" }
    ]
  });

  const io = getIO();
  // IMPORTANTE: só emite `delete` quando o ticket foi reaberto de "closed".
  // Emitir `delete` em toda mensagem (inclusive fromMe do próprio atendente)
  // fazia o frontend remover o card da aba "Atendendo" ao enviar texto/áudio,
  // dando a sensação de que a conversa "fechou" sozinha.
  if (reopenedFromClosed) {
    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticket,
      ticketId: ticket.id
    });
  }
  io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
    action: "update",
    ticket,
    ticketId: ticket.id
  });

  if (!ev.fromMe && ticket.status === "pending" && ticket.queueId) {
    NotifyPendingTicketToUsers(ticket).catch(err =>
      logger.error(`[wacalls in] Falha ao notificar ticket reaberto ${ticket.id}: ${err?.message}`)
    );
  }

  logger.debug(
    `[wacalls in] msg ${ev.id} recebida contact=${contact.id} grupo=${groupContact?.id || "-"} ticket=${ticket.id} type=${ev.type}`
  );

  // FlowBuilder/integrações/saudação/NPS — só faz sentido pra mensagem
  // recebida do cliente (não fromMe), fora de grupo e com o traking já
  // resolvido. Roda em "fire and forget" controlado (não deixa erro do bot
  // derrubar a ingestão da mensagem, que já foi persistida acima) — qualquer
  // falha fica só logada dentro do próprio handleWacallsBotFlow.
  if (!ev.fromMe && !isGroup) {
    try {
      const { handleWacallsBotFlow } = await import("./WacallsBotEngine");
      await handleWacallsBotFlow(fullWhatsapp, ticket, contact, ticketTraking, ev);
    } catch (err: any) {
      logger.error(`[wacalls in] Falha no motor de bot (ticket ${ticket.id}): ${err?.message}`);
    }
  }

  // Import de histórico com status/fila forçados (ver "coloca os tickets
  // atendendo/aguardando/resolvidos" e "seleciona uma fila para importar"
  // no prompt de import da tela de conexão): aplicado por ÚLTIMO, depois do
  // fluxo de bot acima, pra garantir que a escolha do operador prevalece
  // sobre qualquer roteamento automático de fila/saudação que a mensagem
  // importada possa ter disparado. Só existe em ev.forcedTicketStatus/
  // forcedQueueId quando a mensagem veio de handleHistorySync (wacalls-chat)
  // com esses campos preenchidos — mensagem ao vivo normal nunca aciona
  // este bloco.
  const hasForcedStatus =
    !!ev.forcedTicketStatus &&
    ["open", "pending", "closed"].includes(ev.forcedTicketStatus) &&
    ticket.status !== ev.forcedTicketStatus;
  const hasForcedQueue =
    !!ev.forcedQueueId && ticket.queueId !== ev.forcedQueueId;
  if (hasForcedStatus || hasForcedQueue) {
    await ticket.update({
      ...(hasForcedStatus ? { status: ev.forcedTicketStatus } : {}),
      ...(hasForcedQueue ? { queueId: ev.forcedQueueId } : {})
    });
    getIO().of(String(companyId)).emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket,
      ticketId: ticket.id
    });
  }

  return groupContact || contact;
};

export default HandleWacallsIncoming;

/**
 * Atualiza o ACK de uma mensagem enviada via wacalls. WhatsApp usa a escala:
 *   0=pending, 1=sent, 2=received, 3=read, 4=played.
 *
 * Espelha o comportamento de handleMsgAck do Baileys: procura pelo `wid`
 * (não pelo PK numérico), garante monotonicidade (nunca decrementa) e
 * emite `appMessage`/`update` com o payload completo para o socket.
 */
export const HandleWacallsAck = async (
  wid: string,
  ack: number,
  companyId?: number
): Promise<void> => {
  if (!wid || Number.isNaN(ack)) return;

  await withLock(`ack:${companyId || 0}:${wid}`, async () => {
    const where: any = { wid, fromMe: true, ack: { [Op.lt]: ack } };
    if (companyId) where.companyId = companyId;

    // Transação com SELECT ... FOR UPDATE + UPDATE guardado. Duas camadas de
    // proteção contra regressão: (1) o WHERE ack < :ack aqui, e (2) o trigger
    // enforce_messages_ack_monotonic no banco, que descarta qualquer UPDATE
    // que tente decrementar o ack, mesmo vindo de outros caminhos.
    const updated = await sequelize.transaction(async t => {
      const [affected] = await Message.update(
        { ack },
        { where, transaction: t }
      );
      if (!affected) return null;

      const row = await Message.findOne({
        where: (() => {
          const w: any = { wid, fromMe: true };
          if (companyId) w.companyId = companyId;
          return w;
        })(),
        attributes: ["id", "companyId"],
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      return row;
    });

    if (!updated) {
      logger.debug(`[wacalls ack] ${wid} ignorado (ack já >= ${ack} ou não encontrado)`);
      return;
    }


    const fullMessage = await Message.findByPk(updated.id, {
      include: [
        "contact",
        {
          model: Ticket,
          as: "ticket",
          include: [
            {
              model: Contact,
              attributes: [
                "id", "name", "number", "email", "profilePicUrl",
                "acceptAudioMessage", "active", "urlPicture", "companyId"
              ],
              include: ["extraInfo", "tags"]
            },
            { model: Queue, attributes: ["id", "name", "color"] },
            { model: Whatsapp, attributes: ["id", "name", "groupAsTicket", "color"] },
            { model: User, attributes: ["id", "name"] },
            { model: Tag, as: "tags", attributes: ["id", "name", "color"] }
          ]
        },
        { model: Message, as: "quotedMsg", include: ["contact"] }
      ]
    });

    if (!fullMessage) return;
    const io = getIO();
    io.of(String(fullMessage.companyId)).emit(
      `company-${fullMessage.companyId}-appMessage`,
      { action: "update", message: fullMessage }
    );
    logger.debug(`[wacalls ack] msg ${wid} ack=${ack}`);
  });
};
