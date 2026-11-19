import { Mutex } from "async-mutex";
import { Op } from "sequelize";
import Contact from "../../models/Contact";
import CreateOrUpdateContactService, {
  updateContact
} from "../ContactServices/CreateOrUpdateContactService";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import * as queues from "../../queues";
import logger from "../../utils/logger";
import { IMe } from "./wbotMessageListener";
import { Session } from "../../libs/wbot";
import { SimpleObjectCache } from "../../utils/SimpleObjectCache";
import { resolvePN } from "../../utils/LidPnCache";

const lidUpdateMutex = new Mutex();
const profilePicCache = new SimpleObjectCache<string>(1800);

/**
 * Verifica se um valor parece ser um LID (não é um número de telefone real).
 * Números reais de telefone têm no máximo 13 dígitos (ex: 5521964238808).
 * LIDs têm 15+ dígitos. 14 dígitos é ambíguo, tratamos como suspeito.
 */
function isLidValue(value: string): boolean {
  if (!value) return false;
  const clean = value.replace(/\D/g, "");
  return clean.length >= 14 || value.includes("@lid");
}

/**
 * Busca contato por correspondência parcial de número (últimos 8-9 dígitos).
 * Resolve duplicatas causadas por variações de formato (com/sem 9o dígito, sufixo de device, etc.)
 */
async function findContactByPartialNumber(
  companyId: number,
  number: string
): Promise<Contact | null> {
  if (!number || number.length < 8) return null;
  const clean = number.replace(/\D/g, "");
  // Últimos 8 e 9 dígitos para matching parcial
  const last8 = clean.slice(-8);
  const last9 = clean.slice(-9);

  const contacts = await Contact.findAll({
    where: {
      companyId,
      isGroup: false,
      [Op.or]: [
        { number: { [Op.like]: `%${last9}` } },
        { number: { [Op.like]: `%${last8}` } }
      ]
    }
  });

  if (contacts.length === 1) {
    return contacts[0];
  }

  // Se múltiplos resultados, preferir o que tem número real (não LID)
  if (contacts.length > 1) {
    const realContact = contacts.find(c => c.number && c.number.length <= 13 && c.number.length >= 10);
    if (realContact) return realContact;
    return contacts[0];
  }

  return null;
}

/**
 * Extrai o número limpo de um JID (remove @s.whatsapp.net, @lid, etc.)
 */
function extractNumber(jid: string): string {
  if (!jid) return "";
  return jid.split("@")[0].split(":")[0];
}

/**
 * Merge duplicatas: transfere mensagens, tickets e mapeamentos LID para o contato principal.
 */
export async function mergeContacts(
  primary: Contact,
  duplicate: Contact
): Promise<void> {
  logger.info(
    `[LID-MERGE] Mergeando contato ${duplicate.id} (number=${duplicate.number}) → ${primary.id} (number=${primary.number})`
  );

  await Message.update(
    { contactId: primary.id },
    { where: { contactId: duplicate.id, companyId: primary.companyId } }
  );

  await Ticket.update(
    { contactId: primary.id },
    { where: { contactId: duplicate.id, companyId: primary.companyId } }
  );

  // WhatsappLidMap tem unique (lid, companyId) — um UPDATE em massa
  // trocando contactId do duplicado pro primary quebrava com
  // SequelizeUniqueConstraintError sempre que o duplicado já tinha um
  // mapeamento pro MESMO lid que o primary também já possuía (o caso mais
  // comum: os dois contatos vieram originalmente do mesmo LID, em
  // momentos diferentes). Isso derrubava o merge NO MEIO do caminho —
  // Message/Ticket já migrados, mas o duplicado nunca chegava a ser
  // destruído (nem o log de sucesso abaixo aparecia) — e a MESMA mensagem
  // voltava a falhar pra sempre na próxima tentativa, porque o contato
  // duplicado continuava existindo pra colidir de novo. Trata linha por
  // linha: se o primary já tem aquele lid, descarta a linha duplicada em
  // vez de tentar duplicar; senão, migra normalmente.
  const primaryLidRows = await WhatsappLidMap.findAll({
    where: { contactId: primary.id, companyId: primary.companyId },
    attributes: ["lid"]
  });
  const primaryLids = new Set(primaryLidRows.map(row => row.lid));

  const duplicateLidRows = await WhatsappLidMap.findAll({
    where: { contactId: duplicate.id, companyId: primary.companyId }
  });
  for (const row of duplicateLidRows) {
    if (primaryLids.has(row.lid)) {
      await row.destroy();
    } else {
      await row.update({ contactId: primary.id });
    }
  }

  if (!primary.lid && duplicate.lid) {
    await primary.update({ lid: duplicate.lid });
  }

  await duplicate.destroy();
  logger.info(`[LID-MERGE] ✅ Contato duplicado ${duplicate.id} removido`);
}

/**
 * Busca foto de perfil com cache.
 */
async function getProfilePic(
  wbot: Session,
  jid: string
): Promise<string> {
  const cacheKey = `pic:${jid}`;
  const cached = profilePicCache.get(cacheKey);
  if (cached) return cached;

  try {
    const url = await wbot.profilePictureUrl(jid, "image");
    if (url) {
      profilePicCache.set(cacheKey, url);
      return url;
    }
  } catch (e) {}

  return `${process.env.FRONTEND_URL}/nopicture.png`;
}

/**
 * Tenta resolver o número real de um LID usando os recursos disponíveis.
 * Hierarquia: senderPn → wbot.onWhatsApp
 */
async function resolveRealNumber(
  lidJid: string,
  msgContact: IMe,
  wbot: Session
): Promise<string | null> {
  const lidNum = extractNumber(lidJid);

  // 0. Cache LID↔PN (fonte mais rápida e confiável)
  const cachedPN = resolvePN(lidNum);
  if (cachedPN && !isLidValue(cachedPN)) {
    logger.info(`[LID-RESOLVE] Número real via LidPnCache: ${cachedPN}`);
    return cachedPN;
  }

  // 1. senderPn (metadado da mensagem)
  if (msgContact.senderPn) {
    const pn = extractNumber(msgContact.senderPn);
    if (pn && !isLidValue(pn)) {
      logger.info(`[LID-RESOLVE] Número real via senderPn: ${pn}`);
      return pn;
    }
  }

  // 2. onWhatsApp (API do Baileys)
  if (wbot) {
    try {
      const result = await wbot.onWhatsApp(lidJid);
      if (result?.[0]?.exists && result?.[0]?.jid) {
        const num = extractNumber(result[0].jid);
        if (num && !isLidValue(num)) {
          logger.info(`[LID-RESOLVE] Número real via onWhatsApp: ${num}`);
          return num;
        }
      }
    } catch (e) {
      logger.warn(`[LID-RESOLVE] onWhatsApp falhou: ${e.message}`);
    }
  }

  return null;
}

/**
 * Busca e merge contatos duplicados com LID para o mesmo contato real.
 * Quando um contato tem número real, verifica se existem outros contatos com:
 * - O mesmo LID apontando para outro contato
 * - Número que é um LID (14+ dígitos) e que mapeia para este contato via WhatsappLidMap
 */
async function mergeDuplicateLidContacts(
  primary: Contact,
  companyId: number
): Promise<void> {
  try {
    if (!primary.number || primary.number.length < 8) return;

    const orConditions: any[] = [];

    // 1. Buscar contatos que têm o LID do primário como número
    if (primary.lid) {
      const lidNum = extractNumber(primary.lid);
      if (lidNum) {
        orConditions.push(
          { number: lidNum },
          { remoteJid: primary.lid },
          { remoteJid: `${lidNum}@lid` }
        );
      }
    }

    // 2. Buscar via WhatsappLidMap: contatos mapeados ao mesmo LID mas com ID diferente
    if (primary.lid) {
      const lidVariants = [primary.lid, `${extractNumber(primary.lid)}@lid`, extractNumber(primary.lid)].filter(Boolean);
      const mappings = await WhatsappLidMap.findAll({
        where: {
          companyId,
          lid: { [Op.in]: lidVariants },
          contactId: { [Op.ne]: primary.id }
        },
        include: [{ model: Contact, as: "contact" }]
      });

      for (const mapping of mappings) {
        if (mapping.contact && mapping.contact.id !== primary.id) {
          logger.info(`[LID-AUTO-MERGE] Encontrado duplicata via LidMap: ${mapping.contact.id} (${mapping.contact.number})`);
          await mergeContacts(primary, mapping.contact);
        }
      }
    }

    // 3. Buscar contatos duplicados por condições diretas
    if (orConditions.length > 0) {
      const duplicates = await Contact.findAll({
        where: {
          companyId,
          id: { [Op.ne]: primary.id },
          isGroup: false,
          [Op.or]: orConditions
        }
      });

      for (const dup of duplicates) {
        // Só fazer merge se o duplicata tem número LID (14+ dígitos) ou remoteJid @lid
        const dupNumberIsLid = isLidValue(dup.number);
        const dupJidIsLid = dup.remoteJid?.includes("@lid");
        if (dupNumberIsLid || dupJidIsLid) {
          logger.info(`[LID-AUTO-MERGE] Mergeando contato LID duplicado: ${dup.id} (${dup.number}) → ${primary.id} (${primary.number})`);
          await mergeContacts(primary, dup);
        }
      }
    }
  } catch (error) {
    logger.error(`[LID-AUTO-MERGE] Erro ao buscar/mesclar duplicatas: ${error.message}`);
  }
}

/**
 * Fluxo principal de verificação/criação de contato.
 *
 * JID (@s.whatsapp.net) → extrai número → busca/cria Contact
 * LID (@lid)            → consulta WhatsappLidMap → encontra Contact existente
 *                                                 → ou cria novo com número resolvido
 */
export async function verifyContact(
  msgContact: IMe,
  wbot: Session,
  companyId: number
): Promise<Contact> {
  const isGroup = msgContact.id.includes("@g.us");
  const isLid = msgContact.id.includes("@lid");
  const rawNumber = extractNumber(msgContact.id);
  const lidValue = isLid ? msgContact.id : (msgContact.lid || null);

  // ── Grupo: tratamento direto ──
  if (isGroup) {
    const profilePicUrl = await getProfilePic(wbot, msgContact.id);
    return CreateOrUpdateContactService({
      name: msgContact.name || msgContact.notify || rawNumber,
      number: rawNumber,
      profilePicUrl,
      isGroup: true,
      companyId,
      whatsappId: wbot?.id || undefined,
      wbot
    });
  }

  // ── Foto de perfil (para JID real ou LID resolvido) ──
  let picJid = msgContact.id;
  if (isLid && msgContact.senderPn) {
    picJid = msgContact.senderPn.includes("@")
      ? msgContact.senderPn
      : `${msgContact.senderPn}@s.whatsapp.net`;
  }
  const profilePicUrl = await getProfilePic(wbot, picJid);

  // ── Nome: nunca salvar número como nome ──
  const rawName = msgContact?.name || msgContact?.notify || msgContact?.verifiedName || "";
  const nameIsNumeric = !rawName || /^\d{10,}$/.test(rawName.trim());
  const contactName = nameIsNumeric ? "" : rawName;

  return lidUpdateMutex.runExclusive(async () => {
    // ════════════════════════════════════════════════════
    // PATH 1: JID real (@s.whatsapp.net) — número conhecido
    // ════════════════════════════════════════════════════
    if (!isLid) {
      const number = rawNumber;
      const remoteJid = `${number}@s.whatsapp.net`;

      // Busca UNIFICADA: por número, remoteJid ou lid (evita duplicatas)
      const orConditions: any[] = [
        { number },
        { remoteJid }
      ];
      if (lidValue) {
        const lidNum = extractNumber(lidValue);
        orConditions.push(
          { lid: lidValue },
          { lid: `${lidNum}@lid` },
          { remoteJid: lidValue }
        );
      }

      let contact = await Contact.findOne({
        where: { companyId, [Op.or]: orConditions }
      });

      // Também buscar via WhatsappLidMap se temos lidValue
      if (!contact && lidValue) {
        const lidNum = extractNumber(lidValue);
        const mappedContact = await WhatsappLidMap.findOne({
          where: {
            companyId,
            lid: { [Op.in]: [lidValue, `${lidNum}@lid`, lidNum].filter(Boolean) }
          },
          include: [{ model: Contact, as: "contact" }]
        });
        if (mappedContact?.contact) {
          contact = mappedContact.contact;
        }
      }

      // Fallback: busca parcial por últimos dígitos (resolve duplicatas de formato)
      if (!contact) {
        contact = await findContactByPartialNumber(companyId, number);
        if (contact) {
          logger.info(`[LID-FIX] Contato encontrado via busca parcial: ${contact.id} (${contact.number}) para número ${number}`);
        }
      }

      if (contact) {
        // Atualizar número real, LID e remoteJid se necessário
        const updates: any = { profilePicUrl };
        const numberChanging = contact.number !== number;
        if (numberChanging) {
          updates.number = number;
          logger.info(`[LID-FIX] Atualizando número do contato ${contact.id}: ${contact.number} → ${number}`);
        }
        if (contact.remoteJid !== remoteJid) {
          updates.remoteJid = remoteJid;
        }
        if (lidValue && contact.lid !== lidValue) {
          updates.lid = lidValue;
        }

        // `number` é @Unique no model — se outro contato JÁ tem esse
        // número (ex.: contato "real" criado antes de resolvermos o LID
        // deste, ficando com `contact` = um placeholder de LID), o
        // update() acima explode com SequelizeUniqueConstraintError e
        // derruba a mensagem inteira (visto em produção logo após o log
        // "[LID-FIX] Atualizando número..."). Nesse caso o certo é
        // mesclar ESTE contato (placeholder) DENTRO do que já é dono do
        // número, em vez de tentar roubá-lo.
        if (numberChanging) {
          const collidingContact = await Contact.findOne({
            where: { number, isGroup: false, id: { [Op.ne]: contact.id } }
          });
          if (collidingContact) {
            logger.info(
              `[LID-FIX] Número ${number} já pertence ao contato ${collidingContact.id} — mesclando ${contact.id} nele em vez de atualizar`
            );
            const survivorUpdates: any = { profilePicUrl };
            if (lidValue && collidingContact.lid !== lidValue) {
              survivorUpdates.lid = lidValue;
            }
            await collidingContact.update(survivorUpdates);
            if (lidValue) {
              await WhatsappLidMap.findOrCreate({
                where: { companyId, lid: lidValue, contactId: collidingContact.id },
                defaults: { companyId, lid: lidValue, contactId: collidingContact.id }
              });
            }
            await mergeContacts(collidingContact, contact);
            await mergeDuplicateLidContacts(collidingContact, companyId);
            return collidingContact;
          }
        }

        await contact.update(updates);

        // Atualizar mapeamento LID
        if (lidValue) {
          await WhatsappLidMap.findOrCreate({
            where: { companyId, lid: lidValue, contactId: contact.id },
            defaults: { companyId, lid: lidValue, contactId: contact.id }
          });
        }

        // ✅ MERGE: Buscar e mesclar contatos duplicados com LID que pertencem à mesma pessoa
        await mergeDuplicateLidContacts(contact, companyId);

        return contact;
      }

      // Criar novo contato
      const newContact = await CreateOrUpdateContactService({
        name: contactName,
        number,
        profilePicUrl,
        isGroup: false,
        companyId,
        lid: lidValue || "",
        remoteJid,
        whatsappId: wbot?.id || undefined,
        wbot
      });

      // Salvar mapeamento LID se disponível
      if (lidValue) {
        await WhatsappLidMap.findOrCreate({
          where: { companyId, lid: lidValue, contactId: newContact.id },
          defaults: { companyId, lid: lidValue, contactId: newContact.id }
        });
      }

      return newContact;
    }

    // ════════════════════════════════════════════════════
    // PATH 2: LID (@lid) — número precisa ser resolvido
    // ════════════════════════════════════════════════════

    // 2a. Buscar via WhatsappLidMap (mapeamento local)
    const lidVariants = [
      msgContact.id,
      `${rawNumber}@lid`,
      rawNumber
    ].filter(Boolean);

    const mapping = await WhatsappLidMap.findOne({
      where: {
        companyId,
        lid: { [Op.in]: lidVariants }
      },
      include: [{ model: Contact, as: "contact" }]
    });

    if (mapping?.contact) {
      logger.info(`[LID] Contato encontrado via WhatsappLidMap: ${mapping.contact.id} (number=${mapping.contact.number})`);
      return updateContact(mapping.contact, { profilePicUrl });
    }

    // 2b. Buscar contato pelo campo lid
    const contactByLid = await Contact.findOne({
      where: {
        companyId,
        lid: { [Op.in]: lidVariants }
      }
    });

    if (contactByLid) {
      logger.info(`[LID] Contato encontrado pelo campo lid: ${contactByLid.id}`);
      // Garantir mapeamento na tabela
      await WhatsappLidMap.findOrCreate({
        where: { companyId, lid: msgContact.id, contactId: contactByLid.id },
        defaults: { companyId, lid: msgContact.id, contactId: contactByLid.id }
      });
      return updateContact(contactByLid, { profilePicUrl });
    }

    // 2c. Tentar resolver o número real
    const realNumber = await resolveRealNumber(msgContact.id, msgContact, wbot);

    if (realNumber) {
      // Verificar se já existe contato com esse número real
      const existingContact = await Contact.findOne({
        where: { companyId, number: realNumber }
      });

      if (existingContact) {
        logger.info(`[LID] Contato existente encontrado pelo número real: ${existingContact.id} (${realNumber})`);
        // Atualizar LID
        if (!existingContact.lid || existingContact.lid !== msgContact.id) {
          await existingContact.update({ lid: msgContact.id });
        }
        // Salvar mapeamento
        await WhatsappLidMap.findOrCreate({
          where: { companyId, lid: msgContact.id, contactId: existingContact.id },
          defaults: { companyId, lid: msgContact.id, contactId: existingContact.id }
        });

        // ✅ Buscar e mesclar duplicata com número LID
        const lidNum = extractNumber(msgContact.id);
        if (lidNum) {
          const lidDuplicate = await Contact.findOne({
            where: {
              companyId,
              id: { [Op.ne]: existingContact.id },
              isGroup: false,
              [Op.or]: [
                { number: lidNum },
                { remoteJid: msgContact.id },
                { remoteJid: `${lidNum}@lid` }
              ]
            }
          });
          if (lidDuplicate) {
            logger.info(`[LID-AUTO-MERGE] PATH2: Mergeando LID duplicado ${lidDuplicate.id} → ${existingContact.id}`);
            await mergeContacts(existingContact, lidDuplicate);
          }
        }

        return updateContact(existingContact, { profilePicUrl });
      }

      // Criar contato com número real + LID
      const newContact = await CreateOrUpdateContactService({
        name: contactName,
        number: realNumber,
        profilePicUrl,
        isGroup: false,
        companyId,
        lid: msgContact.id,
        remoteJid: `${realNumber}@s.whatsapp.net`,
        whatsappId: wbot?.id || undefined,
        wbot
      });

      await WhatsappLidMap.findOrCreate({
        where: { companyId, lid: msgContact.id, contactId: newContact.id },
        defaults: { companyId, lid: msgContact.id, contactId: newContact.id }
      });

      return newContact;
    }

    // 2d. Não conseguiu resolver — buscar contato existente com busca ampla antes de criar
    logger.warn(`[LID] Não foi possível resolver número real para LID ${rawNumber}`);

    // Busca ampla: talvez já exista contato com este LID salvo no campo remoteJid ou number
    const existingByLidNumber = await Contact.findOne({
      where: {
        companyId,
        [Op.or]: [
          { number: rawNumber },
          { remoteJid: msgContact.id },
          { remoteJid: `${rawNumber}@lid` }
        ]
      }
    });

    if (existingByLidNumber) {
      logger.info(`[LID] Contato existente encontrado pela busca ampla: ${existingByLidNumber.id}`);
      if (!existingByLidNumber.lid || existingByLidNumber.lid !== msgContact.id) {
        await existingByLidNumber.update({ lid: msgContact.id });
      }
      await WhatsappLidMap.findOrCreate({
        where: { companyId, lid: msgContact.id, contactId: existingByLidNumber.id },
        defaults: { companyId, lid: msgContact.id, contactId: existingByLidNumber.id }
      });
      return updateContact(existingByLidNumber, { profilePicUrl });
    }

    // 2e. Busca parcial por últimos dígitos — evita duplicatas de formato
    const partialMatch = await findContactByPartialNumber(companyId, rawNumber);
    if (partialMatch) {
      logger.info(`[LID] Contato encontrado via busca parcial: ${partialMatch.id} (${partialMatch.number}) para LID ${rawNumber}`);
      if (!partialMatch.lid || partialMatch.lid !== msgContact.id) {
        await partialMatch.update({ lid: msgContact.id });
      }
      await WhatsappLidMap.findOrCreate({
        where: { companyId, lid: msgContact.id, contactId: partialMatch.id },
        defaults: { companyId, lid: msgContact.id, contactId: partialMatch.id }
      });
      return updateContact(partialMatch, { profilePicUrl });
    }

    const newContact = await CreateOrUpdateContactService({
      name: contactName || rawNumber,
      number: rawNumber,
      profilePicUrl,
      isGroup: false,
      companyId,
      lid: msgContact.id,
      remoteJid: msgContact.id,
      whatsappId: wbot?.id || undefined,
      wbot
    });

    await WhatsappLidMap.findOrCreate({
      where: { companyId, lid: msgContact.id, contactId: newContact.id },
      defaults: { companyId, lid: msgContact.id, contactId: newContact.id }
    });

    // Agendar retry para resolver o número real depois
    try {
      await queues["lidRetryQueue"].add(
        "RetryLidLookup",
        {
          contactId: newContact.id,
          whatsappId: wbot?.id || null,
          companyId,
          number: msgContact.id,
          lid: msgContact.id,
          retryCount: 1,
          maxRetries: 5
        },
        {
          delay: 60 * 1000,
          attempts: 1,
          removeOnComplete: true
        }
      );
    } catch (e) {
      logger.error(`[LID] Erro ao agendar retry: ${e.message}`);
    }

    return newContact;
  });
}
