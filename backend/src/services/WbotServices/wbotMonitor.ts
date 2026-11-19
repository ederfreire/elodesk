import {
  WASocket,
  BinaryNode,
  Contact as BContact,
  isJidBroadcast,
  isJidStatusBroadcast,
  proto,
  extractMessageContent,
  getContentType,
} from "@whiskeysockets/baileys";
import { handleLabelsEdit, handleLabelsAssociation } from "../TagServices/WhatsAppLabelSyncService";
import * as Sentry from "@sentry/node";
import fs from "fs";
import { extractMappingsFromContacts, addLidPnMapping, resolvePN, loadFromBaileysLidMapping } from "../../utils/LidPnCache";

import { Op } from "sequelize";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import logger from "../../utils/logger";
import createOrUpdateBaileysService from "../BaileysServices/CreateOrUpdateBaileysService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import CompaniesSettings from "../../models/CompaniesSettings";
import path from "path";
import { verifyMessage, getBodyMessage, getTypeMessage } from "./wbotMessageListener";

// Serializa gravações concorrentes de contactJson-wpp{id}.txt por conexão.
// Baileys dispara "contacts.upsert" em rajada (um evento por lote pequeno de
// contatos, às vezes dezenas em poucos segundos logo após o pareamento/sync
// de histórico) — cada disparo chamava saveContactsToFileAndDB de forma
// concorrente, e todas as chamadas escreviam no MESMO "<arquivo>.tmp" antes
// de renomear. Duas chamadas concorrentes faziam a segunda sobrescrever o
// .tmp da primeira; quando a primeira tentava o rename, o arquivo dela já
// tinha sido substituído/consumido pela outra — "ENOENT: no such file or
// directory, rename ...contactJson-wppN.txt.tmp -> ...txt" repetido
// centenas de vezes no log. Além do erro, isso também perdia atualizações
// (a leitura-modificação-escrita de existingContacts não era atômica entre
// chamadas concorrentes). Uma fila por whatsappId resolve as duas coisas.
const contactsFileLocks = new Map<number, Promise<any>>();
const withContactsFileLock = async <T>(whatsappId: number, fn: () => Promise<T>): Promise<T> => {
  const prev = contactsFileLocks.get(whatsappId) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  contactsFileLocks.set(whatsappId, run);
  try {
    return await run;
  } finally {
    if (contactsFileLocks.get(whatsappId) === run) {
      contactsFileLocks.delete(whatsappId);
    }
  }
};

// Rate limiter para callbacks de chamada
let callCounter = 0;
let callCounterResetTimer: ReturnType<typeof setInterval> | null = null;

const ensureCallCounterTimer = () => {
  if (!callCounterResetTimer) {
    callCounterResetTimer = setInterval(() => {
      callCounter = 0;
    }, 5000);
  }
};

// Limpar timer ao descarregar módulo
const cleanupCallTimer = () => {
  if (callCounterResetTimer) {
    clearInterval(callCounterResetTimer);
    callCounterResetTimer = null;
  }
};
process.once('SIGTERM', cleanupCallTimer);
process.once('SIGINT', cleanupCallTimer);

ensureCallCounterTimer();

type Session = WASocket & {
  id?: number;
};

interface IContact {
  contacts: BContact[];
}

const wbotMonitor = async (
  wbot: Session,
  whatsapp: Whatsapp,
  companyId: number
): Promise<void> => {
  try {
    // ✅ Carregar mapeamentos do lid-mapping NATIVO do Baileys (armazenado na sessão)
    try {
      if (whatsapp.session) {
        const sessionData = JSON.parse(whatsapp.session, (await import("@whiskeysockets/baileys")).BufferJSON.reviver);
        if (sessionData?.keys?.lidMapping) {
          loadFromBaileysLidMapping(sessionData.keys.lidMapping);
          logger.info(`[LID-CACHE] ✅ lid-mapping nativo carregado da sessão do WhatsApp ${whatsapp.id}`);
        }
      }
    } catch (e) {
      logger.warn(`[LID-CACHE] Erro ao carregar lid-mapping da sessão: ${e.message}`);
    }

    // ✅ Carregar mapeamentos LID→PN do banco para o cache em memória
    try {
      const existingMaps = await WhatsappLidMap.findAll({
        where: { companyId },
        include: [{ model: Contact, as: "contact" }]
      });
      for (const map of existingMaps) {
        if (map.contact?.number && map.lid) {
          addLidPnMapping(map.lid, map.contact.number);
        }
      }
      if (existingMaps.length > 0) {
        logger.info(`[LID-CACHE] ✅ Carregados ${existingMaps.length} mapeamentos LID→PN do banco para cache`);
      }
    } catch (e) {
      logger.warn(`[LID-CACHE] Erro ao carregar mapeamentos do banco: ${e.message}`);
    }

    wbot.ws.on("CB:call", async (node: BinaryNode) => {
      const content = node.content[0] as any;

      await new Promise(r => setTimeout(r, callCounter * 650));
      callCounter++;

      if (content.tag === "terminate" && !node.attrs.from.includes('@call')) {
        const settings = await CompaniesSettings.findOne({
          where: { companyId },
        });

        if (!settings) return;

        // ✅ FIX LID: Extrair caller_pn dos attrs do content (fonte mais confiável)
        let callFrom = node.attrs.from;
        const rawNumber = callFrom.split(":")[0].replace(/\D/g, "");
        let resolvedNumber = rawNumber;

        // 1️⃣ PRIORIDADE: caller_pn ou peer_recipient_pn dos attrs do content
        const callerPn = content?.attrs?.['caller_pn'] || content?.attrs?.['peer_recipient_pn'] || null;
        if (callerPn) {
          const pnNumber = callerPn.split('@')[0].split(':')[0].replace(/\D/g, '');
          if (pnNumber && pnNumber.length >= 8 && pnNumber.length <= 14) {
            resolvedNumber = pnNumber;
            callFrom = `${pnNumber}@s.whatsapp.net`;
            logger.info(`[CALL-LID-FIX] ✅ Número real via caller_pn: ${rawNumber} -> ${resolvedNumber}`);
          }
        }

        // 1.5️⃣ Tentar cache global LID→PN
        if (resolvedNumber === rawNumber && rawNumber.length >= 15) {
          const cachedPn = resolvePN(rawNumber);
          if (cachedPn) {
            resolvedNumber = cachedPn;
            callFrom = `${cachedPn}@s.whatsapp.net`;
            logger.info(`[CALL-LID-FIX] ✅ Número real via LID cache: ${rawNumber} -> ${resolvedNumber}`);
          }
        }

        // 2️⃣ Se ainda parece LID, tentar getPNForLID
        if (resolvedNumber === rawNumber && rawNumber.length >= 15) {
          try {
            const pn = await (wbot as any).signalRepository?.lidMapping?.getPNForLID?.(`${rawNumber}@lid`);
            if (pn) {
              const pnNum = pn.split('@')[0].split(':')[0].replace(/\D/g, '');
              if (pnNum && pnNum.length >= 8 && pnNum.length <= 14) {
                resolvedNumber = pnNum;
                callFrom = `${pnNum}@s.whatsapp.net`;
                logger.info(`[CALL-LID-FIX] ✅ Número real via getPNForLID: ${rawNumber} -> ${resolvedNumber}`);
              }
            }
          } catch (e) {
            logger.warn(`[CALL-LID-FIX] getPNForLID falhou: ${e.message}`);
          }
        }

        // 3️⃣ Fallback: onWhatsApp
        if (resolvedNumber === rawNumber && rawNumber.length >= 15) {
          try {
            const ow = await wbot.onWhatsApp(callFrom);
            if (ow?.[0]?.exists && ow?.[0]?.jid) {
              const realNum = String(ow[0].jid).split('@')[0];
              if (realNum && realNum.length < 15) {
                resolvedNumber = realNum;
                callFrom = ow[0].jid;
                logger.info(`[CALL-LID-FIX] ✅ Número real via onWhatsApp: ${rawNumber} -> ${resolvedNumber}`);
              }
            }
          } catch (e) {
            logger.warn(`[CALL-LID-FIX] onWhatsApp falhou: ${e.message}`);
          }
        }

        // 4️⃣ Fallback: WhatsappLidMap e tabela Contact
        if (resolvedNumber === rawNumber && rawNumber.length >= 15) {
          const lidVariants = [
            `${rawNumber}@lid`,
            rawNumber,
            `${rawNumber}@s.whatsapp.net`
          ];
          const mappedContact = await WhatsappLidMap.findOne({
            where: {
              companyId,
              lid: { [Op.in]: lidVariants }
            },
            include: [{ model: Contact, as: "contact" }]
          });

          if (mappedContact?.contact) {
            resolvedNumber = mappedContact.contact.number;
            callFrom = `${mappedContact.contact.number}@s.whatsapp.net`;
            logger.info(`[CALL-LID-FIX] ✅ Contato via WhatsappLidMap: ${rawNumber} -> ${resolvedNumber}`);
          } else {
            const lidContact = await Contact.findOne({
              where: {
                companyId,
                [Op.or]: [
                  { lid: `${rawNumber}@lid` },
                  { lid: rawNumber },
                  { lid: `${rawNumber}@s.whatsapp.net` },
                  { remoteJid: `${rawNumber}@s.whatsapp.net` }
                ]
              }
            });
            if (lidContact) {
              resolvedNumber = lidContact.number;
              callFrom = `${lidContact.number}@s.whatsapp.net`;
              logger.info(`[CALL-LID-FIX] ✅ Contato via LID no banco: ${rawNumber} -> ${resolvedNumber}`);
            }
          }
        }

        if (settings.acceptCallWhatsapp === "enabled") {
          const sentMessage = await wbot.sendMessage(callFrom, {
            text:
              `\u200e ${settings.AcceptCallWhatsappMessage}`,
          });
          const number = resolvedNumber;

          // Busca expandida: por número, lid ou remoteJid
          let contact = await Contact.findOne({
            where: { companyId, number },
          });

          // Se não encontrou pelo número, tentar pelo LID original
          if (!contact && rawNumber !== resolvedNumber) {
            contact = await Contact.findOne({
              where: {
                companyId,
                [Op.or]: [
                  { lid: `${rawNumber}@lid` },
                  { lid: rawNumber },
                  { number: rawNumber }
                ]
              }
            });
          }

          if (!contact)
            return

          const [ticket] = await Ticket.findOrCreate({
            where: {
              contactId: contact.id,
              whatsappId: wbot.id,
              status: ["open", "pending", "nps", "lgpd"],
              companyId
            },
            defaults: {
              companyId,
              contactId: contact.id,
              whatsappId: wbot.id,
              isGroup: contact.isGroup,
              status: contact.isGroup ? "group" : "pending"
            }
          });

          //se não existir o ticket não faz nada.
          if (!ticket) return;

          await verifyMessage(sentMessage, ticket, contact);

          const date = new Date();
          const hours = date.getHours();
          const minutes = date.getMinutes();

          const body = `Chamada de voz/vídeo perdida às ${hours}:${minutes}`;
          const messageData = {
            wid: content.attrs["call-id"],
            ticketId: ticket.id,
            contactId: contact.id,
            body,
            fromMe: false,
            mediaType: "call_log",
            read: true,
            quotedMsgId: null,
            ack: 1,
          };

          await ticket.update({
            lastMessage: body,
          });


          if (ticket.status === "closed") {
            await ticket.update({
              status: ticket.isGroup ? "group" : "pending",
            });
          }

          return CreateMessageService({ messageData, companyId: companyId });
        }
      }
    });

    // Flag para evitar escritas concorrentes no arquivo
    let isWritingContactFile = false;

    function cleanStringForJSON(str: string) {
      // Remove apenas caracteres de controle (preserva aspas pois JSON.stringify cuida do escape)
      return str.replace(/[\x00-\x1F\x7F]/g, "");
    }

    // Função auxiliar para salvar contatos no arquivo e Baileys DB
    const saveContactsToFileAndDB = async (filteredContacts: any[], source: string) => {
      if (filteredContacts.length === 0) return;

      // Fila por conexão: evita a corrida entre chamadas concorrentes (ver
      // comentário de contactsFileLocks no topo do arquivo) que escreviam
      // por cima do mesmo .tmp e faziam o rename de uma chamada falhar com
      // ENOENT porque outra já tinha consumido o arquivo.
      await withContactsFileLock(whatsapp.id, async () => {
        // Salvar no arquivo
        const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
        const companyFolder = path.join(publicFolder, `company${companyId}`);
        if (!fs.existsSync(companyFolder)) {
          fs.mkdirSync(companyFolder, { recursive: true });
          fs.chmodSync(companyFolder, 0o777);
        }
        const contatcJson = path.join(companyFolder, `contactJson-wpp${whatsapp.id}.txt`);

        // Merge com existentes
        let existingContacts: any[] = [];
        if (fs.existsSync(contatcJson)) {
          try {
            const content = await fs.promises.readFile(contatcJson, 'utf-8');
            existingContacts = JSON.parse(content);
            if (!Array.isArray(existingContacts)) existingContacts = [];
          } catch { existingContacts = []; }
        }

        // Índice por id em vez de findIndex dentro do laço.
        //
        // O findIndex percorre a lista inteira A CADA contato recebido: com
        // 40 mil contatos salvos e um lote de 500, são 20 milhões de
        // comparações — tudo na thread principal do Node, que fica travada e
        // não responde a mais nada enquanto isso. Somado ao JSON.parse e ao
        // JSON.stringify do arquivo inteiro, é o suficiente para a CPU ir a
        // 100%, o sistema parar e voltar quando termina.
        //
        // Com o Map o custo passa a ser proporcional ao total, não ao produto.
        const porId = new Map<string, number>();
        existingContacts.forEach((c, i) => {
          if (c && c.id) porId.set(c.id, i);
        });

        let houveMudanca = false;

        for (const newContact of filteredContacts) {
          const idx = porId.get(newContact.id);

          if (idx === undefined) {
            porId.set(newContact.id, existingContacts.length);
            existingContacts.push(newContact);
            houveMudanca = true;
            continue;
          }

          // Reescrever o arquivo inteiro para gravar exatamente o que já
          // estava lá é o pior dos dois mundos: custa o disco todo e não muda
          // nada. Os eventos de contato do Baileys repetem bastante.
          const atual = existingContacts[idx];
          if (
            atual.name !== newContact.name ||
            atual.lid !== newContact.lid
          ) {
            existingContacts[idx] = newContact;
            houveMudanca = true;
          }
        }

        if (!houveMudanca) {
          logger.info(
            `[${source}] Nenhuma mudança real em ${filteredContacts.length} contato(s) do wpp ${whatsapp.id} — arquivo não reescrito`
          );
          return;
        }

        const tempFile = `${contatcJson}.tmp`;
        await fs.promises.writeFile(tempFile, JSON.stringify(existingContacts), 'utf-8');
        await fs.promises.rename(tempFile, contatcJson);
        logger.info(`[${source}] ✅ Arquivo salvo: ${existingContacts.length} contatos totais (${filteredContacts.length} novos/atualizados) para wpp ${whatsapp.id}`);
      });

      // Salvar no Baileys DB (fora do lock de arquivo — createOrUpdateBaileysService
      // já lida com sua própria concorrência via upsert no banco).
      try {
        await createOrUpdateBaileysService({
          whatsappId: whatsapp.id,
          contacts: filteredContacts,
        });
        logger.info(`[${source}] ✅ Baileys DB atualizado com ${filteredContacts.length} contatos`);
      } catch (err) {
        logger.error(`[${source}] Erro ao salvar no Baileys DB: ${err.message}`);
      }
    };

    // Função auxiliar para filtrar contatos válidos
    const filterValidContacts = (contacts: any[]): any[] => {
      const filtered: any[] = [];
      for (const contact of contacts) {
        const id = contact.id || "";
        if (!id || isJidBroadcast(id) || isJidStatusBroadcast(id) || id.includes("@g.us") || id.includes("@newsletter")) continue;
        filtered.push({
          id,
          name: contact.name ? cleanStringForJSON(contact.name) : id.split('@')[0].split(':')[0],
          lid: contact.lid || undefined // ✅ Preservar LID para cache
        });
      }
      // ✅ Extrair mapeamentos LID↔PN dos contatos para o cache global
      extractMappingsFromContacts(contacts);
      return filtered;
    };

    // ✅ Baileys v7: messaging-history.set é o evento PRINCIPAL para sync inicial
    // ✅ messaging-history.set: APENAS salvar contatos e chats (sem processar mensagens históricas)
    // O processamento de mensagens históricas foi REMOVIDO pois causava picos de CPU
    // com N+1 queries ao banco (Message.findOne + Contact.findOne + Ticket.findOne por msg)
    wbot.ev.on("messaging-history.set" as any, async (data: any) => {
      try {
        const contacts = data?.contacts || [];
        const chats = data?.chats || [];

        const messages = data?.messages || [];
        logger.info(
          `[HISTORY SET] Evento recebido para wpp ${whatsapp.id} — ` +
          `contatos: ${contacts.length}, chats: ${chats.length}, mensagens: ${messages.length} (mensagens tratadas pelo import handler em wbot.ts)`
        );

        // Salvar contatos
        if (contacts.length > 0) {
          const filtered = filterValidContacts(contacts);
          if (filtered.length > 0) {
            await saveContactsToFileAndDB(filtered, "HISTORY SET");
          }
        }

        // Salvar chats no Baileys DB
        if (chats.length > 0) {
          try {
            await createOrUpdateBaileysService({
              whatsappId: whatsapp.id,
              chats: chats.map((c: any) => ({ id: c.id, name: c.name || c.id })),
            });
            logger.info(`[HISTORY SET] ✅ ${chats.length} chats salvos no Baileys DB`);
          } catch (chatErr) {
            logger.error(`[HISTORY SET] Erro ao salvar chats: ${chatErr.message}`);
          }
        }
      } catch (err) {
        logger.error(`[HISTORY SET] Erro: ${err.message}`);
        Sentry.captureException(err);
      }
    });

    // ✅ Baileys v7: contacts.set pode trazer snapshot inicial em alguns dispositivos
    wbot.ev.on("contacts.set" as any, async (payload: any) => {
      try {
        const contacts = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.contacts)
            ? payload.contacts
            : [];

        if (contacts.length === 0) {
          logger.info(`[CONTACTS SET] Evento recebido sem contatos para wpp ${whatsapp.id}`);
          return;
        }

        logger.info(`[CONTACTS SET] Recebidos ${contacts.length} contatos para wpp ${whatsapp.id}`);
        const filtered = filterValidContacts(contacts);
        if (filtered.length > 0) {
          await saveContactsToFileAndDB(filtered, "CONTACTS SET");
        }
      } catch (err) {
        logger.error(`[CONTACTS SET] Erro: ${err.message}`);
        Sentry.captureException(err);
      }
    });

    // ✅ Baileys v7: contacts.upsert para contatos adicionados depois do sync inicial
    wbot.ev.on("contacts.upsert", async (contacts: BContact[]) => {
      try {
        const filtered = filterValidContacts(contacts);
        if (filtered.length === 0) {
          logger.info(`[CONTACTS UPSERT] Nenhum contato válido para salvar`);
          return;
        }
        await saveContactsToFileAndDB(filtered, "CONTACTS UPSERT");
      } catch (err) {
        Sentry.captureException(err);
        logger.error(`Erro contacts.upsert: ${err.message}`);
      }
    });

    // ✅ Baileys v7: contacts.update para alterações de contatos existentes
    wbot.ev.on("contacts.update" as any, async (updates: any[]) => {
      try {
        if (!updates || updates.length === 0) return;
        const filtered = filterValidContacts(updates);
        if (filtered.length > 0) {
          await saveContactsToFileAndDB(filtered, "CONTACTS UPDATE");
        }
      } catch (err) {
        logger.error(`Erro contacts.update: ${err.message}`);
      }
    });

    // ========== LISTENERS DE LABELS DO WHATSAPP ==========

    // Evento: labels editadas (criadas, renomeadas, deletadas)
    wbot.ev.on("labels.edit" as any, async (labels: any) => {
      try {
        logger.info(`[LABEL SYNC] Evento labels.edit recebido (conexão ${whatsapp.id}): ${JSON.stringify(labels)}`);
        const labelsArray = Array.isArray(labels) ? labels : [labels];
        await handleLabelsEdit(companyId, labelsArray);
      } catch (err) {
        logger.error(`[LABEL SYNC] Erro no listener labels.edit: ${err.message}`);
      }
    });

    // Evento: labels associadas/desassociadas a chats
    wbot.ev.on("labels.association" as any, async (data: any) => {
      try {
        logger.info(`[LABEL SYNC] Evento labels.association recebido (conexão ${whatsapp.id}): ${JSON.stringify(data)}`);
        await handleLabelsAssociation(companyId, whatsapp.id, data);
      } catch (err) {
        logger.error(`[LABEL SYNC] Erro no listener labels.association: ${err.message}`);
      }
    });

    logger.info(`[LABEL SYNC] Listeners de labels registrados para conexão ${whatsapp.id}`);

  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }
};

export default wbotMonitor;