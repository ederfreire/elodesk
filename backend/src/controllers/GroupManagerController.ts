import { Request, Response } from "express";
import {
  ListGroupsService,
  GetGroupMetadataService,
  UpdateGroupSubjectService,
  UpdateGroupDescriptionService,
  GetGroupInviteLinkService,
  AddGroupParticipantsService,
  SendGroupMessageService,
  UpdateGroupSettingsService,
  RemoveGroupParticipantService,
  PromoteGroupParticipantService,
  DemoteGroupParticipantService
} from "../services/GroupServices/GroupManagerService";
import {
  montarSaudacao,
  GROUP_GREETING_VARIABLES
} from "../services/GroupServices/GroupGreetingService";
import GroupGreeting from "../models/GroupGreeting";
import logger from "../utils/logger";

export const listGroups = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId } = req.query;

    const groups = await ListGroupsService({
      companyId,
      whatsappId: whatsappId ? Number(whatsappId) : undefined
    });

    return res.json(groups);
  } catch (err: any) {
    logger.error(`listGroups error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error listing groups" });
  }
};

export const getGroupMetadata = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;

    const metadata = await GetGroupMetadataService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid
    });

    return res.json(metadata);
  } catch (err: any) {
    logger.error(`getGroupMetadata error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error fetching group metadata" });
  }
};

export const updateSubject = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;
    const { subject } = req.body;

    const result = await UpdateGroupSubjectService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid,
      subject
    });

    return res.json(result);
  } catch (err: any) {
    logger.error(`updateSubject error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error updating subject" });
  }
};

export const updateDescription = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;
    const { description } = req.body;

    const result = await UpdateGroupDescriptionService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid,
      description
    });

    return res.json(result);
  } catch (err: any) {
    logger.error(`updateDescription error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error updating description" });
  }
};

export const getInviteLink = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;

    const result = await GetGroupInviteLinkService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid
    });

    return res.json(result);
  } catch (err: any) {
    logger.error(`getInviteLink error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error getting invite link" });
  }
};

export const addParticipants = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;
    const { participants } = req.body;

    const result = await AddGroupParticipantsService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid,
      participants
    });

    return res.json(result);
  } catch (err: any) {
    logger.error(`addParticipants error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error adding participants" });
  }
};

export const sendMessage = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;
    const { message, mentionAll } = req.body;

    const result = await SendGroupMessageService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid,
      message,
      mentionAll
    });

    return res.json(result);
  } catch (err: any) {
    logger.error(`sendMessage error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error sending message" });
  }
};

export const updateSettings = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;
    const { setting } = req.body;

    const result = await UpdateGroupSettingsService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid,
      setting,
      value: true
    });

    return res.json(result);
  } catch (err: any) {
    logger.error(`updateSettings error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error updating settings" });
  }
};

export const removeParticipant = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;
    const { participantJid } = req.body;

    const result = await RemoveGroupParticipantService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid,
      participantJid
    });

    return res.json(result);
  } catch (err: any) {
    logger.error(`removeParticipant error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error removing participant" });
  }
};

export const promoteParticipant = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;
    const { participantJid } = req.body;

    const result = await PromoteGroupParticipantService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid,
      participantJid
    });

    return res.json(result);
  } catch (err: any) {
    logger.error(`promoteParticipant error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error promoting participant" });
  }
};

export const demoteParticipant = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;
    const { participantJid } = req.body;

    const result = await DemoteGroupParticipantService({
      companyId,
      whatsappId: Number(whatsappId),
      groupJid,
      participantJid
    });

    return res.json(result);
  } catch (err: any) {
    logger.error(`demoteParticipant error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error demoting participant" });
  }
};

// ---------------------------------------------------------------------------
// Saudação para novos membros
// ---------------------------------------------------------------------------

export const getGreeting = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;

    const config = await GroupGreeting.findOne({
      where: { companyId, whatsappId: Number(whatsappId), groupJid }
    });

    return res.json({
      enabled: config?.enabled ?? false,
      sendInGroup: config?.sendInGroup ?? true,
      sendInPrivate: config?.sendInPrivate ?? false,
      message: config?.message ?? "",
      variables: GROUP_GREETING_VARIABLES
    });
  } catch (err: any) {
    logger.error(`getGreeting error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error loading greeting" });
  }
};

export const saveGreeting = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { whatsappId, groupJid } = req.params;
    const { enabled, sendInGroup, sendInPrivate, message } = req.body;

    // Ligar sem escolher onde enviar deixaria a saudação "ativa" sem sair
    // nunca — avisa em vez de salvar uma configuração que não faz nada.
    if (enabled && !sendInGroup && !sendInPrivate) {
      return res.status(400).json({
        error: "Escolha ao menos um destino: no grupo ou no privado."
      });
    }
    if (enabled && !String(message || "").trim()) {
      return res.status(400).json({
        error: "Escreva a mensagem de saudação antes de ativar."
      });
    }

    const dados = {
      companyId,
      whatsappId: Number(whatsappId),
      groupJid,
      enabled: !!enabled,
      sendInGroup: sendInGroup !== false,
      sendInPrivate: !!sendInPrivate,
      message: String(message || "")
    };

    const existente = await GroupGreeting.findOne({
      where: { companyId, whatsappId: Number(whatsappId), groupJid }
    });

    if (existente) {
      await existente.update(dados);
    } else {
      await GroupGreeting.create(dados as any);
    }

    return res.json({ success: true });
  } catch (err: any) {
    logger.error(`saveGreeting error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error saving greeting" });
  }
};

/**
 * Prévia com dados fictícios — deixa o usuário ver como a mensagem fica
 * antes de alguém entrar de verdade no grupo.
 */
export const previewGreeting = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { message } = req.body;

    const texto = montarSaudacao({
      template: String(message || ""),
      participante: { jid: "", numero: "5511999999999", nome: "Maria Silva" },
      nomeGrupo: "Clientes VIP",
      totalMembros: 42,
      nomeConexao: "Comercial",
      nomeEmpresa: "Sua Empresa"
    });

    return res.json({ preview: texto });
  } catch (err: any) {
    logger.error(`previewGreeting error: ${err.message}`);
    return res.status(500).json({ error: err.message || "Error rendering preview" });
  }
};
