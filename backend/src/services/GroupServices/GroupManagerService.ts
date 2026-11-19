import { getWbot } from "../../libs/wbot";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import AppError from "../../errors/AppError";
import { GroupMetadata } from "@whiskeysockets/baileys";
import logger from "../../utils/logger";
import { Op } from "sequelize";
import {
  get as wacallsGet,
  post as wacallsPost,
  put as wacallsPut
} from "../WacallsServices/WacallsChatCallService";
import { sendChatText } from "../WacallsServices/WacallsChatMessageService";
import { extrairMencoes } from "../../helpers/GroupMentions";

// Gestor de Grupos — suporte ao canal WhatsApp Plus (wacalls/whatsmeow).
//
// Até aqui, TODA função deste arquivo só sabia falar com Baileys
// (getWbot() + @whiskeysockets/baileys). Numa conexão WhatsApp Plus,
// getWbot() sempre falhava (throw), e em ListGroupsService esse erro era
// engolido num try/catch silencioso — resultado: a tela de Gestor de Grupos
// mostrava "0 grupos sincronizados!" como toast de SUCESSO, mesmo a conexão
// tendo grupos de verdade.
//
// Cada função abaixo agora checa `whatsapp.channel === "wacalls"` e, nesse
// caso, chama os endpoints REST novos do wacalls-chat (ver groupsapi.go)
// em vez de getWbot(). O formato de retorno é mantido idêntico ao que o
// Baileys já produzia (mesmos nomes de campo) para o controller/frontend
// não precisarem de nenhuma mudança.
const jidPath = (jid: string): string => encodeURIComponent(jid);

interface ListGroupsRequest {
  companyId: number;
  whatsappId?: number;
}

interface GroupActionRequest {
  companyId: number;
  whatsappId: number;
  groupJid: string;
}

// List all groups from all or specific connections
export const ListGroupsService = async ({
  companyId,
  whatsappId
}: ListGroupsRequest) => {
  const whereClause: any = { companyId, status: "CONNECTED" };
  if (whatsappId) whereClause.id = whatsappId;

  const whatsapps = await Whatsapp.findAll({ where: whereClause });

  const allGroups: any[] = [];

  for (const whatsapp of whatsapps) {
    try {
      if (whatsapp.channel === "wacalls") {
        if (!whatsapp.wacallsChatSessionId) {
          logger.warn(`[GroupManager] whatsapp ${whatsapp.id} (wacalls) sem wacallsChatSessionId — pulando`);
          continue;
        }
        const data = await wacallsGet<{ groups: any[] }>(
          `/api/sessions/${whatsapp.wacallsChatSessionId}/groups`
        );
        for (const group of data?.groups || []) {
          allGroups.push({
            id: group.id,
            subject: group.subject,
            owner: group.owner,
            creation: group.creation,
            desc: group.desc,
            descId: group.descId,
            restrict: group.restrict,
            announce: group.announce,
            size: group.size || group.participants?.length || 0,
            participants: group.participants?.length || 0,
            whatsappId: whatsapp.id,
            whatsappName: whatsapp.name,
            profilePicUrl: group.profilePicUrl || ""
          });
        }
        continue;
      }

      const wbot = getWbot(whatsapp.id);
      const groupsMetadata = await wbot.groupFetchAllParticipating();
      const groups = Object.values(groupsMetadata || {});

      for (const group of groups as any[]) {
        let profilePicUrl = "";
        try {
          profilePicUrl = await wbot.profilePictureUrl(group.id, "image");
        } catch {}

        allGroups.push({
          id: group.id,
          subject: group.subject,
          owner: group.owner,
          creation: group.creation,
          desc: group.desc,
          descId: group.descId,
          restrict: group.restrict,
          announce: group.announce,
          size: group.size || group.participants?.length || 0,
          participants: group.participants?.length || 0,
          whatsappId: whatsapp.id,
          whatsappName: whatsapp.name,
          profilePicUrl
        });
      }
    } catch (error) {
      logger.error(`Error fetching groups for whatsapp ${whatsapp.id}: ${error.message}`);
    }
  }

  return allGroups.sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
};

// Get group metadata with enriched participant info
export const GetGroupMetadataService = async ({
  companyId,
  whatsappId,
  groupJid
}: GroupActionRequest) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  const isWacalls = whatsapp?.channel === "wacalls";

  let metadata: any;
  let profilePicUrl = "";

  if (isWacalls) {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    metadata = await wacallsGet<any>(
      `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${jidPath(groupJid)}`
    );
    profilePicUrl = metadata?.profilePicUrl || "";
  } else {
    const wbot = getWbot(whatsappId);
    metadata = await wbot.groupMetadata(groupJid);
    try {
      profilePicUrl = await wbot.profilePictureUrl(groupJid, "image");
    } catch {}
  }

  // Enrich participants with contact info from DB and profile pics
  const enrichedParticipants = [];

  if (metadata.participants && metadata.participants.length > 0) {
    // Extract numbers from JIDs to match with contacts
    const numbers = metadata.participants.map((p: any) =>
      p.id.replace("@s.whatsapp.net", "").replace("@lid", "")
    );

    // Fetch matching contacts from DB
    const contacts = await Contact.findAll({
      where: {
        number: { [Op.in]: numbers },
        companyId
      },
      attributes: ["number", "name", "profilePicUrl"]
    });

    const contactMap = new Map<string, { name: string; profilePicUrl: string }>();
    for (const c of contacts) {
      contactMap.set(c.number, { name: c.name, profilePicUrl: c.profilePicUrl });
    }

    for (const p of metadata.participants as any[]) {
      const num = p.id.replace("@s.whatsapp.net", "").replace("@lid", "");
      const contact = contactMap.get(num);

      let participantPic = contact?.profilePicUrl || "";
      // Fallback pra buscar direto do WhatsApp só existe no lado Baileys
      // (wbot.profilePictureUrl) — no wacalls o custo de uma chamada extra
      // ao whatsmeow por participante seria alto demais pra essa tela; sem
      // foto no banco, o avatar mostra as iniciais (comportamento normal do
      // componente Avatar do MUI quando não recebe `src`).
      if (!participantPic && !isWacalls) {
        try {
          const wbot = getWbot(whatsappId);
          participantPic = await wbot.profilePictureUrl(p.id, "image");
        } catch {}
      }

      enrichedParticipants.push({
        ...p,
        name: contact?.name || null,
        profilePicUrl: participantPic
      });
    }
  }

  return {
    ...metadata,
    participants: enrichedParticipants,
    profilePicUrl,
    whatsappId
  };
};

// Update group subject (name)
export const UpdateGroupSubjectService = async ({
  companyId,
  whatsappId,
  groupJid,
  subject
}: GroupActionRequest & { subject: string }) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    await wacallsPut(
      `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${jidPath(groupJid)}/subject`,
      { subject }
    );
    return { success: true };
  }
  const wbot = getWbot(whatsappId);
  await wbot.groupUpdateSubject(groupJid, subject);
  return { success: true };
};

// Update group description
export const UpdateGroupDescriptionService = async ({
  companyId,
  whatsappId,
  groupJid,
  description
}: GroupActionRequest & { description: string }) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    await wacallsPut(
      `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${jidPath(groupJid)}/description`,
      { description }
    );
    return { success: true };
  }
  const wbot = getWbot(whatsappId);
  await wbot.groupUpdateDescription(groupJid, description);
  return { success: true };
};

// Get group invite link
export const GetGroupInviteLinkService = async ({
  companyId,
  whatsappId,
  groupJid
}: GroupActionRequest) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    const data = await wacallsGet<{ inviteLink: string }>(
      `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${jidPath(groupJid)}/invite`
    );
    return { inviteLink: data.inviteLink };
  }
  const wbot = getWbot(whatsappId);
  const code = await wbot.groupInviteCode(groupJid);
  return { inviteLink: `https://chat.whatsapp.com/${code}` };
};

// Add participants to group
export const AddGroupParticipantsService = async ({
  companyId,
  whatsappId,
  groupJid,
  participants
}: GroupActionRequest & { participants: string[] }) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    const jids = participants.map(p => {
      const num = p.replace(/\D/g, "");
      return `${num}@s.whatsapp.net`;
    });
    const data = await wacallsPost<{ participants: any[] }>(
      `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${jidPath(groupJid)}/participants`,
      { jids, action: "add" }
    );
    return data.participants;
  }
  const wbot = getWbot(whatsappId);
  const jids = participants.map(p => {
    const num = p.replace(/\D/g, "");
    return `${num}@s.whatsapp.net`;
  });
  const result = await wbot.groupParticipantsUpdate(groupJid, jids, "add");
  return result;
};

// Send message to group
export const SendGroupMessageService = async ({
  companyId,
  whatsappId,
  groupJid,
  message,
  mentionAll
}: GroupActionRequest & { message: string; mentionAll?: boolean }) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    // mentionAll (@todos) depende de montar uma extendedTextMessage com
    // contextInfo.mentionedJid — o wacalls-chat não expõe isso hoje pelo
    // endpoint de envio simples usado aqui, então nesse canal a mensagem
    // sai sem marcar todo mundo (o texto continua sendo enviado normalmente).
    await sendChatText(whatsapp.wacallsChatSessionId, groupJid, message);
    return { success: true };
  }

  const wbot = getWbot(whatsappId);

  // Números escritos como "@numero" no próprio texto também marcam a pessoa.
  // Sem isso, quem digitava "@5511999999999" via só o texto cru chegar.
  const escritas = extrairMencoes(message);

  if (mentionAll) {
    const metadata = await wbot.groupMetadata(groupJid);
    const botNumber = wbot.user?.id?.split(":")[0];
    const botJid = `${botNumber}@s.whatsapp.net`;
    const todos = metadata.participants
      .filter(p => p.id !== botJid)
      .map(p => p.id);

    await wbot.sendMessage(groupJid, {
      text: message,
      mentions: Array.from(new Set([...todos, ...escritas]))
    });
  } else if (escritas.length > 0) {
    await wbot.sendMessage(groupJid, { text: message, mentions: escritas });
  } else {
    await wbot.sendMessage(groupJid, { text: message });
  }

  return { success: true };
};

// Update group settings
export const UpdateGroupSettingsService = async ({
  companyId,
  whatsappId,
  groupJid,
  setting,
  value
}: GroupActionRequest & { setting: "announcement" | "not_announcement" | "locked" | "unlocked"; value: boolean }) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    await wacallsPut(
      `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${jidPath(groupJid)}/settings`,
      { setting }
    );
    return { success: true };
  }
  const wbot = getWbot(whatsappId);
  await wbot.groupSettingUpdate(groupJid, setting);
  return { success: true };
};

// Remove participant from group
export const RemoveGroupParticipantService = async ({
  companyId,
  whatsappId,
  groupJid,
  participantJid
}: GroupActionRequest & { participantJid: string }) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    await wacallsPost(
      `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${jidPath(groupJid)}/participants`,
      { jids: [participantJid], action: "remove" }
    );
    return { success: true };
  }
  const wbot = getWbot(whatsappId);
  await wbot.groupParticipantsUpdate(groupJid, [participantJid], "remove");
  return { success: true };
};

// Promote participant to admin
export const PromoteGroupParticipantService = async ({
  companyId,
  whatsappId,
  groupJid,
  participantJid
}: GroupActionRequest & { participantJid: string }) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    await wacallsPost(
      `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${jidPath(groupJid)}/participants`,
      { jids: [participantJid], action: "promote" }
    );
    return { success: true };
  }
  const wbot = getWbot(whatsappId);
  await wbot.groupParticipantsUpdate(groupJid, [participantJid], "promote");
  return { success: true };
};

// Demote admin to regular participant
export const DemoteGroupParticipantService = async ({
  companyId,
  whatsappId,
  groupJid,
  participantJid
}: GroupActionRequest & { participantJid: string }) => {
  const whatsapp = await Whatsapp.findByPk(whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) throw new AppError(
      "A conexão WhatsApp Plus não está pareada. Abra Conexões e leia o QR Code novamente.",
      400
    );
    await wacallsPost(
      `/api/sessions/${whatsapp.wacallsChatSessionId}/groups/${jidPath(groupJid)}/participants`,
      { jids: [participantJid], action: "demote" }
    );
    return { success: true };
  }
  const wbot = getWbot(whatsappId);
  await wbot.groupParticipantsUpdate(groupJid, [participantJid], "demote");
  return { success: true };
};
