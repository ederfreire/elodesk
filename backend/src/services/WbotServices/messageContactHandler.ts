import {
  jidNormalizedUser,
  proto,
  WASocket
} from "@whiskeysockets/baileys";
import logger from "../../utils/logger";
import { Session } from "../../libs/wbot";
import { IMe } from "./messageUtils";
import { normalizeJid } from "../../utils";
import { resolvePN, addLidPnMapping } from "../../utils/LidPnCache";
import { nomeDeContatoOuNumero } from "../../helpers/NomeDeContato";

export const getMeSocket = (wbot: Session): IMe => {
  return {
    id: jidNormalizedUser((wbot as WASocket).user.id),
    name: (wbot as WASocket).user.name
  };
};

export const getSenderMessage = (
  msg: proto.IWebMessageInfo,
  wbot: Session
): string => {
  const me = getMeSocket(wbot);
  if (msg.key.fromMe) return me.id;
  const senderId = msg.key.participant || msg.key.remoteJid || undefined;
  return senderId && jidNormalizedUser(senderId);
};

export const normalizeContactIdentifier = (msg: proto.IWebMessageInfo): string => {
  return normalizeJid(msg.key.remoteJid);
};

export const getContactMessage = async (msg: proto.IWebMessageInfo, wbot: Session): Promise<IMe> => {
  const isGroup = msg.key.remoteJid.includes("g.us");
  const rawNumber = msg.key.remoteJid.split("@")[0].split(":")[0].replace(/\D/g, "");
  const isLidJid = msg.key.remoteJid?.includes("@lid");
  let lid: string | null = null;
  let resolvedJid: string = msg.key.remoteJid;

  // ✅ Baileys v7: msg.key.senderPn é a fonte MAIS confiável para LID→PN
  const senderPn = (msg.key as any)?.senderPn || null;

  if (isLidJid) {
    lid = msg.key.remoteJid;
    const lidNum = msg.key.remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '');

    // 0️⃣ PRIORIDADE: key.senderPn (fonte nativa do Baileys v7)
    if (senderPn) {
      const pnJid = senderPn.includes("@") ? senderPn : `${senderPn}@s.whatsapp.net`;
      const pnNum = senderPn.split('@')[0].split(':')[0].replace(/\D/g, '');
      if (pnNum && pnNum.length >= 8 && pnNum.length <= 14) {
        resolvedJid = pnJid;
        addLidPnMapping(lidNum, pnNum);
        logger.info(`[LID-V7] ✅ Resolvido LID via key.senderPn: ${msg.key.remoteJid} → ${pnJid}`);
      }
    }

    // 1️⃣ Cache global LID→PN
    if (resolvedJid === msg.key.remoteJid) {
      const cachedPn = resolvePN(lidNum);
      if (cachedPn) {
        resolvedJid = `${cachedPn}@s.whatsapp.net`;
        logger.info(`[LID-V7] ✅ Resolvido LID via cache: ${msg.key.remoteJid} → ${cachedPn}`);
      }
    }
    
    // 2️⃣ getPNForLID nativo do Baileys
    if (resolvedJid === msg.key.remoteJid) {
      try {
        const pn = await (wbot as any).signalRepository?.lidMapping?.getPNForLID?.(msg.key.remoteJid);
        if (pn) {
          resolvedJid = pn;
          addLidPnMapping(lidNum, pn.split('@')[0].split(':')[0].replace(/\D/g, ''));
          logger.info(`[LID-V7] ✅ Resolvido LID via getPNForLID: ${msg.key.remoteJid} → ${pn}`);
        }
      } catch (e) {
        logger.warn(`[LID-V7] getPNForLID falhou: ${e.message}`);
      }
    }

    // 3️⃣ Fallback: store.contacts
    if (resolvedJid === msg.key.remoteJid) {
      try {
        const storeContacts = (wbot as any).store?.contacts || {};
        const lidKey = msg.key.remoteJid;
        const storeContact = storeContacts[lidKey];
        if (storeContact?.id && !storeContact.id.includes("@lid")) {
          resolvedJid = storeContact.id;
          logger.info(`[LID-V7] ✅ Resolvido LID via store.contacts: ${msg.key.remoteJid} → ${resolvedJid}`);
        }
      } catch (e) {
        logger.warn(`[LID-V7] store.contacts lookup falhou: ${e.message}`);
      }
    }

    // 4️⃣ Fallback: onWhatsApp
    if (resolvedJid === msg.key.remoteJid) {
      try {
        const ow = await wbot.onWhatsApp(msg.key.remoteJid);
        if (ow?.[0]?.exists && ow?.[0]?.jid && !String(ow[0].jid).includes("@lid")) {
          resolvedJid = ow[0].jid;
          logger.info(`[LID-V7] ✅ Resolvido LID via onWhatsApp: ${msg.key.remoteJid} → ${resolvedJid}`);
        }
      } catch (e) {
        logger.warn(`[LID-V7] onWhatsApp falhou: ${e.message}`);
      }
    }

    if (resolvedJid === msg.key.remoteJid) {
      logger.warn(`[LID-V7] ⚠️ Não foi possível resolver LID ${msg.key.remoteJid} — mantendo como está`);
    }
  } else if (senderPn && !isGroup) {
    // ✅ Mesmo sem @lid, alimentar cache se senderPn disponível
    const pnNum = senderPn.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (pnNum && rawNumber && rawNumber !== pnNum) {
      addLidPnMapping(rawNumber, pnNum);
    }
  }

  if (isGroup) {
    const participantJid = msg.key.participant;
    let participantLid: string | null = null;
    let resolvedParticipant = participantJid;

    if (participantJid?.includes("@lid")) {
      participantLid = participantJid;
      const partLidNum = participantJid.split('@')[0].split(':')[0].replace(/\D/g, '');

      // 0️⃣ PRIORIDADE: key.senderPn para participantes em grupo
      if (senderPn) {
        const pnNum = senderPn.split('@')[0].split(':')[0].replace(/\D/g, '');
        if (pnNum && pnNum.length >= 8 && pnNum.length <= 14) {
          resolvedParticipant = senderPn.includes("@") ? senderPn : `${senderPn}@s.whatsapp.net`;
          addLidPnMapping(partLidNum, pnNum);
          logger.info(`[LID-V7] ✅ Participant resolvido via key.senderPn: ${participantJid} → ${resolvedParticipant}`);
        }
      }

      // 0.5️⃣ Cache global
      if (resolvedParticipant === participantJid) {
        const cachedPn = resolvePN(partLidNum);
        if (cachedPn) {
          resolvedParticipant = `${cachedPn}@s.whatsapp.net`;
          logger.info(`[LID-V7] ✅ Participant resolvido via cache: ${participantJid} → ${resolvedParticipant}`);
        }
      }

      // 1️⃣ getPNForLID
      if (resolvedParticipant === participantJid) {
        try {
          const pn = await (wbot as any).signalRepository?.lidMapping?.getPNForLID?.(participantJid);
          if (pn) {
            resolvedParticipant = pn;
            logger.info(`[LID-V7] ✅ Participant resolvido via getPNForLID: ${participantJid} → ${pn}`);
          }
        } catch (e) {
          logger.warn(`[LID-V7] participant getPNForLID falhou: ${e.message}`);
        }
      }

      // 2️⃣ Fallback: store.contacts
      if (resolvedParticipant === participantJid) {
        try {
          const storeContacts = (wbot as any).store?.contacts || {};
          const sc = storeContacts[participantJid];
          if (sc?.id && !sc.id.includes("@lid")) {
            resolvedParticipant = sc.id;
            logger.info(`[LID-V7] ✅ Participant resolvido via store.contacts: ${participantJid} → ${resolvedParticipant}`);
          }
        } catch (e) {}
      }

      // 3️⃣ Fallback: onWhatsApp
      if (resolvedParticipant === participantJid) {
        try {
          const ow = await wbot.onWhatsApp(participantJid);
          if (ow?.[0]?.exists && ow?.[0]?.jid && !String(ow[0].jid).includes("@lid")) {
            resolvedParticipant = ow[0].jid;
            logger.info(`[LID-V7] ✅ Participant resolvido via onWhatsApp: ${participantJid} → ${resolvedParticipant}`);
          }
        } catch (e) {}
      }
    }

    return {
      id: resolvedParticipant ? jidNormalizedUser(resolvedParticipant) : getSenderMessage(msg, wbot),
      name: nomeDeContatoOuNumero(msg.pushName, rawNumber),
      lid: participantLid || lid
    };
  }

  return {
    id: resolvedJid,
    name: msg.key.fromMe ? rawNumber : nomeDeContatoOuNumero(msg.pushName, rawNumber),
    lid: lid
  };
};

export const checkLIDStatus = async (wbot: Session): Promise<boolean> => {
  try {
    const isLIDEnabled = wbot.user?.lid;
    return !!isLIDEnabled;
  } catch (error) {
    return false;
  }
};
