import axios from "axios";
import logger from "../../utils/logger";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import CreateOrUpdateContactServiceForImport from "../ContactServices/CreateOrUpdateContactServiceForImport";
import { getIO } from "../../libs/socket";
import { getInMemoryStore } from "../../libs/wbot";
import { resolvePN, addLidPnMapping } from "../../utils/LidPnCache";

/**
 * Resolve um JID "@lid" (identificador interno do WhatsApp multi-device,
 * usado quando o contato não expõe o número real por privacidade/conta
 * business) pro JID real "@s.whatsapp.net", usando a mesma estratégia em
 * camadas do messageContactHandler.ts (getContactMessage) — cache em
 * memória primeiro (grátis), depois o mapeamento nativo do Baileys, depois
 * onWhatsApp como último recurso. Sem isso, contatos só-LID importados
 * ficavam salvos com os dígitos crus do LID como "número de telefone", o
 * que aparecia pro atendente como um número sem sentido em vez do telefone
 * de verdade do contato.
 */
const resolveLidJidForImport = async (wbot: any, jid: string): Promise<string> => {
  if (!jid.includes("@lid")) return jid;
  const lidDigits = jid.split("@")[0].split(":")[0].replace(/\D/g, "");

  const cachedPn = resolvePN(lidDigits);
  if (cachedPn) return `${cachedPn}@s.whatsapp.net`;

  try {
    const pn = await wbot.signalRepository?.lidMapping?.getPNForLID?.(jid);
    if (pn) {
      const pnDigits = String(pn).split("@")[0].split(":")[0].replace(/\D/g, "");
      if (pnDigits) addLidPnMapping(lidDigits, pnDigits);
      return String(pn).includes("@") ? String(pn) : `${pn}@s.whatsapp.net`;
    }
  } catch {
    /* segue pro próximo fallback */
  }

  try {
    const ow = await wbot.onWhatsApp?.(jid);
    const resolved = ow?.[0]?.exists ? ow?.[0]?.jid : null;
    if (resolved && !String(resolved).includes("@lid")) {
      const pnDigits = String(resolved).split("@")[0].split(":")[0].replace(/\D/g, "");
      if (pnDigits) addLidPnMapping(lidDigits, pnDigits);
      return resolved;
    }
  } catch {
    /* mantém o LID cru — degrada graciosamente, não quebra o import */
  }

  return jid;
};

const ZAPI_BASE = "https://api.z-api.io";

// Global cancellation flags per company
const cancelledImports = new Map<number, boolean>();

export const cancelImport = (companyId: number) => {
  cancelledImports.set(companyId, true);
  logger.info(`[ImportMessages] Cancelamento solicitado para empresa ${companyId}`);
};

const isCancelled = (companyId: number): boolean => {
  return cancelledImports.get(companyId) === true;
};

interface ImportMessagesRequest {
  whatsappId: number;
  companyId: number;
  userId: number;
  startDate: string;
  endDate: string;
  messageType: "all" | "individual" | "group";
  ticketStatus: "open" | "pending" | "closed";
  // queueId opcional — fila a atribuir a todo ticket criado por esse
  // import (mesma opção que já existe pra status). undefined/0 = sem fila
  // (comportamento de antes, ticket criado sem fila).
  queueId?: number;
}

interface ImportResult {
  totalChats: number;
  totalMessages: number;
  totalContacts: number;
  totalTickets: number;
  errors: string[];
}

const emitProgress = (companyId: number, data: {
  stage: string;
  detail: string;
  whatsappId?: number;
  totalChats?: number;
  processedChats?: number;
  totalMessages?: number;
  totalTickets?: number;
  totalContacts?: number;
  errors?: number;
}) => {
  try {
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-importMessages`, {
      action: "progress",
      ...data,
    });
  } catch (_e) {}
};

/**
 * Recarrega o ticket com as associações que o frontend precisa pra
 * renderizar o card na lista (fila, contato, usuário). O Ticket.create do
 * import devolve uma instância "crua", só com as colunas — emitir ela
 * direto no socket fazia o ticket chegar na tela SEM a fila (ticket.queue
 * undefined), mesmo com queueId gravado certinho no banco: era exatamente
 * o "coloco a fila e ele não vincula" relatado. Só depois de um F5 (quando
 * a lista é buscada pela API, que já traz os includes) a fila aparecia.
 */
const reloadTicketForEmit = async (ticket: Ticket): Promise<Ticket> => {
  try {
    const full = await Ticket.findByPk(ticket.id, {
      include: [
        { model: Contact, as: "contact" },
        { model: Queue, as: "queue" },
        { model: User, as: "user" }
      ]
    });
    return full || ticket;
  } catch (_e) {
    return ticket;
  }
};

const getMessageTimestamp = (msg: any): number => {
  if (typeof msg?.messageTimestamp === "number") return msg.messageTimestamp;
  return parseInt(msg?.messageTimestamp?.low || msg?.messageTimestamp || "0", 10);
};

const getMessageBody = (msg: any): string => {
  return (
    msg?.message?.conversation
    || msg?.message?.extendedTextMessage?.text
    || msg?.message?.imageMessage?.caption
    || msg?.message?.videoMessage?.caption
    || msg?.message?.documentMessage?.title
    || msg?.message?.reactionMessage?.text
    || ""
  );
};

const getMediaType = (msg: any): string => {
  if (msg?.message?.imageMessage) return "image";
  if (msg?.message?.audioMessage) return "audio";
  if (msg?.message?.videoMessage) return "video";
  if (msg?.message?.documentMessage) return "document";
  if (msg?.message?.stickerMessage) return "sticker";
  if (msg?.message?.reactionMessage) return "reactionMessage";
  return "chat";
};

const isImportableBaileysMessage = (msg: any, startTimestamp: number, endTimestamp: number): boolean => {
  const msgTimestamp = getMessageTimestamp(msg);

  if (msgTimestamp > 0 && (msgTimestamp < startTimestamp || msgTimestamp > endTimestamp)) {
    return false;
  }

  const hasBody = !!getMessageBody(msg);
  const hasMedia = !!(
    msg?.message?.imageMessage
    || msg?.message?.audioMessage
    || msg?.message?.videoMessage
    || msg?.message?.documentMessage
    || msg?.message?.stickerMessage
    || msg?.message?.reactionMessage
  );

  return hasBody || hasMedia;
};

const persistMessagesForTicket = async ({
  messages,
  ticket,
  contactId,
  companyId,
  result,
}: {
  messages: any[];
  ticket: Ticket;
  contactId: number;
  companyId: number;
  result: ImportResult;
}): Promise<void> => {
  for (const msg of messages) {
    try {
      const msgTimestamp = getMessageTimestamp(msg);
      const body = getMessageBody(msg);
      const mediaType = getMediaType(msg);
      const messageId = msg?.key?.id || `import_baileys_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const fromMe = !!msg?.key?.fromMe;

      // Não passar "id" aqui: a PK de Message é um inteiro auto-increment
      // (id: number), diferente de "wid" (o ID de mensagem do WhatsApp, uma
      // string tipo "3EB0C767D26A1D8F0CFB"). Passar messageId (string) como
      // "id" fazia TODO upsert falhar silenciosamente pra qualquer mensagem
      // com ID real (não numérico) — exatamente o "0 msgs, 243 erros" visto
      // no import. wid já é o identificador único usado pra dedupe.
      await Message.upsert({
        wid: messageId,
        ticketId: ticket.id,
        contactId,
        companyId,
        body,
        fromMe,
        read: true,
        mediaType,
        ack: 3,
        createdAt: msgTimestamp > 0 ? new Date(msgTimestamp * 1000) : new Date(),
      });

      result.totalMessages++;
    } catch (msgErr: any) {
      result.errors.push(`Erro msg importada: ${msgErr.message}`);
    }
  }
};

const createTicketWithMessages = async ({
  contactId,
  companyId,
  whatsappId,
  isGroup,
  userId,
  ticketStatus,
  queueId,
  messages,
  result,
}: {
  contactId: number;
  companyId: number;
  whatsappId: number;
  isGroup: boolean;
  userId: number;
  ticketStatus: string;
  queueId?: number;
  messages: any[];
  result: ImportResult;
}): Promise<Ticket> => {
  const finalStatus = isGroup ? "group" : ticketStatus;
  const ticket = await Ticket.create({
    contactId,
    companyId,
    whatsappId,
    channel: "whatsapp",
    isGroup,
    userId,
    status: finalStatus,
    // Grupo não recebe fila (mesma regra do resto do sistema — fila é só
    // pra atendimento individual). queueId opcional, escolhido pelo
    // operador no prompt de import; sem ele, ticket segue sem fila (igual
    // comportamento de antes dessa opção existir).
    queueId: isGroup ? null : (queueId || null),
    lastMessage: "",
    isBot: false,
    isActiveDemand: false,
    imported: new Date(),
  });

  logger.info(`[ImportMessages] Ticket criado id=${ticket.id} status=${finalStatus} (solicitado=${ticketStatus})`);
  result.totalTickets++;

  await persistMessagesForTicket({
    messages,
    ticket,
    contactId,
    companyId,
    result,
  });

  const lastMsg = await Message.findOne({
    where: { ticketId: ticket.id },
    order: [["createdAt", "DESC"]],
  });

  if (lastMsg) {
    await ticket.update({ lastMessage: lastMsg.body });
  }

  return ticket;
};

const importFromZApi = async (
  whatsapp: Whatsapp,
  companyId: number,
  userId: number,
  startTimestamp: number,
  endTimestamp: number,
  messageType: string,
  ticketStatus: string,
  queueId?: number
): Promise<ImportResult> => {
  const client = axios.create({
    baseURL: `${ZAPI_BASE}/instances/${whatsapp.zapiInstanceId}/token/${whatsapp.zapiToken}`,
    headers: {
      "Content-Type": "application/json",
      "Client-Token": whatsapp.zapiClientToken,
    },
  });

  const result: ImportResult = { totalChats: 0, totalMessages: 0, totalContacts: 0, totalTickets: 0, errors: [] };
  const io = getIO();

  let allChats: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const { data } = await client.get(`/chats?page=${page}&pageSize=20`);
      if (data && Array.isArray(data) && data.length > 0) {
        allChats = [...allChats, ...data];
        page++;
        if (data.length < 20) hasMore = false;
      } else {
        hasMore = false;
      }
    } catch (err: any) {
      logger.error(`[ImportMessages] Erro ao buscar chats Z-API página ${page}: ${err.message}`);
      hasMore = false;
    }
  }

  const filteredChats = allChats.filter((chat: any) => {
    const isGroup = chat.isGroup || (chat.phone && chat.phone.includes("-")) || (chat.phone && chat.phone.includes("@g.us"));
    if (messageType === "individual" && isGroup) return false;
    if (messageType === "group" && !isGroup) return false;
    // Mesma regra do allowGroup aplicada no import Baileys logo abaixo —
    // sem essa conexão permitir grupo, não importa grupo nenhum.
    if (isGroup && !whatsapp.allowGroup) return false;
    const chatTime = parseInt(chat.lastMessageTime || "0", 10);
    if (chatTime > 0 && chatTime < startTimestamp) return false;
    return true;
  });

  result.totalChats = filteredChats.length;
  emitProgress(companyId, { stage: "scanning", detail: `${filteredChats.length} chats encontrados`, whatsappId: whatsapp.id, totalChats: filteredChats.length, processedChats: 0 });

  let processedChats = 0;
  for (const chat of filteredChats) {
    if (isCancelled(companyId)) {
      emitProgress(companyId, { stage: "cancelled", detail: "Importação cancelada pelo usuário", whatsappId: whatsapp.id, totalChats: filteredChats.length, processedChats, totalMessages: result.totalMessages, totalTickets: result.totalTickets, totalContacts: result.totalContacts, errors: result.errors.length });
      break;
    }
    try {
      const rawPhone = String(chat.phone || "");
      const isGroup = chat.isGroup || rawPhone.includes("-") || rawPhone.includes("@g.us");
      const phone = isGroup ? rawPhone.replace(/@g\.us$/, "") : rawPhone.replace(/[^0-9]/g, "");

      if (!phone) continue;

      const { data: messages } = await client.get(`/chat-messages/${chat.phone}`);
      const importableMessages = Array.isArray(messages)
        ? messages.filter((msg: any) => {
            const msgTimestamp = parseInt(msg.mompiTimestamp || msg.timestamp || "0", 10);
            if (msgTimestamp > 0 && (msgTimestamp < startTimestamp || msgTimestamp > endTimestamp)) return false;
            const body = msg.text?.message || msg.caption || msg.body || "";
            return !!(body || msg.image || msg.audio || msg.video || msg.document);
          })
        : [];

      if (importableMessages.length === 0) continue;

      const contact = await CreateOrUpdateContactServiceForImport({
        name: chat.name || phone,
        number: phone,
        isGroup: !!isGroup,
        profilePicUrl: chat.imgUrl || "",
        companyId,
        whatsappId: whatsapp.id,
      });
      result.totalContacts++;

      const normalizedMessages = importableMessages.map((msg: any) => {
        const msgTimestamp = parseInt(msg.mompiTimestamp || msg.timestamp || "0", 10);
        let mediaType = "chat";
        if (msg.image) mediaType = "image";
        else if (msg.audio) mediaType = "audio";
        else if (msg.video) mediaType = "video";
        else if (msg.document) mediaType = "document";

        return {
          key: {
            id: msg.messageId || msg.id || `import_zapi_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            fromMe: !!msg.fromMe,
          },
          body: msg.text?.message || msg.caption || msg.body || "",
          mediaType,
          messageTimestamp: msgTimestamp,
        };
      });

      const zApiTicketStatus = isGroup ? "group" : ticketStatus;
      const ticket = await Ticket.create({
        contactId: contact.id,
        companyId,
        whatsappId: whatsapp.id,
        channel: "whatsapp",
        isGroup: !!isGroup,
        userId,
        status: zApiTicketStatus,
        queueId: isGroup ? null : (queueId || null),
        lastMessage: "",
        isBot: false,
        isActiveDemand: false,
        imported: new Date(),
      });
      logger.info(`[ImportMessages Z-API] Ticket criado id=${ticket.id} status=${zApiTicketStatus} (solicitado=${ticketStatus})`);
      result.totalTickets++;

      for (const msg of normalizedMessages) {
        // Mesmo bug do outro upsert acima: "id" é PK inteira auto-increment,
        // não usar o ID de mensagem do Z-API/WhatsApp aqui.
        await Message.upsert({
          wid: msg.key.id,
          ticketId: ticket.id,
          contactId: contact.id,
          companyId,
          body: msg.body,
          fromMe: msg.key.fromMe,
          read: true,
          mediaType: msg.mediaType,
          ack: 3,
          createdAt: msg.messageTimestamp > 0 ? new Date(msg.messageTimestamp * 1000) : new Date(),
        });
        result.totalMessages++;
      }

      const lastMsg = await Message.findOne({
        where: { ticketId: ticket.id },
        order: [["createdAt", "DESC"]],
      });
      if (lastMsg) await ticket.update({ lastMessage: lastMsg.body });

      io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket: await reloadTicketForEmit(ticket)
      });

      processedChats++;
      emitProgress(companyId, {
        stage: "importing",
        detail: `Chat "${chat.name || phone}" - ${importableMessages.length} msgs importadas`,
        whatsappId: whatsapp.id,
        totalChats: filteredChats.length,
        processedChats,
        totalMessages: result.totalMessages,
        totalTickets: result.totalTickets,
        totalContacts: result.totalContacts,
        errors: result.errors.length,
      });
    } catch (chatErr: any) {
      processedChats++;
      result.errors.push(`Erro chat ${chat.phone}: ${chatErr.message}`);
    }
  }

  return result;
};

const importFromBaileys = async (
  whatsapp: Whatsapp,
  companyId: number,
  userId: number,
  startTimestamp: number,
  endTimestamp: number,
  messageType: string,
  ticketStatus: string,
  queueId?: number
): Promise<ImportResult> => {
  const { getWbot } = await import("../../libs/wbot");
  const result: ImportResult = { totalChats: 0, totalMessages: 0, totalContacts: 0, totalTickets: 0, errors: [] };
  const io = getIO();

  let wbot: any;
  try {
    wbot = getWbot(whatsapp.id);
  } catch (_err) {
    throw new Error("Sessão Baileys não inicializada. Conecte a instância primeiro.");
  }

  const memStore = getInMemoryStore(whatsapp.id);

  // Mapa de contatos do store para obter nomes reais (notify/name)
  const storeContacts: Record<string, { name?: string; notify?: string }> = {};
  try {
    const contacts = (memStore as any)?.contacts || {};
    for (const [id, c] of Object.entries(contacts)) {
      storeContacts[id] = c as any;
    }
  } catch {}


  try {
    // Mesma regra do fluxo de mensagem ao vivo (wbotMessageListener.ts:
    // "if (!whatsapp.allowGroup && isGroup) return;") — sem essa conexão
    // ter "Permitir Grupos" habilitado, mensagem de grupo nem vira ticket
    // ao vivo. O import não respeitava isso: trazia grupo pra QUALQUER
    // conexão sempre que o operador escolhia período "todos"/"grupo" no
    // prompt, mesmo em conexões com grupo desabilitado — daí a mistura
    // reportada. Agora só busca/importa grupo se a conexão permitir.
    const groupsAllowedHere = !!whatsapp.allowGroup;
    let groups: any[] = [];
    if (messageType !== "individual" && groupsAllowedHere) {
      try {
        const groupsMetadata = await wbot.groupFetchAllParticipating();
        groups = Object.values(groupsMetadata || {});
      } catch (err: any) {
        logger.warn(`[ImportMessages] Erro ao buscar grupos Baileys: ${err.message}`);
      }
    } else if (messageType !== "individual" && !groupsAllowedHere) {
      logger.info(`[ImportMessages] Grupos desabilitados nesta conexão (allowGroup=false) — pulando importação de grupos para wpp ${whatsapp.id}`);
    }

    const existingContacts = await Contact.findAll({
      where: { companyId, whatsappId: whatsapp.id },
    });

    // contactJid = JID a usar pra buscar foto de perfil/nome do contato (pode
    // ser diferente de "jid" quando "jid" é um @lid: nesse caso contactJid é
    // a versão resolvida @s.whatsapp.net, mas "jid" ORIGINAL precisa ser
    // preservado porque é a chave usada no cache de mensagens do Baileys
    // (memStore.messages[jid]) e no pedido de sync sob-demanda.
    const chatTargets: Array<{ phone: string; name: string; isGroup: boolean; jid: string; contactJid: string }> = [];
    const seenJids = new Set<string>();

    if (messageType !== "group") {
      for (const contact of existingContacts) {
        if (!contact.isGroup && contact.number) {
          const jid = `${contact.number}@s.whatsapp.net`;
          if (seenJids.has(jid)) continue;
          seenJids.add(jid);
          chatTargets.push({
            phone: contact.number,
            name: contact.name,
            isGroup: false,
            jid,
            contactJid: jid,
          });
        }
      }
    }

    if (messageType !== "individual") {
      for (const group of groups) {
        const jid = group.id;
        if (!jid || seenJids.has(jid)) continue;
        seenJids.add(jid);
        chatTargets.push({
          phone: group.id?.replace("@g.us", "") || "",
          name: group.subject || "Grupo",
          isGroup: true,
          jid,
          contactJid: jid,
        });
      }
    }

    // Also add JIDs from store cache if available
    const storeMessages = (memStore as any)?.messages || {};
    for (const jid of Object.keys(storeMessages)) {
      const isGroup = jid.endsWith("@g.us");
      if (messageType === "group" && !isGroup) continue;
      if (messageType === "individual" && isGroup) continue;
      if (isGroup && !groupsAllowedHere) continue;
      if (seenJids.has(jid)) continue;

      // JIDs "@lid" não têm o número real embutido — resolver pro JID
      // "@s.whatsapp.net" real antes de extrair o "telefone", senão o
      // contato é salvo com os dígitos crus do LID como número (o bug
      // relatado: "traz o lid e não o número real do contato").
      const contactJid = !isGroup ? await resolveLidJidForImport(wbot, jid) : jid;
      let phone = contactJid.replace(/@(g\.us|s\.whatsapp\.net|lid)$/, "");
      // Remove o sufixo de dispositivo multi-device ("558198593719:0" —
      // o ":0" indica o aparelho, não faz parte do número). SEM isso,
      // CreateOrUpdateContactServiceForImport tira só os caracteres
      // não-numéricos do "phone" (rawNumber.replace(/[^0-9]/g, "")) e o
      // ":0" vira um "0" colado no final do número — um número DIFERENTE
      // do real, que podia coincidir por acaso com o de outro contato já
      // existente e sobrescrever o nome/foto dele (bug relatado: foto de
      // um contato aparecendo em outro). Mesma normalização que
      // verifyContact.ts já usa no fluxo de mensagem ao vivo
      // (jid.split("@")[0].split(":")[0]) — só que aqui faltava. Grupos
      // (@g.us) não carregam esse sufixo.
      if (!isGroup) phone = phone.split(":")[0];
      if (!phone || !/\d/.test(phone)) continue;

      seenJids.add(jid);
      // Tentar obter nome real do contato no store (tenta pelo JID original
      // e, se não achar, pelo JID resolvido — o store pode ter o contato
      // catalogado em qualquer um dos dois).
      const storeContact = storeContacts[jid] || storeContacts[contactJid];
      const realName = storeContact?.name || storeContact?.notify || phone;

      chatTargets.push({
        phone,
        name: realName,
        isGroup,
        jid,
        contactJid,
      });
    }

    result.totalChats = chatTargets.length;
    logger.info(`[ImportMessages] Baileys: ${chatTargets.length} chats para importar`);
    emitProgress(companyId, { stage: "scanning", detail: `${chatTargets.length} chats encontrados`, whatsappId: whatsapp.id, totalChats: chatTargets.length, processedChats: 0 });

    // Buffer pro sync de histórico sob-demanda (wbot.fetchMessageHistory): o Baileys
    // entrega a resposta de forma ASSÍNCRONA via o evento global "messaging-history.set"
    // (a chamada em si só retorna um id de confirmação, não as mensagens), então
    // precisamos escutar esse evento durante toda a importação e agrupar as mensagens
    // recebidas por conversa (remoteJid) pra consumir logo depois de cada pedido.
    const onDemandBuffer = new Map<string, any[]>();
    const onDemandListener = (messageSet: any) => {
      try {
        const msgs = messageSet?.messages || [];
        for (const m of msgs) {
          const jid = m?.key?.remoteJid;
          if (!jid) continue;
          if (!onDemandBuffer.has(jid)) onDemandBuffer.set(jid, []);
          onDemandBuffer.get(jid)!.push(m);
        }
      } catch {}
    };
    if (typeof (wbot as any)?.ev?.on === "function") {
      (wbot as any).ev.on("messaging-history.set", onDemandListener);
    }

    let processedChats = 0;
    try {
    for (const chatTarget of chatTargets) {
      if (isCancelled(companyId)) {
        emitProgress(companyId, { stage: "cancelled", detail: "Importação cancelada pelo usuário", whatsappId: whatsapp.id, totalChats: chatTargets.length, processedChats, totalMessages: result.totalMessages, totalTickets: result.totalTickets, totalContacts: result.totalContacts, errors: result.errors.length });
        break;
      }
      try {
        if (!chatTarget.phone) continue;

        let messages: any[] = [];

        // 1. Try store cache first (mensagens já vistas nesta sessão em memória)
        const storeChat = (memStore as any)?.messages?.[chatTarget.jid];
        if (storeChat?.array && Array.isArray(storeChat.array) && storeChat.array.length > 0) {
          messages = storeChat.array.slice(-100);
          logger.info(`[ImportMessages] Store cache: ${messages.length} msgs para ${chatTarget.jid}`);
        }

        // 1b. SEM NADA no cache em memória — o memStore do Baileys é volátil e
        // começa sempre vazio a cada reinício do processo backend (que
        // acontece em toda atualização do sistema), mesmo que a conversa já
        // tenha anos de histórico salvo no NOSSO banco de dados. Sem esse
        // fallback, TODO contato existente cai direto no "sem âncora,
        // pulando" logo abaixo depois de qualquer restart — na prática o
        // import nunca trazia nada pra ninguém que já tivesse conversado
        // antes do processo atual subir (o caso mais comum de longe). Usa a
        // mensagem mais antiga já salva no banco pra essa conversa como
        // âncora do pedido de histórico sob-demanda — mesmo princípio do
        // cache em memória, só que lendo de uma fonte que sobrevive a
        // reinícios.
        let dbAnchor: { key: any; timestamp: number } | null = null;
        if (messages.length === 0) {
          try {
            const anchorContact = await Contact.findOne({
              where: {
                companyId,
                whatsappId: whatsapp.id,
                isGroup: chatTarget.isGroup,
                number: chatTarget.phone,
              },
            });
            if (anchorContact) {
              const oldestDbMsg = await Message.findOne({
                where: { companyId, contactId: anchorContact.id },
                order: [["createdAt", "ASC"]],
              });
              if (oldestDbMsg?.wid) {
                dbAnchor = {
                  key: {
                    remoteJid: chatTarget.jid,
                    id: oldestDbMsg.wid,
                    fromMe: !!oldestDbMsg.fromMe,
                  },
                  timestamp: Math.floor(new Date(oldestDbMsg.createdAt).getTime() / 1000),
                };
                logger.info(`[ImportMessages] Sem cache em memória — usando mensagem mais antiga do banco (${oldestDbMsg.createdAt}) como âncora para ${chatTarget.jid}`);
              }
            }
          } catch (anchorErr: any) {
            logger.warn(`[ImportMessages] Falha ao buscar âncora no banco para ${chatTarget.jid}: ${anchorErr.message}`);
          }
        }

        // 2. Tentar estender pra trás usando o sync de histórico sob-demanda REAL do
        // Baileys (wbot.fetchMessageHistory). Isso só funciona quando já temos pelo
        // menos UMA mensagem dessa conversa (em cache ou no banco, ver 1b acima) pra
        // usar como "âncora" (oldestMsgKey/oldestMsgTimestamp) — é uma limitação do
        // próprio protocolo do WhatsApp: não dá pra puxar histórico do zero de uma
        // conversa que este dispositivo nunca viu, só estender uma que já existe, e
        // mesmo assim depende do celular titular estar online e ainda ter a mensagem
        // guardada. (Antes esta etapa chamava wbot.fetchMessagesFromWA, um método que
        // não existe na biblioteca Baileys — por isso sempre falhava e o botão não
        // trazia nada.)
        if (messages.length > 0 || dbAnchor) {
          try {
            const oldest = messages.length > 0
              ? [...messages].sort(
                  (a: any, b: any) => getMessageTimestamp(a) - getMessageTimestamp(b)
                )[0]
              : null;
            const anchorKey = oldest?.key || dbAnchor?.key;
            const anchorTimestamp = oldest ? getMessageTimestamp(oldest) : (dbAnchor?.timestamp || 0);
            if (anchorKey?.id && typeof (wbot as any).fetchMessageHistory === "function") {
              const beforeCount = onDemandBuffer.get(chatTarget.jid)?.length || 0;
              await (wbot as any).fetchMessageHistory(50, anchorKey, anchorTimestamp);
              await new Promise(resolve => setTimeout(resolve, 3500));
              const extra = onDemandBuffer.get(chatTarget.jid) || [];
              if (extra.length > beforeCount) {
                const seenIds = new Set(messages.map((m: any) => m.key?.id));
                for (const m of extra) {
                  if (m.key?.id && !seenIds.has(m.key.id)) {
                    messages.push(m);
                    seenIds.add(m.key.id);
                  }
                }
                logger.info(`[ImportMessages] Sync sob-demanda: +${extra.length - beforeCount} msgs mais antigas para ${chatTarget.jid}`);
              }
            }
          } catch (fetchErr: any) {
            logger.warn(`[ImportMessages] Sync sob-demanda falhou para ${chatTarget.jid}: ${fetchErr.message}`);
          }
        } else {
          logger.info(`[ImportMessages] Sem mensagem-âncora em cache nem no banco para ${chatTarget.jid} — WhatsApp não permite importar histórico do zero dessa conversa (limitação de protocolo). Pulando.`);
          continue;
        }

        const importableMessages = messages
          .filter((msg: any) => isImportableBaileysMessage(msg, startTimestamp, endTimestamp))
          .sort((a: any, b: any) => getMessageTimestamp(a) - getMessageTimestamp(b));

        if (importableMessages.length === 0) {
          logger.info(`[ImportMessages] Nenhuma msg importável no período para ${chatTarget.jid}`);
          continue;
        }

        logger.info(`[ImportMessages] ${importableMessages.length} msgs importáveis para ${chatTarget.jid}`);

        // Buscar nome real do store (pode ter sido adicionado após scan
        // inicial) — tenta pelo JID original e pelo JID resolvido (@lid vs
        // @s.whatsapp.net podem estar catalogados separadamente no store).
        const storeC = storeContacts[chatTarget.jid] || storeContacts[chatTarget.contactJid];
        const contactName = storeC?.name || storeC?.notify || chatTarget.name;

        // Buscar foto de perfil do contato via WhatsApp — usa o JID
        // RESOLVIDO (contactJid): pedir foto por um JID "@lid" cru
        // costuma falhar/retornar nada, já que a API de perfil espera o
        // JID real (@s.whatsapp.net) do contato.
        let profilePicUrl = "";
        try {
          profilePicUrl = await wbot.profilePictureUrl(chatTarget.contactJid, "image");
        } catch {
          // Contato pode ter foto privada ou não ter foto
        }

        const contact = await CreateOrUpdateContactServiceForImport({
          name: contactName,
          number: chatTarget.phone,
          profilePicUrl: profilePicUrl || undefined,
          isGroup: chatTarget.isGroup,
          companyId,
          whatsappId: whatsapp.id,
        });
        result.totalContacts++;

        const ticket = await createTicketWithMessages({
          contactId: contact.id,
          companyId,
          whatsappId: whatsapp.id,
          isGroup: chatTarget.isGroup,
          userId,
          ticketStatus,
          queueId,
          messages: importableMessages,
          result,
        });

        io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket: await reloadTicketForEmit(ticket)
        });

        processedChats++;
        emitProgress(companyId, {
          stage: "importing",
          detail: `Chat "${chatTarget.name}" - ${importableMessages.length} msgs importadas`,
          whatsappId: whatsapp.id,
          totalChats: chatTargets.length,
          processedChats,
          totalMessages: result.totalMessages,
          totalTickets: result.totalTickets,
          totalContacts: result.totalContacts,
          errors: result.errors.length,
        });
      } catch (chatErr: any) {
        processedChats++;
        result.errors.push(`Erro chat ${chatTarget.phone}: ${chatErr.message}`);
      }
    }
    } finally {
      if (typeof (wbot as any)?.ev?.off === "function") {
        (wbot as any).ev.off("messaging-history.set", onDemandListener);
      } else if (typeof (wbot as any)?.ev?.removeListener === "function") {
        (wbot as any).ev.removeListener("messaging-history.set", onDemandListener);
      }
    }
  } catch (err: any) {
    logger.error(`[ImportMessages] Erro Baileys: ${err.message}`);
    throw err;
  }

  return result;
};

const ImportMessagesService = async ({
  whatsappId,
  companyId,
  userId,
  startDate,
  endDate,
  messageType,
  ticketStatus,
  queueId,
}: ImportMessagesRequest): Promise<ImportResult> => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);

  if (!whatsapp) {
    throw new Error("Conexão não encontrada.");
  }

  if (whatsapp.status !== "CONNECTED") {
    throw new Error("A conexão precisa estar conectada para importar mensagens.");
  }

  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(`${endDate}T23:59:59`).getTime() / 1000);

  const isZApi = !!(whatsapp.zapiInstanceId && whatsapp.zapiToken && whatsapp.zapiClientToken);

  // Clear any previous cancellation
  cancelledImports.delete(companyId);

  logger.info(`[ImportMessages] Iniciando importação via ${isZApi ? "Z-API" : "Baileys"} - conexão ${whatsapp.name} (${whatsapp.id})`);
  emitProgress(companyId, { stage: "starting", detail: `Iniciando importação via ${isZApi ? "Z-API" : "Baileys"}...`, whatsappId: whatsapp.id });

  let result: ImportResult;
  try {
    result = isZApi
      ? await importFromZApi(whatsapp, companyId, userId, startTimestamp, endTimestamp, messageType, ticketStatus, queueId)
      : await importFromBaileys(whatsapp, companyId, userId, startTimestamp, endTimestamp, messageType, ticketStatus, queueId);
  } catch (err: any) {
    // Antes, um erro aqui (ex.: sessão Baileys caiu no meio do import) só
    // aparecia no log do backend — agora que o controller não espera mais
    // o request HTTP terminar (ver WhatsAppController.importMessages), o
    // frontend nunca mais saberia que o import parou, e o card ficava preso
    // em "Importando mensagens..." pra sempre. Emite o estágio "error" pro
    // mesmo canal de progresso pra liberar o botão e avisar o usuário.
    cancelledImports.delete(companyId);
    emitProgress(companyId, {
      stage: "error",
      detail: err?.message || "Falha ao importar mensagens.",
      whatsappId: whatsapp.id,
    });
    throw err;
  }

  const wasCancelled = isCancelled(companyId);
  cancelledImports.delete(companyId);

  logger.info(`[ImportMessages] ${wasCancelled ? "Cancelado" : "Concluído"}: ${result.totalMessages} msgs, ${result.totalTickets} tickets, ${result.totalContacts} contatos, ${result.errors.length} erros`);

  if (!wasCancelled) {
    emitProgress(companyId, {
      stage: "done",
      detail: "Importação concluída!",
      whatsappId: whatsapp.id,
      totalChats: result.totalChats,
      processedChats: result.totalChats,
      totalMessages: result.totalMessages,
      totalTickets: result.totalTickets,
      totalContacts: result.totalContacts,
      errors: result.errors.length,
    });
  }

  return result;
};

export default ImportMessagesService;
