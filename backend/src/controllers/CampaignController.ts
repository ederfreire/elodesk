import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import { head } from "lodash";
import fs from "fs";
import path from "path";
import { invalidateCampaignCache } from "../queues";

import ListService from "../services/CampaignService/ListService";
import CreateService from "../services/CampaignService/CreateService";
import ShowService from "../services/CampaignService/ShowService";
import UpdateService from "../services/CampaignService/UpdateService";
import DeleteService from "../services/CampaignService/DeleteService";
import FindService from "../services/CampaignService/FindService";
import ShippingService from "../services/CampaignService/ShippingService";
import CampaignStatsService from "../services/CampaignService/CampaignStatsService";

import Campaign from "../models/Campaign";

import ContactTag from "../models/ContactTag";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";

import AppError from "../errors/AppError";
import { CancelService } from "../services/CampaignService/CancelService";
import { RestartService } from "../services/CampaignService/RestartService";
import RecurrenceService from "../services/CampaignService/RecurrenceService";
import { generateMessageVariants } from "../services/MessageServices/AiAssistantService";
import logger from "../utils/logger";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  pageSize?: string;
  companyId: string | number;
  status?: string;
  isRecurring?: string;
};

// src/controllers/CampaignController.ts - Type StoreData completo

type StoreData = {
  name: string;
  // Campanha de voz: liga e toca um áudio em vez de enviar mensagem.
  campaignType?: string;
  voiceMaxAttempts?: number;
  voiceRetryMinutes?: number;
  voiceRingSeconds?: number;
  voiceSendText?: boolean;
  message1?: string;
  message2?: string;
  message3?: string;
  message4?: string;
  message5?: string;
  confirmationMessage1?: string;
  confirmationMessage2?: string;
  confirmationMessage3?: string;
  confirmationMessage4?: string;
  confirmationMessage5?: string;
  status?: string;
  confirmation: boolean;
  scheduledAt: string;
  companyId: number;
  contactListId?: number | null;
  tagListId?: number | string | null;
  userId?: number | string | null;
  queueId?: number | string | null;
  whatsappId: number;
  statusTicket: string;
  openTicket: string;
  templateId?: number | null;
  templateVariables?: string | null;
  // Follow-up após template oficial
  sendFollowUpMessage?: boolean;
  followUpDelay?: number;
  // Pular contatos já disparados em campanhas anteriores com a mesma lista
  skipAlreadySent?: boolean;
  messageDelays?: string | Record<string, number> | null;
  messageMedias?: string | Record<string, any> | null;
  messageTemplates?: string | Record<string, any> | null;
  whatsappRotation?: string | Record<string, any> | null;
  // Novos campos de recorrência
  isRecurring?: boolean;
  recurrenceType?: string | null;
  recurrenceInterval?: number | null;
  recurrenceDaysOfWeek?: number[] | string | null; // Aceita array do frontend ou string do banco
  recurrenceDayOfMonth?: number | null;
  recurrenceEndDate?: string | null;
  maxExecutions?: number | null;
  executionCount?: number;
  nextScheduledAt?: Date | null;
  lastExecutedAt?: Date | null;
};

type FindParams = {
  companyId: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber, pageSize, status, isRecurring } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { records, count, hasMore, totalPages, currentPage, pageSize: limit } = await ListService({
    searchParam,
    pageNumber,
    pageSize,
    companyId,
    status,
    isRecurring
  });

  return res.json({ records, count, hasMore, totalPages, currentPage, pageSize: limit });
};

// src/controllers/CampaignController.ts - Store method completo

/**
 * A campanha de voz é recurso de plano à parte.
 *
 * A checagem vive aqui, e não só na tela: esconder o botão no navegador não
 * impede ninguém de chamar a API direto. Ligação em massa custa chamada
 * simultânea no servidor e é o uso que mais arrisca bloqueio de número —
 * liberar sem plano seria prejuízo para você e risco para o cliente.
 */
const garantirPlanoDeVoz = async (companyId: number): Promise<void> => {
  const Company = (await import("../models/Company")).default;
  const Plan = (await import("../models/Plan")).default;

  const company = await Company.findByPk(companyId, {
    include: [{ model: Plan, as: "plan", attributes: ["useVoiceCampaign"] }]
  });

  if (!company?.plan?.useVoiceCampaign) {
    throw new AppError(
      "A campanha de voz não está incluída no plano desta empresa.",
      403
    );
  }
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    confirmation: Yup.boolean().required(),
    scheduledAt: Yup.string().required(),
    contactListId: Yup.number().nullable(),
    tagListId: Yup.string().nullable(),
    whatsappId: Yup.number().required(),
    userId: Yup.number().nullable(),
    queueId: Yup.number().nullable(),
    statusTicket: Yup.string().required(),
    openTicket: Yup.string().required(),
    // Validação de recorrência
    isRecurring: Yup.boolean().default(false),
    recurrenceType: Yup.string().when('isRecurring', {
      is: true,
      then: Yup.string().oneOf(['minutely', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly']).required(),
      otherwise: Yup.string().nullable()
    }),
    recurrenceInterval: Yup.number().when('isRecurring', {
      is: true,
      then: Yup.number().min(1).required(),
      otherwise: Yup.number().nullable()
    }),
    recurrenceDaysOfWeek: Yup.mixed().nullable(), // Mixed para aceitar array ou string
    recurrenceDayOfMonth: Yup.number().when(['isRecurring', 'recurrenceType'], {
      is: (isRecurring, recurrenceType) => isRecurring && recurrenceType === 'monthly',
      then: Yup.number().min(1).max(31).required(),
      otherwise: Yup.number().nullable()
    }),
    recurrenceEndDate: Yup.date().when('isRecurring', {
      is: true,
      then: Yup.date().min(new Date(), 'Data final deve ser futura').nullable(),
      otherwise: Yup.date().nullable()
    }),
    maxExecutions: Yup.number().when('isRecurring', {
      is: true,
      then: Yup.number().min(1).nullable(),
      otherwise: Yup.number().nullable()
    })
  });

  try {
    const {
      name,
      message1,
      message2,
      message3,
      message4,
      message5,
      confirmationMessage1,
      confirmationMessage2,
      confirmationMessage3,
      confirmationMessage4,
      confirmationMessage5,
      confirmation,
      scheduledAt,
      contactListId,
      tagListId,
      whatsappId,
      userId,
      queueId,
      statusTicket,
      openTicket,
      templateId,
      templateVariables,
      sendFollowUpMessage,
      skipAlreadySent,
      followUpDelay,
      messageDelays,
      messageMedias,
      messageTemplates,
      whatsappRotation,
      // Novos campos de recorrência
      isRecurring,
      recurrenceType,
      recurrenceInterval,
      recurrenceDaysOfWeek,
      recurrenceDayOfMonth,
      recurrenceEndDate,
      maxExecutions,
      // Campanha de voz
      campaignType,
      voiceMaxAttempts,
      voiceRetryMinutes,
      voiceRingSeconds,
      voiceSendText
    }: StoreData = req.body;


    // Processar dados de recorrência com logs
    const processedRecurrenceData = {
      isRecurring: isRecurring || false,
      recurrenceType: isRecurring ? recurrenceType : null,
      recurrenceInterval: isRecurring ? (recurrenceInterval || 1) : null,
      recurrenceDaysOfWeek: (() => {
        if (!isRecurring) return null;
        if (!recurrenceDaysOfWeek) return null;
        if (Array.isArray(recurrenceDaysOfWeek)) {
          return recurrenceDaysOfWeek.length > 0 ? JSON.stringify(recurrenceDaysOfWeek) : null;
        }
        if (typeof recurrenceDaysOfWeek === 'string') {
          return recurrenceDaysOfWeek;
        }
        return null;
      })(),
      recurrenceDayOfMonth: (isRecurring && recurrenceType === 'monthly') ? recurrenceDayOfMonth : null,
      recurrenceEndDate: (isRecurring && recurrenceEndDate) ? new Date(recurrenceEndDate) : null,
      maxExecutions: (isRecurring && maxExecutions) ? maxExecutions : null,
      executionCount: 0,
      nextScheduledAt: null,
      lastExecutedAt: null
    };


    // Bloqueia antes de gravar qualquer coisa: campanha de voz exige plano.
    if (campaignType === "voice") {
      await garantirPlanoDeVoz(companyId);
    }

    const processedData = {
      name,
      // "voice" só é aceito explicitamente; qualquer outro valor cai no
      // comportamento de sempre, para não transformar campanha de mensagem em
      // campanha de ligação por engano.
      campaignType: campaignType === "voice" ? "voice" : "message",
      voiceMaxAttempts: Number(voiceMaxAttempts) > 0 ? Number(voiceMaxAttempts) : 2,
      voiceRetryMinutes: Number(voiceRetryMinutes) > 0 ? Number(voiceRetryMinutes) : 60,
      voiceRingSeconds: Number(voiceRingSeconds) > 0 ? Number(voiceRingSeconds) : 30,
      // Só desliga quando vier explicitamente false; ausente mantém ligado.
      voiceSendText: voiceSendText !== false,
      message1: message1 || null,
      message2: message2 || null,
      message3: message3 || null,
      message4: message4 || null,
      message5: message5 || null,
      confirmationMessage1: confirmationMessage1 || null,
      confirmationMessage2: confirmationMessage2 || null,
      confirmationMessage3: confirmationMessage3 || null,
      confirmationMessage4: confirmationMessage4 || null,
      confirmationMessage5: confirmationMessage5 || null,
      confirmation,
      scheduledAt,
      contactListId: contactListId || null,
      tagListId: (tagListId === "Nenhuma" || tagListId === "none" || tagListId === "null" || tagListId === "" || tagListId === undefined) ? null : tagListId,
      whatsappId,
      userId: userId || null,
      queueId: queueId || null,
      statusTicket,
      openTicket,
      companyId,
      status: "PROGRAMADA",
      templateId: templateId || null,
      templateVariables: templateVariables || null,
      sendFollowUpMessage: !!sendFollowUpMessage,
      skipAlreadySent: !!skipAlreadySent,
      followUpDelay: followUpDelay ?? 3,
      messageDelays:
        messageDelays == null
          ? null
          : typeof messageDelays === "string"
          ? messageDelays
          : JSON.stringify(messageDelays),
      messageMedias:
        messageMedias == null
          ? null
          : typeof messageMedias === "string"
          ? messageMedias
          : JSON.stringify(messageMedias),
      messageTemplates:
        messageTemplates == null
          ? null
          : typeof messageTemplates === "string"
          ? messageTemplates
          : JSON.stringify(messageTemplates),
      whatsappRotation:
        whatsappRotation == null
          ? null
          : typeof whatsappRotation === "string"
          ? whatsappRotation
          : JSON.stringify(whatsappRotation),
      // Adicionar campos de recorrência processados
      ...processedRecurrenceData
    };

    await schema.validate(processedData);

    const campaign = await Campaign.create(processedData);


    // Log detalhado com informações da lista/tag
    let totalContacts = 0;
    if (campaign.contactListId) {
      // Buscar total de contatos na lista
      totalContacts = await ContactListItem.count({
        where: { contactListId: campaign.contactListId }
      });
    } else if (campaign.tagListId) {
      // Buscar total de contatos na tag
      totalContacts = await ContactTag.count({
        where: { tagId: campaign.tagListId },
        include: [{
          model: Contact,
          as: "contact",
          where: { companyId: campaign.companyId, active: true },
          required: true
        }]
      });
    }

    // Se for recorrente, calcular próxima execução
    if (campaign.isRecurring) {
      await RecurrenceService.scheduleNextExecution(campaign.id);
      // Recarregar campanha para ter o nextScheduledAt atualizado
      await campaign.reload();
    }

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-campaign`, {
        action: "create",
        record: campaign
      });

    return res.status(200).json(campaign);
  } catch (err: any) {
    console.error('[Campaign Store] Erro:', err.message);
    throw new AppError(err.message);
  }
};

// Update method também precisa ser atualizado
export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { campaignId } = req.params;

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    confirmation: Yup.boolean().required(),
    scheduledAt: Yup.string().required(),
    contactListId: Yup.number().nullable(),
    tagListId: Yup.string().nullable(),
    whatsappId: Yup.number().required(),
    userId: Yup.number().nullable(),
    queueId: Yup.number().nullable(),
    statusTicket: Yup.string().required(),
    openTicket: Yup.string().required(),
    // Validação de recorrência
    isRecurring: Yup.boolean().default(false),
    recurrenceType: Yup.string().when('isRecurring', {
      is: true,
      then: Yup.string().oneOf(['minutely', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly']).required(),
      otherwise: Yup.string().nullable()
    }),
    recurrenceInterval: Yup.number().when('isRecurring', {
      is: true,
      then: Yup.number().min(1).required(),
      otherwise: Yup.number().nullable()
    }),
    recurrenceDaysOfWeek: Yup.mixed().nullable(),
    recurrenceDayOfMonth: Yup.number().when(['isRecurring', 'recurrenceType'], {
      is: (isRecurring, recurrenceType) => isRecurring && recurrenceType === 'monthly',
      then: Yup.number().min(1).max(31).required(),
      otherwise: Yup.number().nullable()
    }),
    recurrenceEndDate: Yup.date().when('isRecurring', {
      is: true,
      then: Yup.date().min(new Date(), 'Data final deve ser futura').nullable(),
      otherwise: Yup.date().nullable()
    }),
    maxExecutions: Yup.number().when('isRecurring', {
      is: true,
      then: Yup.number().min(1).nullable(),
      otherwise: Yup.number().nullable()
    })
  });

  try {
    const {
      name,
      message1,
      message2,
      message3,
      message4,
      message5,
      confirmationMessage1,
      confirmationMessage2,
      confirmationMessage3,
      confirmationMessage4,
      confirmationMessage5,
      confirmation,
      scheduledAt,
      contactListId,
      tagListId,
      whatsappId,
      userId,
      queueId,
      statusTicket,
      openTicket,
      templateId,
      templateVariables,
      sendFollowUpMessage,
      skipAlreadySent,
      followUpDelay,
      messageDelays,
      messageMedias,
      messageTemplates,
      whatsappRotation,
      // Novos campos de recorrência
      isRecurring,
      recurrenceType,
      recurrenceInterval,
      recurrenceDaysOfWeek,
      recurrenceDayOfMonth,
      recurrenceEndDate,
      maxExecutions,
      // Campanha de voz
      campaignType,
      voiceMaxAttempts,
      voiceRetryMinutes,
      voiceRingSeconds,
      voiceSendText
    }: StoreData = req.body;


    // Processar dados de recorrência
    const processedRecurrenceData = {
      isRecurring: isRecurring || false,
      recurrenceType: isRecurring ? recurrenceType : null,
      recurrenceInterval: isRecurring ? (recurrenceInterval || 1) : null,
      recurrenceDaysOfWeek: (() => {
        if (!isRecurring) return null;
        if (!recurrenceDaysOfWeek) return null;
        if (Array.isArray(recurrenceDaysOfWeek)) {
          return recurrenceDaysOfWeek.length > 0 ? JSON.stringify(recurrenceDaysOfWeek) : null;
        }
        if (typeof recurrenceDaysOfWeek === 'string') {
          return recurrenceDaysOfWeek;
        }
        return null;
      })(),
      recurrenceDayOfMonth: (isRecurring && recurrenceType === 'monthly') ? recurrenceDayOfMonth : null,
      recurrenceEndDate: (isRecurring && recurrenceEndDate) ? new Date(recurrenceEndDate) : null,
      maxExecutions: (isRecurring && maxExecutions) ? maxExecutions : null
    };

    // Bloqueia antes de gravar qualquer coisa: campanha de voz exige plano.
    if (campaignType === "voice") {
      await garantirPlanoDeVoz(companyId);
    }

    const processedData = {
      name,
      // "voice" só é aceito explicitamente; qualquer outro valor cai no
      // comportamento de sempre, para não transformar campanha de mensagem em
      // campanha de ligação por engano.
      campaignType: campaignType === "voice" ? "voice" : "message",
      voiceMaxAttempts: Number(voiceMaxAttempts) > 0 ? Number(voiceMaxAttempts) : 2,
      voiceRetryMinutes: Number(voiceRetryMinutes) > 0 ? Number(voiceRetryMinutes) : 60,
      voiceRingSeconds: Number(voiceRingSeconds) > 0 ? Number(voiceRingSeconds) : 30,
      // Só desliga quando vier explicitamente false; ausente mantém ligado.
      voiceSendText: voiceSendText !== false,
      message1: message1 || null,
      message2: message2 || null,
      message3: message3 || null,
      message4: message4 || null,
      message5: message5 || null,
      confirmationMessage1: confirmationMessage1 || null,
      confirmationMessage2: confirmationMessage2 || null,
      confirmationMessage3: confirmationMessage3 || null,
      confirmationMessage4: confirmationMessage4 || null,
      confirmationMessage5: confirmationMessage5 || null,
      confirmation,
      scheduledAt,
      contactListId: contactListId || null,
      tagListId: (tagListId === "Nenhuma" || tagListId === "none" || tagListId === "null" || tagListId === "" || tagListId === undefined) ? null : tagListId,
      whatsappId,
      userId: userId || null,
      queueId: queueId || null,
      statusTicket,
      openTicket,
      companyId,
      templateId: templateId || null,
      templateVariables: templateVariables || null,
      sendFollowUpMessage: !!sendFollowUpMessage,
      skipAlreadySent: !!skipAlreadySent,
      followUpDelay: followUpDelay ?? 3,
      messageDelays:
        messageDelays == null
          ? null
          : typeof messageDelays === "string"
          ? messageDelays
          : JSON.stringify(messageDelays),
      messageMedias:
        messageMedias == null
          ? null
          : typeof messageMedias === "string"
          ? messageMedias
          : JSON.stringify(messageMedias),
      messageTemplates:
        messageTemplates == null
          ? null
          : typeof messageTemplates === "string"
          ? messageTemplates
          : JSON.stringify(messageTemplates),
      whatsappRotation:
        whatsappRotation == null
          ? null
          : typeof whatsappRotation === "string"
          ? whatsappRotation
          : JSON.stringify(whatsappRotation),
      // Adicionar campos de recorrência processados
      ...processedRecurrenceData
    };

    await schema.validate(processedData);

    const campaign = await Campaign.findOne({
      where: { id: campaignId, companyId },
      attributes: { exclude: ["createdAt", "updatedAt"] }
    });

    if (!campaign) {
      throw new AppError("ERR_NO_CAMPAIGN_FOUND", 404);
    }

    await campaign.update(processedData);

    // Invalidar cache da campanha para garantir dados frescos no processamento
    invalidateCampaignCache(Number(campaignId));


    // Se for recorrente, recalcular próxima execução
    if (campaign.isRecurring) {
      await RecurrenceService.scheduleNextExecution(campaign.id);
      // Recarregar campanha para ter o nextScheduledAt atualizado
      await campaign.reload();
    }

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-campaign`, {
        action: "update",
        record: campaign
      });

    return res.status(200).json(campaign);
  } catch (err: any) {
    console.error('[Campaign Update] Erro:', err.message);
    throw new AppError(err.message);
  }
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const record = await ShowService(id);

  return res.status(200).json(record);
};

export const cancel = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;

  await CancelService(+id);

  return res.status(204).json({ message: "Cancelamento realizado" });
};

export const restart = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;

  await RestartService(+id);

  return res.status(204).json({ message: "Reinício dos disparos" });
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  await DeleteService(id);

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-campaign`, {
      action: "delete",
      id
    });

  return res.status(200).json({ message: "Campaign deleted" });
};

export const findList = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const params = req.query as FindParams;
  const records: Campaign[] = await FindService(params);

  return res.status(200).json(records);
};

export const mediaUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const files = req.files as Express.Multer.File[];
  const file = head(files);

  try {
    const campaign = await Campaign.findByPk(id);
    campaign.mediaPath = file.filename;
    campaign.mediaName = file.originalname;
    await campaign.save();
    return res.send({ mensagem: "Mensagem enviada" });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

/**
 * Áudio da campanha de voz — gravado no navegador ou enviado como arquivo.
 *
 * Separado do mediaUpload comum de propósito: aquele guarda o anexo da
 * mensagem, este guarda o áudio que será tocado na ligação. Se dividissem o
 * mesmo campo, anexar uma imagem à mensagem apagaria o áudio da ligação.
 */
export const voiceAudioUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const files = req.files as Express.Multer.File[];
  const file = head(files);

  if (!file) {
    throw new AppError("Nenhum arquivo de áudio recebido.", 400);
  }

  try {
    const campaign = await Campaign.findByPk(id);
    if (!campaign) {
      throw new AppError("Campanha não encontrada.", 404);
    }
    campaign.voiceAudioPath = file.filename;
    campaign.voiceAudioName = file.originalname;
    await campaign.save();
    return res.send({
      voiceAudioPath: campaign.voiceAudioPath,
      voiceAudioName: campaign.voiceAudioName
    });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

export const deleteVoiceAudio = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const campaign = await Campaign.findByPk(id);
    if (!campaign) {
      throw new AppError("Campanha não encontrada.", 404);
    }
    if (campaign.voiceAudioPath) {
      const filePath = path.resolve(
        "public",
        `company${companyId}`,
        campaign.voiceAudioPath
      );
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    campaign.voiceAudioPath = null;
    campaign.voiceAudioName = null;
    await campaign.save();
    return res.send({ mensagem: "Áudio removido" });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

export const deleteMedia = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  try {
    const campaign = await Campaign.findByPk(id);
    const filePath = path.resolve("public", `company${companyId}`, campaign.mediaPath);
    const fileExists = fs.existsSync(filePath);
    if (fileExists) {
      fs.unlinkSync(filePath);
    }

    campaign.mediaPath = null;
    campaign.mediaName = null;
    await campaign.save();
    return res.send({ mensagem: "Arquivo excluído" });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

// Upload de mídia individual por mensagem (message1..message5)
export const messageMediaUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { messageKey } = req.query as { messageKey: string };
  const files = req.files as Express.Multer.File[];
  const file = head(files);

  if (!messageKey || !["message1", "message2", "message3", "message4", "message5"].includes(messageKey)) {
    throw new AppError("ERR_INVALID_MESSAGE_KEY", 400);
  }

  try {
    const campaign = await Campaign.findByPk(id);
    let medias: Record<string, { path: string; name: string }> = {};
    try {
      if (campaign.messageMedias) {
        medias = JSON.parse(campaign.messageMedias);
      }
    } catch (e) {}

    medias[messageKey] = { path: file.filename, name: file.originalname };
    campaign.messageMedias = JSON.stringify(medias);
    await campaign.save();

    return res.send({ mensagem: "Mídia da mensagem salva", messageMedias: medias });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

// Deletar mídia individual de uma mensagem
export const deleteMessageMedia = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { messageKey } = req.query as { messageKey: string };

  if (!messageKey || !["message1", "message2", "message3", "message4", "message5"].includes(messageKey)) {
    throw new AppError("ERR_INVALID_MESSAGE_KEY", 400);
  }

  try {
    const campaign = await Campaign.findByPk(id);
    let medias: Record<string, { path: string; name: string }> = {};
    try {
      if (campaign.messageMedias) {
        medias = JSON.parse(campaign.messageMedias);
      }
    } catch (e) {}

    if (medias[messageKey]) {
      const filePath = path.resolve("public", `company${companyId}`, medias[messageKey].path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      delete medias[messageKey];
    }

    campaign.messageMedias = Object.keys(medias).length > 0 ? JSON.stringify(medias) : null;
    await campaign.save();

    return res.send({ mensagem: "Mídia da mensagem removida", messageMedias: medias });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

export const duplicate = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  try {
    const original = await Campaign.findOne({ where: { id, companyId } });
    if (!original) {
      throw new AppError("ERR_NO_CAMPAIGN_FOUND", 404);
    }

    const data: any = original.toJSON();
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.completedAt;
    // Limpar todos os campos que podem disparar execução automática.
    // A campanha duplicada deve nascer totalmente inativa até o usuário
    // editar/agendar e iniciar manualmente.
    delete data.scheduledAt;
    delete data.nextScheduledAt;
    delete data.lastExecutedAt;

    const newCampaign = await Campaign.create({
      ...data,
      name: `${data.name} (copy)`,
      status: "INATIVA",
      scheduledAt: null,
      nextScheduledAt: null,
      lastExecutedAt: null,
      executionCount: 0,
      isRecurring: false,
    });


    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-campaign`, {
        action: "create",
        record: newCampaign,
      });

    return res.status(200).json(newCampaign);
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

export const previewRecurrence = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { recurrenceType, recurrenceInterval, recurrenceDaysOfWeek, recurrenceDayOfMonth } = req.query;

  try {
    const campaign = await Campaign.findByPk(id);
    if (!campaign) {
      throw new AppError("Campanha não encontrada", 404);
    }

    const config = {
      type: recurrenceType as string,
      interval: parseInt(recurrenceInterval as string),
      daysOfWeek: recurrenceDaysOfWeek ? JSON.parse(recurrenceDaysOfWeek as string) : undefined,
      dayOfMonth: recurrenceDayOfMonth ? parseInt(recurrenceDayOfMonth as string) : undefined
    };

    const executions = [];
    let currentDate = new Date(campaign.scheduledAt);
    
    for (let i = 0; i < 10; i++) { // Preview das próximas 10 execuções
      executions.push(new Date(currentDate));
      currentDate = RecurrenceService.calculateNextExecution(currentDate, config);
    }

    return res.json({ executions });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

export const stopRecurrence = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  try {
    const campaign = await Campaign.findByPk(id);
    if (!campaign) {
      throw new AppError("Campanha não encontrada", 404);
    }

    await campaign.update({
      isRecurring: false,
      nextScheduledAt: null,
      status: campaign.status === 'PROGRAMADA' ? 'FINALIZADA' : campaign.status
    });

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-campaign`, {
        action: "update",
        record: campaign
      });

    return res.status(200).json({ message: "Recorrência interrompida com sucesso" });
  } catch (err: any) {
    throw new AppError(err.message);
  }
};

// Novo endpoint para dados de shipping com paginação
export const getShipping = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { page = 1, pageSize = 50, searchParam, status } = req.query;

  try {
    const result = await ShippingService({
      campaignId: id,
      page: parseInt(page as string),
      pageSize: parseInt(pageSize as string),
      searchParam: searchParam as string,
      status: status as 'delivered' | 'pending' | 'failed'
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("Erro ao buscar dados de shipping:", err);
    throw new AppError(err.message || "Erro interno do servidor", 500);
  }
};

// Novo endpoint para estatísticas da campanha
export const getStats = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  try {
    const stats = await CampaignStatsService(id);
    return res.status(200).json(stats);
  } catch (err: any) {
    console.error("Erro ao buscar estatísticas da campanha:", err);
    throw new AppError(err.message || "Erro interno do servidor", 500);
  }
};

// "Gerar 5 variantes da mensagem" no CampaignModal — reescreve a Mensagem 1
// de N jeitos diferentes via IA, pra preencher as abas Variação 2..5 sem o
// usuário precisar digitar cada uma na mão.
export const aiGenerateVariants = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { message, count } = req.body as { message?: string; count?: number };

    const variants = await generateMessageVariants({
      companyId,
      baseMessage: message || "",
      count: count || 5
    });

    return res.json({ variants });
  } catch (err: any) {
    logger.error(`[aiGenerateVariants] Erro: ${err.message}`);
    return res.status(500).json({ error: err.message || "Erro ao gerar variantes" });
  }
};