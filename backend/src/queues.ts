import * as Sentry from "@sentry/node";
import BullQueue from "bull";
import { MessageData, SendMessage } from "./helpers/SendMessage";
import Whatsapp from "./models/Whatsapp";
import logger from "./utils/logger";
import moment from "moment-timezone";
import Schedule from "./models/Schedule";
import { Op, QueryTypes } from "sequelize";
import GetDefaultWhatsApp from "./helpers/GetDefaultWhatsApp";
import { aplicarDadosAgendamento } from "./services/ScheduleServices/AppointmentMessage";

import Campaign from "./models/Campaign";
import Queues from "./models/Queue";
import ContactList from "./models/ContactList";
import ContactListItem from "./models/ContactListItem";
import { isEmpty, isNil, isArray } from "lodash";
import CampaignSetting from "./models/CampaignSetting";
import CampaignShipping from "./models/CampaignShipping";
import GetWhatsappWbot from "./helpers/GetWhatsappWbot";
import sequelize from "./database";
import { getMessageOptions } from "./services/WbotServices/SendWhatsAppMedia";
import { getIO } from "./libs/socket";
import path from "path";
import User from "./models/User";
import Company from "./models/Company";
import Contact from "./models/Contact";
import Queue from "./models/Queue";
import { ClosedAllOpenTickets } from "./services/WbotServices/wbotClosedTickets";
import Ticket from "./models/Ticket";
import UserQueue from "./models/UserQueue";
import ContactWallet from "./models/ContactWallet";
import ShowTicketService from "./services/TicketServices/ShowTicketService";
import SendWhatsAppMessage from "./services/WbotServices/SendWhatsAppMessage";
import SendWhatsAppMedia from "./services/WbotServices/SendWhatsAppMedia";
import UpdateTicketService from "./services/TicketServices/UpdateTicketService";
import { addSeconds, differenceInSeconds } from "date-fns";
const CronJob = require("cron").CronJob;
import CompaniesSettings from "./models/CompaniesSettings";
import {
  verifyMediaMessage,
  verifyMessage
} from "./services/WbotServices/wbotMessageListener";
import CreateLogTicketService from "./services/TicketServices/CreateLogTicketService";
import formatBody from "./helpers/Mustache";
import TicketTag from "./models/TicketTag";
import Tag from "./models/Tag";
import ContactTag from "./models/ContactTag";
import Plan from "./models/Plan";
import { getWbot } from "./libs/wbot";
import { initializeBirthdayJobs } from "./jobs/BirthdayJob";
import { getJidOf } from "./services/WbotServices/getJidOf";
import RecurrenceService from "./services/CampaignService/RecurrenceService";
import WhatsappLidMap from "./models/WhatsapplidMap";
import { mergeContacts } from "./services/WbotServices/verifyContact";
import SendWhatsAppOficialMessage from "./services/WhatsAppOficial/SendWhatsAppOficialMessage";
import { obterNomeEExtensaoDoArquivo } from "./controllers/MessageController";
import QuickMessage from "./models/QuickMessage";
import QuickMessageComponent from "./models/QuickMessageComponent";
import fs from "fs";
import mime from "mime-types";
import { SendWacallsText, SendWacallsMediaMessage } from "./services/WacallsServices/SendWacallsMessageService";
import { aplicarVariaveisDeCampanha } from "./helpers/VariaveisDeCampanha";

const connection = process.env.REDIS_URI || "";
const limiterMax = process.env.REDIS_OPT_LIMITER_MAX || 1;
const limiterDuration = process.env.REDIS_OPT_LIMITER_DURATION || 3000;

// Lock para evitar processamento paralelo de verifyAndFinalizeCampaign
const campaignVerificationLocks = new Map<number, Promise<void>>();

// ─── Cache de campanhas (TTL 60s) ────────────────────────────────────────────
const campaignCache = new Map<number, { campaign: any; timestamp: number }>();
const CAMPAIGN_CACHE_TTL = 60 * 1000;

function getCachedCampaign(id: number) {
  const cached = campaignCache.get(id);
  if (cached && Date.now() - cached.timestamp < CAMPAIGN_CACHE_TTL) {
    return cached.campaign;
  }
  campaignCache.delete(id);
  return null;
}

function setCachedCampaign(id: number, campaign: any) {
  campaignCache.set(id, { campaign, timestamp: Date.now() });
  if (campaignCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of campaignCache) {
      if (now - value.timestamp > CAMPAIGN_CACHE_TTL) campaignCache.delete(key);
    }
  }
}

export function invalidateCampaignCache(id: number) {
  campaignCache.delete(id);
}

// ─── Cache de settings por empresa (TTL 5 min) ───────────────────────────────
const settingsCache = new Map<number, { settings: CampaignSettings; timestamp: number }>();
const SETTINGS_CACHE_TTL = 5 * 60 * 1000;

function getCachedSettings(companyId: number): CampaignSettings | null {
  const cached = settingsCache.get(companyId);
  if (cached && Date.now() - cached.timestamp < SETTINGS_CACHE_TTL) return cached.settings;
  settingsCache.delete(companyId);
  return null;
}

function setCachedSettings(companyId: number, settings: CampaignSettings) {
  settingsCache.set(companyId, { settings, timestamp: Date.now() });
}

export function invalidateSettingsCache(companyId: number) {
  settingsCache.delete(companyId);
}

// ─── Cache de contatos (TTL 10 min) ─────────────────────────────────────────
const contactCache = new Map<string, { contact: any; timestamp: number }>();
const CONTACT_CACHE_TTL = 10 * 60 * 1000;

function getCachedContact(key: string) {
  const cached = contactCache.get(key);
  if (cached && Date.now() - cached.timestamp < CONTACT_CACHE_TTL) return cached.contact;
  contactCache.delete(key);
  return null;
}

function setCachedContact(key: string, contact: any) {
  contactCache.set(key, { contact, timestamp: Date.now() });
  if (contactCache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of contactCache) {
      if (now - v.timestamp > CONTACT_CACHE_TTL) contactCache.delete(k);
    }
  }
}

interface ProcessCampaignData {
  id: number;
  delay: number;
  restartMode?: boolean;
  messageInterval?: number;
  longerIntervalAfter?: number;
  greaterInterval?: number;
}

interface CampaignSettings {
  messageInterval: number;
  longerIntervalAfter: number;
  greaterInterval: number;
  jitterPercent: number;   // % de variação aleatória (0-80)
  longPauseEvery: number;  // pausa extra a cada N mensagens (0 = desabilitado)
  longPauseDuration: number; // duração em segundos da pausa periódica
  cooldownDays: number;    // 🛡️ não reenviar para o mesmo nº por N dias (0 = desabilitado)
  errorPauseThreshold: number; // 🛡️ % de falhas para cancelar (0 = desabilitado, padrão 30)
  errorPauseMinAttempts: number; // 🛡️ mínimo de tentativas antes de avaliar (padrão 10)
  variables: any[];
}

// 🛡️ Contador em memória de erros/sucessos por campanha (reset ao reiniciar processo)
const campaignErrorStats = new Map<number, { sent: number; failed: number }>();
function recordCampaignAttempt(campaignId: number, success: boolean) {
  const s = campaignErrorStats.get(campaignId) || { sent: 0, failed: 0 };
  if (success) s.sent += 1; else s.failed += 1;
  campaignErrorStats.set(campaignId, s);
  return s;
}
export function clearCampaignErrorStats(campaignId: number) {
  campaignErrorStats.delete(campaignId);
}

interface PrepareContactData {
  contactId: number;
  campaignId: number;
  variables: any[];
}

interface DispatchCampaignData {
  campaignId: number;
  campaignShippingId: number;
  contactListItemId: number;
}

interface LidRetryData {
  contactId: number;
  whatsappId: number;
  companyId: number;
  number: string;
  retryCount: number;
  maxRetries?: number;
}

export const userMonitor = new BullQueue("UserMonitor", connection);
export const scheduleMonitor = new BullQueue("ScheduleMonitor", connection);
export const sendScheduledMessages = new BullQueue("SendSacheduledMessages", connection);
export const campaignQueue = new BullQueue("CampaignQueue", connection);
/**
 * Fila separada para a campanha de VOZ.
 *
 * Motivo: o disparo de mensagem é instantâneo, mas uma ligação ocupa o
 * trabalhador durante toda a chamada — espera o contato atender (até
 * `voiceRingSeconds`), toca o áudio inteiro e só então desliga. São dezenas de
 * segundos por contato.
 *
 * A fila de campanhas processa um trabalho por vez. Se a ligação ficasse lá
 * dentro, cada contato de voz seguraria a fila e TODAS as campanhas de texto,
 * de TODAS as empresas, ficariam paradas atrás dela. Numa instalação com
 * várias empresas isso trava o sistema inteiro.
 *
 * Com fila própria, ligações e mensagens andam em paralelo, e a quantidade de
 * ligações simultâneas é controlada aqui, sem afetar o envio de texto.
 */
export const voiceCampaignQueue = new BullQueue("VoiceCampaignQueue", connection);
export const queueMonitor = new BullQueue("QueueMonitor", connection);
export const lidRetryQueue = new BullQueue("LidRetryQueue", connection);

export const messageQueue = new BullQueue("MessageQueue", connection, {
  limiter: {
    max: limiterMax as number,
    duration: limiterDuration as number
  }
});

let isProcessing = false;

async function handleSendMessage(job) {
  try {
    const { data } = job;

    const whatsapp = await Whatsapp.findByPk(data.whatsappId);

    if (whatsapp === null) {
      throw Error("Whatsapp não identificado");
    }

    const messageData: MessageData = data.data;

    logger.info(`[QUEUE] Processando mensagem para whatsapp ${data.whatsappId}`);
    await SendMessage(whatsapp, messageData);
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("MessageQueue -> SendMessage: error", e.message);
    throw e;
  }
}

// ✅ Nova função para verificar lembretes
async function handleVerifyReminders(job) {
  try {
    const { count, rows: schedules } = await Schedule.findAndCountAll({
      where: {
        reminderStatus: "PENDENTE",
        reminderSentAt: null,
        reminderDate: {
          [Op.gte]: moment().format("YYYY-MM-DD HH:mm:ss"),
          [Op.lte]: moment().add("30", "seconds").format("YYYY-MM-DD HH:mm:ss")
        }
      },
      include: [
        { model: Contact, as: "contact" },
        { model: User, as: "user", attributes: ["name"] }
      ],
      distinct: true,
      subQuery: false
    });

    if (count > 0) {
      await Promise.all(
        schedules.map(async schedule => {
          try {
            await schedule.update({ reminderStatus: "AGENDADA" });
            await sendScheduledMessages.add(
              "SendReminder",
              { schedule },
              { delay: 40000 }
            );
            logger.info(`Lembrete agendado para: ${schedule.contact.name}`);
          } catch (err: any) {
            logger.error(
              `Erro ao agendar lembrete ${schedule.id}: ${err?.message}`
            );
          }
        })
      );
    }
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SendReminder -> Verify: error", e.message);
    throw e;
  }
}

async function handleVerifySchedules(job) {
  try {
    const { count, rows: schedules } = await Schedule.findAndCountAll({
      where: {
        status: "PENDENTE",
        sentAt: null,
        sendAt: {
          [Op.gte]: moment().format("YYYY-MM-DD HH:mm:ss"),
          [Op.lte]: moment().add("30", "seconds").format("YYYY-MM-DD HH:mm:ss")
        }
      },
      include: [
        { model: Contact, as: "contact" },
        { model: User, as: "user", attributes: ["name"] }
      ],
      distinct: true,
      subQuery: false
    });

    if (count > 0) {
      await Promise.all(
        schedules.map(async schedule => {
          try {
            await schedule.update({ status: "AGENDADA" });
            await sendScheduledMessages.add(
              "SendMessage",
              { schedule },
              { delay: 40000 }
            );
            logger.info(`Disparo agendado para: ${schedule.contact.name}`);
          } catch (err: any) {
            logger.error(
              `Erro ao agendar disparo ${schedule.id}: ${err?.message}`
            );
          }
        })
      );
    }
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SendScheduledMessage -> Verify: error", e.message);
    throw e;
  }
}

async function handleSendScheduledMessage(job) {
  const {
    data: { schedule }
  } = job;
  let scheduleRecord: Schedule | null = null;

  try {
    scheduleRecord = await Schedule.findByPk(schedule.id);
  } catch (e) {
    Sentry.captureException(e);
    logger.info(`Erro ao tentar consultar agendamento: ${schedule.id}`);
  }

  try {
    // ✅ Verificar se há lembrete configurado
    if (schedule.reminderDate && schedule.reminderStatus === "PENDENTE") {
      logger.info(`Agendamento ${schedule.id} tem lembrete configurado - não enviando mensagem no horário original`);

      // Atualizar status para indicar que não será enviado no horário original
      await scheduleRecord?.update({
        status: "CANCELADO_POR_LEMBRETE"
      });

      return; // Não enviar a mensagem no horário original
    }

    let whatsapp;

    if (!isNil(schedule.whatsappId)) {
      whatsapp = await Whatsapp.findByPk(schedule.whatsappId);
    }

    if (!whatsapp) whatsapp = await GetDefaultWhatsApp(schedule.companyId);

    // const settings = await CompaniesSettings.findOne({
    //   where: {
    //     companyId: schedule.companyId
    //   }
    // })

    let filePath = null;
    if (schedule.mediaPath) {
      filePath = path.resolve(
        "public",
        `company${schedule.companyId}`,
        schedule.mediaPath
      );
    }

    if (schedule.openTicket === "enabled") {
      let ticket = await Ticket.findOne({
        where: {
          contactId: schedule.contact.id,
          companyId: schedule.companyId,
          whatsappId: whatsapp.id,
          status: ["open", "pending"]
        }
      });

      if (!ticket)
        ticket = await Ticket.create({
          companyId: schedule.companyId,
          contactId: schedule.contactId,
          whatsappId: whatsapp.id,
          queueId: schedule.queueId,
          userId: schedule.ticketUserId,
          status: schedule.statusTicket
        });

      ticket = await ShowTicketService(ticket.id, schedule.companyId);

      let bodyMessage;

      // @ts-ignore: Unreachable code error
      if (schedule.assinar && !isNil(schedule.userId)) {
        bodyMessage = `*${schedule?.user?.name}:*\n${schedule.body.trim()}`;
      } else {
        bodyMessage = schedule.body.trim();
      }

      const dataAgendamento = await agendamentoContato(schedule);
      let bodySchedule = bodyMessage.replace("{{dataAgendamento}}", dataAgendamento);
      // Anexa (ou substitui as variáveis) com data, hora, duração e link do
      // Meet do compromisso, para o contato receber os dados no disparo.
      bodySchedule = aplicarDadosAgendamento(bodySchedule, scheduleRecord || schedule);
      bodySchedule = `${formatBody(bodySchedule, ticket)}`;


      const sentMessage = await SendMessage(
        whatsapp,
        {
          number: schedule.contact.number,
          body: bodySchedule,
          mediaPath: filePath,
          companyId: schedule.companyId
        },
        schedule.contact.isGroup
      );

      // Para canais wacalls (WhatsApp Plus) e whatsapp_oficial, o SendMessage
      // já persiste a Message via CreateMessageService e emite o socket dentro
      // dos próprios services (SendWacallsText/SendWacallsMediaMessage /
      // SendWhatsAppOficialMessage). O retorno é uma instância Sequelize
      // Message, sem a chave `key` do proto do Baileys, então chamar
      // verifyMessage/verifyMediaMessage aqui quebra com
      // "Cannot read properties of undefined (reading 'id'/'fromMe')" e faz
      // o schedule ser marcado como ERRO mesmo tendo sido enviado.
      const isBaileys =
        whatsapp.channel !== "wacalls" &&
        whatsapp.channel !== "whatsapp_oficial";

      if (isBaileys) {
        if (schedule.mediaPath) {
          await verifyMediaMessage(
            sentMessage,
            ticket,
            ticket.contact,
            null,
            true,
            false,
            whatsapp
          );
        } else {
          await verifyMessage(
            sentMessage,
            ticket,
            ticket.contact,
            null,
            true,
            false
          );
        }
      }

      // if (ticket) {
      //   await UpdateTicketService({
      //     ticketData: {
      //       sendFarewellMessage: false,
      //       status: schedule.statusTicket,
      //       userId: schedule.ticketUserId || null,
      //       queueId: schedule.queueId || null
      //     },
      //     ticketId: ticket.id,
      //     companyId: ticket.companyId
      //   })
      // }
    } else {

      const dataAgendamento = await agendamentoContato(schedule);
      let bodySchedule = schedule.body.replace("{{dataAgendamento}}", dataAgendamento);
      bodySchedule = aplicarDadosAgendamento(bodySchedule, scheduleRecord || schedule);
      bodySchedule = `${formatBody(bodySchedule, null)}`;


      await SendMessage(
        whatsapp,
        {
          number: schedule.contact.number,
          body: bodySchedule,
          mediaPath: filePath,
          companyId: schedule.companyId
        },
        schedule.contact.isGroup
      );
    }

    if (
      schedule.valorIntervalo > 0 &&
      (isNil(schedule.contadorEnvio) ||
        schedule.contadorEnvio < schedule.enviarQuantasVezes)
    ) {
      let unidadeIntervalo;
      switch (schedule.intervalo) {
        case 1:
          unidadeIntervalo = "days";
          break;
        case 2:
          unidadeIntervalo = "weeks";
          break;
        case 3:
          unidadeIntervalo = "months";
          break;
        case 4:
          unidadeIntervalo = "minuts";
          break;
        default:
          throw new Error("Intervalo inválido");
      }

      function isDiaUtil(date) {
        const dayOfWeek = date.day();
        return dayOfWeek >= 1 && dayOfWeek <= 5; // 1 é segunda-feira, 5 é sexta-feira
      }

      function proximoDiaUtil(date) {
        let proximoDia = date.clone();
        do {
          proximoDia.add(1, "day");
        } while (!isDiaUtil(proximoDia));
        return proximoDia;
      }

      // Função para encontrar o dia útil anterior
      function diaUtilAnterior(date) {
        let diaAnterior = date.clone();
        do {
          diaAnterior.subtract(1, "day");
        } while (!isDiaUtil(diaAnterior));
        return diaAnterior;
      }

      const dataExistente = new Date(schedule.sendAt);
      const hora = dataExistente.getHours();
      const fusoHorario = dataExistente.getTimezoneOffset();

      // Realizar a soma da data com base no intervalo e valor do intervalo
      let novaData = new Date(dataExistente); // Clone da data existente para não modificar a original

      if (unidadeIntervalo !== "minuts") {
        novaData.setDate(
          novaData.getDate() +
          schedule.valorIntervalo *
          (unidadeIntervalo === "days"
            ? 1
            : unidadeIntervalo === "weeks"
              ? 7
              : 30)
        );
      } else {
        novaData.setMinutes(
          novaData.getMinutes() + Number(schedule.valorIntervalo)
        );
      }

      if (schedule.tipoDias === 5 && !isDiaUtil(novaData)) {
        novaData = diaUtilAnterior(novaData);
      } else if (schedule.tipoDias === 6 && !isDiaUtil(novaData)) {
        novaData = proximoDiaUtil(novaData);
      }

      novaData.setHours(hora);
      novaData.setMinutes(novaData.getMinutes() - fusoHorario);

      await scheduleRecord?.update({
        status: "PENDENTE",
        contadorEnvio: schedule.contadorEnvio + 1,
        sendAt: new Date(novaData.toISOString().slice(0, 19).replace("T", " ")) // Mantendo o formato de hora
      });
    } else {
      await scheduleRecord?.update({
        sentAt: new Date(moment().format("YYYY-MM-DD HH:mm")),
        status: "ENVIADA"
      });
    }
    logger.info(`Mensagem agendada enviada para: ${schedule.contact.name}`);
    sendScheduledMessages.clean(15000, "completed");
  } catch (e: any) {
    Sentry.captureException(e);
    await scheduleRecord?.update({
      status: "ERRO"
    });
    logger.error("SendScheduledMessage -> SendMessage: error", e.message);
    throw e;
  }
}

// Função para buscar o agendamento de um contato e retornar a data/hora no formato brasileiro
export const agendamentoContato = async (schedule: Schedule): Promise<string> => {
  try {
    const sendAt = schedule?.sendAt;
    if (!sendAt) return null;

    // Cria um objeto Date a partir do sendAt
    const dateObj = new Date(sendAt);

    // Converte para o fuso horário de Brasília (UTC-3)
    const brasiliaDate = new Date(dateObj.getTime() - (3 * 60 * 60 * 1000));

    // Extrai os componentes da data de Brasília
    const dia = String(brasiliaDate.getUTCDate()).padStart(2, '0');
    const mes = String(brasiliaDate.getUTCMonth() + 1).padStart(2, '0');
    const ano = brasiliaDate.getUTCFullYear();
    const hora = String(brasiliaDate.getUTCHours()).padStart(2, '0');
    const minuto = String(brasiliaDate.getUTCMinutes()).padStart(2, '0');

    return `${dia}/${mes}/${ano} às ${hora}:${minuto}hs`;
  } catch (error) {
    console.error("Erro ao buscar agendamento do contato:", error);
    return null;
  }
};

// Helper: extract {{n}} variable numbers from text
function extractTemplateVarsFromText(text: string): string[] {
  const normalizedText = String(text || "")
    .replace(/%7B/gi, "{")
    .replace(/%7D/gi, "}");
  const regex = /\{\{\s*(\d+)\s*\}\}/g;
  const vars: string[] = [];
  let m;
  while ((m = regex.exec(normalizedText)) !== null) {
    if (!vars.includes(m[1])) vars.push(m[1]);
  }
  return vars;
}

function hasTemplatePlaceholder(value: string): boolean {
  return /\{\{\s*\d+\s*\}\}/.test(String(value || "").replace(/%7B/gi, "{").replace(/%7D/gi, "}"));
}

function normalizeUrlTemplateParam(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? encodeURI(trimmed) : encodeURIComponent(trimmed).replace(/%2F/gi, "/");
}

function escapeRegExp(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceTemplateVar(text: string, key: string, value: string, urlMode = false): string {
  const source = String(text || "");
  const safeKey = escapeRegExp(key);
  const safeValue = escapeRegExp(value);
  const replacement = urlMode ? normalizeUrlTemplateParam(value) : value;
  const raw = `\\{\\{\\s*${safeKey}\\s*\\}\\}`;
  const encoded = `%7B%7B${safeKey}%7D%7D`;
  return source
    .replace(new RegExp(`${encoded}${safeValue}`, "gi"), replacement)
    .replace(new RegExp(`${raw}${safeValue}`, "g"), replacement)
    .replace(new RegExp(`${encoded}${raw}`, "gi"), replacement)
    .replace(new RegExp(raw, "g"), replacement)
    .replace(new RegExp(encoded, "gi"), replacement);
}

// ===== Função auxiliar para dispatch via API Oficial =====
async function handleDispatchCampaignOficial(campaign, campaignShipping, chatId) {
  const whatsapp = campaign.whatsapp;
  
  // Criar ou encontrar contato
  const [contact] = await Contact.findOrCreate({
    where: {
      number: campaignShipping.number,
      companyId: campaign.companyId
    },
    defaults: {
      companyId: campaign.companyId,
      name: campaignShipping.contact ? campaignShipping.contact.name : "Contato da Campanha",
      number: campaignShipping.number,
      email: campaignShipping.contact ? campaignShipping.contact.email : "",
      whatsappId: campaign.whatsappId,
      profilePicUrl: ""
    }
  });

  // Criar ticket se necessário
  let ticket = null;
  if (campaign.openTicket === "enabled") {
    ticket = await Ticket.findOne({
      where: {
        contactId: contact.id,
        companyId: campaign.companyId,
        whatsappId: whatsapp.id,
        status: ["open", "pending"]
      }
    });

    if (!ticket) {
      ticket = await Ticket.create({
        companyId: campaign.companyId,
        contactId: contact.id,
        whatsappId: whatsapp.id,
        queueId: campaign?.queueId,
        userId: campaign?.userId,
        status: campaign?.statusTicket,
        channel: "whatsapp_oficial"
      });
    }

    ticket = await ShowTicketService(ticket.id, campaign.companyId);
  } else {
    // Mesmo sem abrir ticket, precisamos de um ticket temporário para enviar via API Oficial
    ticket = await Ticket.findOne({
      where: {
        contactId: contact.id,
        companyId: campaign.companyId,
        whatsappId: whatsapp.id
      },
      order: [["createdAt", "DESC"]]
    });

    if (!ticket) {
      ticket = await Ticket.create({
        companyId: campaign.companyId,
        contactId: contact.id,
        whatsappId: whatsapp.id,
        status: "closed",
        channel: "whatsapp_oficial"
      });
    }

    ticket = await ShowTicketService(ticket.id, campaign.companyId);
  }

  // Verificar se tem template configurado
  if (campaign.templateId) {
    const template = await QuickMessage.findByPk(campaign.templateId, {
      include: [{ model: QuickMessageComponent, as: "components" }]
    });

    if (template) {
      logger.info(`[DISPATCH-CAMPAIGN-OFICIAL] Enviando template "${template.shortcode}" para ${campaignShipping.number}`);
      logger.info(`[DISPATCH-CAMPAIGN-OFICIAL] Número final enviado à API: ${campaignShipping.number} → +${campaignShipping.number}`);
      
      const templateData = {
        name: template.shortcode,
        language: { code: template.language || "pt_BR" }
      };

      // Processar componentes do template com variáveis salvas
      const components = [];
      const savedVarsRaw = campaign.templateVariables ? JSON.parse(campaign.templateVariables) : {};

      // Carregar variáveis da campanha + contato para substituir tokens dinâmicos
      // ({nome}, {primeiroNome}, {email}, {numero}, {greeting}, {protocol}, {custom})
      // dentro de cada valor de variável de template antes de enviar à Meta.
      let dynamicVars: any[] = [];
      try {
        const settingsForVars = await getSettings(campaign);
        dynamicVars = Array.isArray(settingsForVars?.variables) ? settingsForVars.variables : [];
      } catch (e) {
        dynamicVars = [];
      }
      const contactForVars =
        campaignShipping.contact ||
        ({ name: "", email: "", number: campaignShipping.number } as any);

      // Normalizar: aplicar substituição de tokens dinâmicos e descartar vazios
      const savedVars: Record<string, string> = {};
      for (const key of Object.keys(savedVarsRaw)) {
        const raw = String(savedVarsRaw[key] || '');
        const processed = getProcessedMessage(raw, dynamicVars, contactForVars);
        const val = (processed || '').trim();
        if (val) savedVars[key] = val;
      }

      logger.info(`[DISPATCH-CAMPAIGN-OFICIAL] savedVars processados: ${JSON.stringify(savedVars)}`);

      if (template.components && template.components.length > 0) {
        template.components.forEach(comp => {
          const componentType = comp.type?.toLowerCase();

          // Header de texto com variáveis
          if (componentType === "header" && comp.format === "TEXT" && comp.text) {
            const headerVars = extractTemplateVarsFromText(comp.text);
            if (headerVars.length > 0) {
              const params = headerVars.map(num => ({
                type: "text",
                text: savedVars[num] || `{{${num}}}`
              }));
              const hasInvalidParam = params.some(p => !p.text || p.text.trim() === '' || hasTemplatePlaceholder(p.text));
              if (hasInvalidParam) {
                logger.warn(`[DISPATCH-CAMPAIGN-OFICIAL] Header com parâmetro vazio/placeholder. savedVars=${JSON.stringify(savedVars)}, headerVars=${JSON.stringify(headerVars)}. Omitindo componente header para evitar erro 400.`);
              } else {
                components.push({ type: "header", parameters: params });
              }
            }
          }

          // Body com variáveis
          if (componentType === "body") {
            const bodyVars = extractTemplateVarsFromText(comp.text || "");
            if (bodyVars.length > 0) {
              // Resolver variável: salvas > mensagem do contato > placeholder
              const cleanMessage = campaignShipping.message?.replace(/\u200c\s?/, '').trim() || '';
              const params = bodyVars.map(num => {
                const resolved = savedVars[num] || (bodyVars.length === 1 ? cleanMessage : '') || `{{${num}}}`;
                return { type: "text", text: resolved };
              });
              // Só adicionar se todos os params têm texto válido
              const hasEmptyParam = params.some(p => !p.text || p.text.trim() === '' || hasTemplatePlaceholder(p.text));
              if (hasEmptyParam) {
                logger.warn(`[DISPATCH-CAMPAIGN-OFICIAL] Body com parâmetro vazio/placeholder. savedVars=${JSON.stringify(savedVars)}, bodyVars=${JSON.stringify(bodyVars)}, message="${cleanMessage}". Omitindo componente body para evitar erro 400.`);
              } else {
                components.push({ type: "body", parameters: params });
              }
            }
            // Se o template não tem variáveis no body, não enviar parâmetros
            // A Meta rejeita componentes com parâmetros quando o template não os espera
          }

          // Footer com variáveis
          if (componentType === "footer" && comp.text) {
            const footerVars = extractTemplateVarsFromText(comp.text);
            if (footerVars.length > 0) {
              const params = footerVars.map(num => ({
                type: "text",
                text: savedVars[num] || `{{${num}}}`
              }));
              const hasInvalidParam = params.some(p => !p.text || p.text.trim() === '' || hasTemplatePlaceholder(p.text));
              if (hasInvalidParam) {
                logger.warn(`[DISPATCH-CAMPAIGN-OFICIAL] Footer com parâmetro vazio/placeholder. savedVars=${JSON.stringify(savedVars)}, footerVars=${JSON.stringify(footerVars)}. Omitindo componente footer para evitar erro 400.`);
              } else {
                components.push({ type: "footer", parameters: params });
              }
            }
          }

          // Botões com variáveis (URL buttons com {{n}} no sufixo)
          if (componentType === "buttons" && comp.buttons) {
            try {
              const parsedBtns = typeof comp.buttons === "string"
                ? JSON.parse(comp.buttons)
                : comp.buttons;
              const btnArr = Array.isArray(parsedBtns) ? parsedBtns : [parsedBtns];
              btnArr.forEach((btn: any, idx: number) => {
                const btnType = (btn?.type || "").toLowerCase();
                const urlText = btn?.url || btn?.text || "";
                const btnVars = extractTemplateVarsFromText(urlText);
                if (btnType === "url" && btnVars.length > 0) {
                  const params = btnVars.map(num => ({
                    type: "text",
                    text: normalizeUrlTemplateParam(savedVars[num] || "")
                  }));
                  const hasInvalidParam = params.some(p => !p.text || p.text.trim() === '' || hasTemplatePlaceholder(p.text));
                  if (hasInvalidParam) {
                    logger.warn(`[DISPATCH-CAMPAIGN-OFICIAL] Botão URL com parâmetro vazio/placeholder. savedVars=${JSON.stringify(savedVars)}, buttonVars=${JSON.stringify(btnVars)}, index=${idx}. Omitindo componente button para evitar erro 400.`);
                  } else {
                    components.push({
                      type: "button",
                      sub_type: "url",
                      index: String(idx),
                      parameters: params
                    });
                  }
                }
              });
            } catch (e) {
              logger.warn(`[DISPATCH-CAMPAIGN-OFICIAL] Erro ao processar variáveis de botões: ${e.message}`);
            }
          }
        });
      }

      // Adicionar mídia como HEADER component
      // Prioridade: 1) mídia anexada manualmente na campanha
      //             2) mídia salva no próprio template (QuickMessage)
      //             3) URL de exemplo (header_handle) que veio da Meta no componente
      {
        const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
        const proxyPort = process.env.PROXY_PORT;
        const baseUrl = proxyPort ? `${backendUrl}:${proxyPort}` : backendUrl;

        // Detectar header de mídia do template
        const headerComp = template.components?.find(
          c => c.type?.toLowerCase() === "header" &&
               ["IMAGE", "VIDEO", "DOCUMENT"].includes((c.format || "").toUpperCase())
        );
        const headerFormat = headerComp ? (headerComp.format || "").toUpperCase() : null;

        let mediaUrl: string | null = null;
        let mediaType: string | null = null;
        let mediaFilename: string | null = null;
        let mediaSource = "";

        if (campaign.mediaPath) {
          // 1) Mídia da campanha (manual)
          mediaUrl = `${baseUrl}/public/company${campaign.companyId}/${campaign.mediaPath}`;
          mediaFilename = campaign.mediaName || null;
          if (headerFormat) {
            mediaType = headerFormat.toLowerCase();
          } else {
            const ext = campaign.mediaPath.split(".").pop()?.toLowerCase();
            mediaType = "image";
            if (["mp4", "3gp", "webm"].includes(ext)) mediaType = "video";
            else if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) mediaType = "document";
          }
          mediaSource = "campanha";
        } else if (headerFormat) {
          // 2) Mídia salva no próprio template
          const tplMediaRaw = (template as any).getDataValue?.("mediaPath");
          if (tplMediaRaw) {
            mediaUrl = `${baseUrl}/public/company${template.companyId}/quickMessage/${tplMediaRaw}`;
            mediaFilename = (template as any).getDataValue?.("mediaName") || tplMediaRaw;
            mediaType = headerFormat.toLowerCase();
            mediaSource = "template";
          } else if (headerComp?.example) {
            // 3) Exemplo da Meta (header_handle / sample). Pode ser JSON ou string.
            let sampleUrl: string | null = null;
            try {
              const parsed = JSON.parse(headerComp.example);
              if (Array.isArray(parsed?.header_handle) && parsed.header_handle[0]) {
                sampleUrl = parsed.header_handle[0];
              } else if (typeof parsed === "string") {
                sampleUrl = parsed;
              }
            } catch {
              if (headerComp.example.startsWith("http")) sampleUrl = headerComp.example;
            }
            if (sampleUrl) {
              mediaUrl = sampleUrl;
              mediaType = headerFormat.toLowerCase();
              mediaFilename = "sample";
              mediaSource = "exemplo-meta";
            }
          }
        }

        if (mediaUrl && mediaType) {
          logger.info(`[DISPATCH-CAMPAIGN-OFICIAL] Incluindo mídia ${mediaType} no header (origem: ${mediaSource}): ${mediaUrl}`);
          const headerParam: any = { type: mediaType };
          if (mediaType === "image") {
            headerParam.image = { link: mediaUrl };
          } else if (mediaType === "video") {
            headerParam.video = { link: mediaUrl };
          } else {
            headerParam.document = { link: mediaUrl, filename: mediaFilename || "document" };
          }
          components.push({ type: "header", parameters: [headerParam] });
        } else if (headerFormat) {
          logger.warn(`[DISPATCH-CAMPAIGN-OFICIAL] Template "${template.shortcode}" exige header ${headerFormat}, mas nenhuma mídia foi encontrada (campanha sem mediaPath e template sem mediaPath/example).`);
        }
      }

      if (components.length > 0) {
        (templateData as any).components = components;
      }

      // Garantir que ticket.whatsapp está carregado (necessário para token na API Oficial)
      if (ticket && !ticket.whatsapp) {
        ticket.whatsapp = campaign.whatsapp;
      }

      // Construir body no formato esperado pelo frontend: texto||||buttonsJSON
      let bodyText = "";
      let buttonsToSave: any[] = [];

      if (template.components && template.components.length > 0) {
        for (const comp of template.components) {
          if (comp.type?.toUpperCase() === "BODY") {
            bodyText = comp.text || "";
          }
          if (comp.type?.toUpperCase() === "BUTTONS" && comp.buttons) {
            try {
              const parsed = typeof comp.buttons === "string" ? JSON.parse(comp.buttons) : comp.buttons;
              buttonsToSave = Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
              logger.warn(`[DISPATCH-CAMPAIGN-OFICIAL] Erro ao parsear botões: ${e.message}`);
            }
          }
        }
      }

      // Substituir variáveis no body text ({{1}}, {{2}}, etc.)
      for (const [key, value] of Object.entries(savedVars)) {
        bodyText = replaceTemplateVar(bodyText, key, value);
        // Também substituir nos textos/URLs dos botões para exibição local
        buttonsToSave = buttonsToSave.map((b: any) => ({
          ...b,
          text: typeof b?.text === "string" ? replaceTemplateVar(b.text, key, value) : b?.text,
          url: typeof b?.url === "string" ? replaceTemplateVar(b.url, key, value, true) : b?.url,
        }));
      }

      const formattedBody = buttonsToSave.length > 0
        ? `${bodyText}||||${JSON.stringify(JSON.stringify(buttonsToSave))}`
        : bodyText || campaignShipping.message || template.message || "";

      logger.info(`[DISPATCH-CAMPAIGN-OFICIAL] Body formatado para salvar: ${formattedBody.substring(0, 200)}`);

      await SendWhatsAppOficialMessage({
        body: formattedBody,
        ticket,
        type: "template",
        template: templateData,
        quotedMsg: null,
        media: null,
        vCard: null
      });

      // Follow-up NÃO é suportado em campanhas via API Oficial.
      // O recurso de follow-up (mensagens 2-5) está disponível apenas para canais Baileys.
      // Aqui apenas registramos o envio do template e encerramos.
      logger.info(
        `[DISPATCH-CAMPAIGN-OFICIAL] Template enviado para ${campaignShipping.number}. Follow-up não é suportado via API Oficial — apenas Baileys.`
      );

      return;
    }
  }

  // Sem template configurado - não enviar texto via API Oficial (falha fora da janela de 24h)
  logger.error(`[DISPATCH-CAMPAIGN-OFICIAL] Campanha ${campaign.id} sem template para ${campaignShipping.number}. Envio cancelado - API Oficial requer template fora da janela de 24h.`);
  throw new Error("Campanha via API Oficial requer um template configurado. Configure um template aprovado na campanha.");
}

/**
 * Disparo de campanha pelo canal "wacalls" (backend wacalls-chat). Igual ao
 * fluxo Baileys — texto livre, sem exigir template — mas envia por
 * SendWacallsText/SendWacallsMediaMessage (SendWacallsMessageService.ts) em
 * vez de wbot.sendMessage, já que conexões wacalls não têm sessão Baileys
 * (GetWhatsappWbot não funciona pra esse canal).
 */
async function handleDispatchCampaignWacalls(campaign, campaignShipping, chatId) {
  const whatsapp = campaign.whatsapp;

  const [contact] = await Contact.findOrCreate({
    where: {
      number: campaignShipping.number,
      companyId: campaign.companyId
    },
    defaults: {
      companyId: campaign.companyId,
      name: campaignShipping.contact ? campaignShipping.contact.name : "Contato da Campanha",
      number: campaignShipping.number,
      email: campaignShipping.contact ? campaignShipping.contact.email : "",
      whatsappId: campaign.whatsappId,
      profilePicUrl: "",
      channel: "wacalls"
    } as any
  });

  let ticket = await Ticket.findOne({
    where: {
      contactId: contact.id,
      companyId: campaign.companyId,
      whatsappId: whatsapp.id,
      ...(campaign.openTicket === "enabled" ? { status: ["open", "pending"] } : {})
    },
    order: [["createdAt", "DESC"]]
  });

  if (!ticket) {
    ticket = await Ticket.create({
      companyId: campaign.companyId,
      contactId: contact.id,
      whatsappId: whatsapp.id,
      queueId: campaign?.queueId,
      userId: campaign?.userId,
      status: campaign.openTicket === "enabled" ? campaign?.statusTicket : "closed",
      channel: "wacalls"
    } as any);
  }

  ticket = await ShowTicketService(ticket.id, campaign.companyId);
  if (ticket && !ticket.whatsapp) (ticket as any).whatsapp = whatsapp;
  if (ticket && !ticket.contact) (ticket as any).contact = contact;

  if (campaign.confirmation && campaignShipping.confirmation === null) {
    await SendWacallsText({ ticket, body: campaignShipping.confirmationMessage });
    await campaignShipping.update({ confirmationRequestedAt: moment() });
    return;
  }

  const effMediaPath = (campaignShipping as any).mediaPath || campaign.mediaPath;
  const effMediaName = (campaignShipping as any).mediaName || campaign.mediaName;

  if (!effMediaPath) {
    await SendWacallsText({ ticket, body: campaignShipping.message });
  } else {
    const publicFolder = path.resolve(__dirname, "..", "public");
    const filePath = path.join(publicFolder, `company${campaign.companyId}`, effMediaPath);

    if (!fs.existsSync(filePath)) {
      logger.warn(`[DISPATCH-CAMPAIGN-WACALLS] Mídia não encontrada (path=${filePath}), enviando só o texto.`);
      await SendWacallsText({ ticket, body: campaignShipping.message });
    } else {
      const mimetype = (mime.lookup(filePath) || "application/octet-stream") as string;
      const fakeFile: any = {
        fieldname: "file",
        originalname: effMediaName || path.basename(filePath),
        encoding: "7bit",
        mimetype,
        size: fs.statSync(filePath).size,
        destination: publicFolder,
        filename: path.basename(filePath),
        path: filePath
      };
      await SendWacallsMediaMessage({ ticket, media: fakeFile, body: campaignShipping.message });
    }
  }

  await campaignShipping.update({ deliveredAt: moment() });
}

async function getCampaign(id, useCache = true) {
  if (useCache) {
    const cached = getCachedCampaign(id);
    if (cached) return cached;
  }

  const campaign = await Campaign.findOne({
    where: { id },
    include: [
      {
        model: ContactList,
        as: "contactList",
        attributes: ["id", "name"],
        required: false, // LEFT JOIN para campanhas que podem usar tags
        include: [
          {
            model: ContactListItem,
            as: "contacts",
            attributes: [
              "id",
              "name",
              "number",
              "email",
              "isWhatsappValid",
              "isGroup"
            ],
            // Sem filtro de isWhatsappValid — todos os contatos serão incluídos
            // Números inválidos serão tratados individualmente no envio
            required: false
          }
        ]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        // wacallsChatSessionId é obrigatório aqui: a campanha de voz precisa
        // saber com qual sessão do microserviço falar para discar. Sem esta
        // coluna na lista, o campo chegava vazio e toda ligação falhava com
        // "Conexão WhatsApp Plus sem sessão pareada" — mesmo com a conexão
        // pareada e saudável no banco.
        attributes: [
          "id",
          "name",
          "channel",
          "token",
          "status",
          "wacallsChatSessionId"
        ]
      }
    ]
  });

  if (!campaign) {
    return null;
  }

  // Normalizar tagListId: tratar "none", "null", "" e strings inválidas como ausência de tag
  const rawTagId: any = (campaign as any).tagListId;
  const parsedTagId =
    rawTagId !== null &&
    rawTagId !== undefined &&
    rawTagId !== "" &&
    rawTagId !== "none" &&
    rawTagId !== "null" &&
    !Number.isNaN(Number(rawTagId))
      ? Number(rawTagId)
      : null;

  // Se a campanha usa tagListId válido em vez de contactListId, buscar contatos por tag
  if (parsedTagId && !campaign.contactListId) {
    logger.info(`[TAG-CAMPAIGN] Buscando contatos por tagId: ${parsedTagId} para campanha: ${id}`);

    // Buscar contatos pela tag usando JOIN direto (evita N+1 queries)
    const contacts = await Contact.findAll({
      attributes: [
        "id",
        "name",
        "number",
        "email",
        "isGroup"
      ],
      where: {
        companyId: campaign.companyId,
        active: true
      },
      include: [{
        model: ContactTag,
        as: "contactTags",
        where: { tagId: parsedTagId },
        attributes: [],
        required: true
      }]
    });

    logger.info(`[TAG-CAMPAIGN] ${contacts.length} contatos encontrados para tag ${parsedTagId} na campanha ${id}`);

    // Estruturar os dados no mesmo formato que ContactListItem para compatibilidade
    const formattedContacts = contacts.map(contact => ({
      id: contact.id,
      name: contact.name,
      number: contact.number,
      email: contact.email,
      isWhatsappValid: true, // Assumir válido se está na lista de contatos
      isGroup: contact.isGroup || false
    }));

    // Criar uma estrutura similar à contactList para compatibilidade
    // Usando any para contornar a tipagem rígida do Sequelize
    (campaign as any).contactList = {
      id: null,
      name: `Tag ${parsedTagId}`,
      contacts: formattedContacts
    };
  }

  setCachedCampaign(id, campaign);
  return campaign;
}

async function getContact(id, campaignId = null) {
  const cacheKey = `${id}:${campaignId}`;
  const cached = getCachedContact(cacheKey);
  if (cached) return cached;

  // Reusar campanha do cache para evitar query extra
  let companyId = null;
  let isTagCampaign = false;
  if (campaignId) {
    const cachedCampaign = getCachedCampaign(campaignId);
    if (cachedCampaign) {
      companyId = cachedCampaign.companyId;
      isTagCampaign = cachedCampaign.tagListId && !cachedCampaign.contactListId;
    } else {
      const campaign = await Campaign.findByPk(campaignId, {
        attributes: ["companyId", "tagListId", "contactListId"]
      });
      if (campaign) {
        companyId = campaign.companyId;
        isTagCampaign = campaign.tagListId && !campaign.contactListId;
      }
    }
  }

  let result = null;

  if (isTagCampaign) {
    const whereClause = companyId ? { id, companyId } : { id };
    result = await Contact.findOne({
      where: whereClause,
      attributes: ["id", "name", "number", "email", "isGroup"]
    });
    if (!result) {
      logger.error(`[CAMPAIGN] Contato ${id} não encontrado (tag, company: ${companyId})`);
    }
  } else {
    result = await ContactListItem.findByPk(id, {
      attributes: ["id", "name", "number", "email", "isGroup"]
    });
    if (!result) {
      const whereClause = companyId ? { id, companyId } : { id };
      result = await Contact.findOne({
        where: whereClause,
        attributes: ["id", "name", "number", "email", "isGroup"]
      });
      if (!result) {
        logger.error(`[CAMPAIGN] Contato ${id} não encontrado em nenhuma tabela (company: ${companyId})`);
      }
    }
  }

  if (result) setCachedContact(cacheKey, result);
  return result;
}

async function getSettings(campaign): Promise<CampaignSettings> {
  // Cache de settings por empresa (TTL 5 min) — evita query por job
  const cached = getCachedSettings(campaign.companyId);
  if (cached) return cached;

  try {
    const settings = await CampaignSetting.findAll({
      where: { companyId: campaign.companyId },
      attributes: ["key", "value"]
    });

    let messageInterval: number = 20;
    let longerIntervalAfter: number = 20;
    let greaterInterval: number = 60;
    let jitterPercent: number = 40;
    let longPauseEvery: number = 50;
    let longPauseDuration: number = 30;
    let cooldownDays: number = 0;
    let errorPauseThreshold: number = 30;
    let errorPauseMinAttempts: number = 10;
    let variables: any[] = [];

    settings.forEach(setting => {
      try {
        const val = JSON.parse(setting.value);
        if (setting.key === "messageInterval") messageInterval = val;
        else if (setting.key === "longerIntervalAfter") longerIntervalAfter = val;
        else if (setting.key === "greaterInterval") greaterInterval = val;
        else if (setting.key === "jitterPercent") jitterPercent = val;
        else if (setting.key === "longPauseEvery") longPauseEvery = val;
        else if (setting.key === "longPauseDuration") longPauseDuration = val;
        else if (setting.key === "cooldownDays") cooldownDays = Number(val) || 0;
        else if (setting.key === "errorPauseThreshold") errorPauseThreshold = Number(val) || 0;
        else if (setting.key === "errorPauseMinAttempts") errorPauseMinAttempts = Number(val) || 10;
        else if (setting.key === "variables") variables = val;
      } catch (_) {}
    });

    const result: CampaignSettings = {
      messageInterval,
      longerIntervalAfter,
      greaterInterval,
      jitterPercent,
      longPauseEvery,
      longPauseDuration,
      cooldownDays,
      errorPauseThreshold,
      errorPauseMinAttempts,
      variables
    };

    setCachedSettings(campaign.companyId, result);
    return result;
  } catch (error) {
    logger.error(`[CAMPAIGN] Erro ao buscar settings: ${error.message}`);
    throw error;
  }
}

export function parseToMilliseconds(seconds) {
  return seconds * 1000;
}

async function sleep(seconds) {
  logger.info(
    `Sleep de ${seconds} segundos iniciado: ${moment().format("HH:mm:ss")}`
  );
  return new Promise(resolve => {
    setTimeout(() => {
      logger.info(
        `Sleep de ${seconds} segundos finalizado: ${moment().format(
          "HH:mm:ss"
        )}`
      );
      resolve(true);
    }, parseToMilliseconds(seconds));
  });
}

function getCampaignValidMessages(campaign) {
  const messages = [];

  if (!isEmpty(campaign.message1) && !isNil(campaign.message1)) {
    messages.push(campaign.message1);
  }

  if (!isEmpty(campaign.message2) && !isNil(campaign.message2)) {
    messages.push(campaign.message2);
  }

  if (!isEmpty(campaign.message3) && !isNil(campaign.message3)) {
    messages.push(campaign.message3);
  }

  if (!isEmpty(campaign.message4) && !isNil(campaign.message4)) {
    messages.push(campaign.message4);
  }

  if (!isEmpty(campaign.message5) && !isNil(campaign.message5)) {
    messages.push(campaign.message5);
  }

  return messages;
}

function getCampaignValidConfirmationMessages(campaign) {
  const messages = [];

  if (
    !isEmpty(campaign.confirmationMessage1) &&
    !isNil(campaign.confirmationMessage1)
  ) {
    messages.push(campaign.confirmationMessage1);
  }

  if (
    !isEmpty(campaign.confirmationMessage2) &&
    !isNil(campaign.confirmationMessage2)
  ) {
    messages.push(campaign.confirmationMessage2);
  }

  if (
    !isEmpty(campaign.confirmationMessage3) &&
    !isNil(campaign.confirmationMessage3)
  ) {
    messages.push(campaign.confirmationMessage3);
  }

  if (
    !isEmpty(campaign.confirmationMessage4) &&
    !isNil(campaign.confirmationMessage4)
  ) {
    messages.push(campaign.confirmationMessage4);
  }

  if (
    !isEmpty(campaign.confirmationMessage5) &&
    !isNil(campaign.confirmationMessage5)
  ) {
    messages.push(campaign.confirmationMessage5);
  }

  return messages;
}

function getProcessedMessage(msg: string, variables: any[], contact: any) {
  // Passou a delegar para helpers/VariaveisDeCampanha, o MESMO resolvedor que
  // o follow-up usa.
  //
  // Antes esta função e o SendCampaignFollowUps tinham cada uma a sua lista de
  // variáveis, feita à mão — e elas divergiram: aqui havia {atendente},
  // {greeting} e {protocol}, lá não. A mesma mensagem funcionava no disparo e
  // chegava crua no follow-up. Nenhuma das duas aceitava chave dupla
  // ({{nome}}), que é como o resto da plataforma escreve; pior, a troca de
  // {nome} dentro de {{nome}} deixava chaves órfãs no texto ("{Maria}").
  //
  // Mantendo uma implementação só, as duas telas não podem mais divergir.
  return aplicarVariaveisDeCampanha(msg, contact, variables);
}

const checkerWeek = async () => {
  const sab = moment().day() === 6;
  const dom = moment().day() === 0;

  const sabado = await CampaignSetting.findOne({
    where: { key: "sabado" }
  });

  const domingo = await CampaignSetting.findOne({
    where: { key: "domingo" }
  });

  if (sabado?.value === "false" && sab) {
    messageQueue.pause();
    return true;
  }

  if (domingo?.value === "false" && dom) {
    messageQueue.pause();
    return true;
  }

  messageQueue.resume();
  return false;
};

const checkTime = async () => {
  const startHour = await CampaignSetting.findOne({
    where: {
      key: "startHour"
    }
  });

  const endHour = await CampaignSetting.findOne({
    where: {
      key: "endHour"
    }
  });

  const hour = startHour.value as unknown as number;
  const endHours = endHour.value as unknown as number;

  const timeNow = moment().format("HH:mm") as unknown as number;

  if (timeNow <= endHours && timeNow >= hour) {
    messageQueue.resume();

    return true;
  }

  logger.info(
    `Envio inicia as ${hour} e termina as ${endHours}, hora atual ${timeNow} não está dentro do horário`
  );
  messageQueue.clean(0, "delayed");
  messageQueue.clean(0, "wait");
  messageQueue.clean(0, "active");
  messageQueue.clean(0, "completed");
  messageQueue.clean(0, "failed");
  messageQueue.pause();

  return false;
};

// const checkerLimitToday = async (whatsappId: number) => {
//   try {

//     const setting = await SettingMessage.findOne({
//       where: { whatsappId: whatsappId }
//     });

//     const lastUpdate = moment(setting.dateStart);

//     const now = moment();

//     const passou = now.isAfter(lastUpdate, "day");

//     if (setting.sendToday <= setting.limit) {
//       await setting.update({
//         dateStart: moment().format()
//       });

//       return true;
//     }

//     const zerar = true
//     if(passou) {
//       await setting.update({
//         sendToday: 0,
//         dateStart: moment().format()
//       });

//       setting.reload();
//     }

//     setting.reload();

//     logger.info(`Enviada hoje ${setting.sendToday} limite ${setting.limit}`);
//     // sendMassMessage.clean(0, "delayed");
//     // sendMassMessage.clean(0, "wait");
//     // sendMassMessage.clean(0, "active");
//     // sendMassMessage.clean(0, "completed");
//     // sendMassMessage.clean(0, "failed");
//     // sendMassMessage.pause();
//     return false;
//   } catch (error) {
//     logger.error("conexão não tem configuração de envio.");
//   }
// };

export function randomValue(min, max) {
  return Math.floor(Math.random() * max) + min;
}

/**
 * Calcula um delay humanizado para disparos de campanha.
 *
 * Estratégia anti-ban:
 * 1. Jitter aleatório (±40% do intervalo base) para evitar padrão previsível
 * 2. Pausa longa a cada LONG_PAUSE_EVERY mensagens (simula comportamento humano)
 * 3. Intervalo progressivo após o limiar: sobe gradualmente em vez de salto abrupto
 * 4. Nunca cai abaixo de MIN_DELAY_MS para evitar flood
 */
export function calcHumanizedDelay(params: {
  index: number;
  messageInterval: number;       // segundos
  longerIntervalAfter: number;   // nº de msgs antes do intervalo longo
  greaterInterval: number;       // segundos (intervalo longo)
  jitterPercent?: number;        // % de variação aleatória (0-80, padrão 40)
  longPauseEvery?: number;       // pausa extra a cada N mensagens (0=desabilitado, padrão 50)
  longPauseDuration?: number;    // duração em segundos da pausa periódica (padrão 30)
}): number {
  const MIN_DELAY_MS = 5000;

  const {
    index,
    messageInterval,
    longerIntervalAfter,
    greaterInterval,
    jitterPercent = 40,
    longPauseEvery = 50,
    longPauseDuration = 30,
  } = params;

  // Base: intervalo normal ou longo com transição gradual
  let baseSeconds: number;
  if (index > longerIntervalAfter) {
    const progress = Math.min((index - longerIntervalAfter) / Math.max(longerIntervalAfter, 1), 1);
    baseSeconds = messageInterval + (greaterInterval - messageInterval) * progress;
  } else {
    baseSeconds = messageInterval;
  }

  // Jitter configurável: ±jitterPercent% aleatório
  const jitterFactor = jitterPercent > 0
    ? (1 - jitterPercent / 100) + Math.random() * (2 * jitterPercent / 100)
    : 1;
  let delayMs = baseSeconds * 1000 * jitterFactor;

  // Pausa periódica longa configurável
  if (longPauseEvery > 0 && index > 0 && index % longPauseEvery === 0) {
    const extraPause = longPauseDuration * 1000 + Math.random() * (longPauseDuration * 500);
    delayMs += extraPause;
    logger.info(`[CAMPAIGN-DELAY] Pausa longa aplicada no contato ${index} (+${Math.round(extraPause / 1000)}s)`);
  }

  return Math.max(delayMs, MIN_DELAY_MS);
}

async function verifyAndFinalizeCampaign(campaign) {
  const campaignId = campaign.id;
  
  // Verificar se já existe um processamento em andamento para esta campanha
  const existingLock = campaignVerificationLocks.get(campaignId);
  if (existingLock) {
    logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId} já está sendo processada, aguardando conclusão...`);
    try {
      await existingLock;
    } catch (err) {
      // Ignorar erros da promise anterior
    }
    return;
  }

  // Criar promise de lock
  const verificationPromise = (async () => {
    try {
      // Recarregar campanha do banco para ter dados atualizados
      const freshCampaign = await Campaign.findByPk(campaignId);
      if (!freshCampaign) {
        logger.warn(`[VERIFY CAMPAIGN] Campanha ${campaignId} não encontrada`);
        return;
      }

      // Verificar se campanha já foi finalizada
      if (freshCampaign.status === 'FINALIZADA' || freshCampaign.status === 'CANCELADA') {
        logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId} já está ${freshCampaign.status}, ignorando verificação`);
        return;
      }

      // Garantir que a campanha tenha os contatos carregados
      const campaignWithContacts = await getCampaign(campaignId);
      
      let totalContacts = 0;

      // Para campanhas por TAG, contar contatos pelo CampaignShipping
      if (freshCampaign.tagListId && !freshCampaign.contactListId) {
        totalContacts = await CampaignShipping.count({
          where: { campaignId: campaignId }
        });
      } else if (campaignWithContacts?.contactList?.contacts) {
        totalContacts = campaignWithContacts.contactList.contacts.length;
      }

      if (totalContacts === 0) {
        logger.warn(`[VERIFY CAMPAIGN] Campanha ${campaignId} não tem contatos para verificar`);
        return;
      }

      const companyId = freshCampaign.companyId;

      // Contar mensagens entregues
      const deliveredCount = await CampaignShipping.count({
        where: {
          campaignId: campaignId,
          deliveredAt: {
            [Op.ne]: null
          }
        }
      });

      const currentExecutionCount = Math.floor(deliveredCount / totalContacts);
      const remainingMessages = deliveredCount % totalContacts;

      logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId}: ${deliveredCount} mensagens entregues de ${totalContacts} contatos, ${currentExecutionCount} execuções completas, ${remainingMessages} mensagens restantes`);
      logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId}: isRecurring=${freshCampaign.isRecurring}, maxExecutions=${freshCampaign.maxExecutions}, status=${freshCampaign.status}`);

      // Para campanhas recorrentes, só atualizar executionCount quando uma execução estiver COMPLETA
      // (todas as mensagens da execução foram entregues)
      if (freshCampaign.isRecurring) {
        // Só atualizar se a execução atual está completa (sem mensagens restantes)
        if (remainingMessages === 0 && currentExecutionCount > freshCampaign.executionCount) {
          // Usar UPDATE com WHERE para garantir atomicidade
          const [updatedRows] = await Campaign.update(
            {
              executionCount: currentExecutionCount,
              lastExecutedAt: new Date()
            },
            {
              where: {
                id: campaignId,
                executionCount: { [Op.lt]: currentExecutionCount } // Apenas atualizar se ainda não foi atualizado
              }
            }
          );

          if (updatedRows > 0) {
            logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId} recorrente: execução ${currentExecutionCount} completa, executionCount atualizado de ${freshCampaign.executionCount} para ${currentExecutionCount}`);
            
            // Recarregar campanha após atualização
            await freshCampaign.reload();
          }
        } else if (remainingMessages > 0) {
          logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId} recorrente: execução ${currentExecutionCount + 1} ainda em andamento (${remainingMessages}/${totalContacts} mensagens restantes), aguardando conclusão`);
          return; // Não fazer nada enquanto a execução não estiver completa
        }
      } else {
        // Para campanhas não recorrentes, atualizar normalmente
        if (currentExecutionCount > freshCampaign.executionCount) {
          const [updatedRows] = await Campaign.update(
            {
              executionCount: currentExecutionCount,
              lastExecutedAt: new Date()
            },
            {
              where: {
                id: campaignId,
                executionCount: { [Op.lt]: currentExecutionCount }
              }
            }
          );

          if (updatedRows > 0) {
            logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId} executionCount atualizado de ${freshCampaign.executionCount} para ${currentExecutionCount}`);
            await freshCampaign.reload();
          }
        }
      }

      // Recarregar campanha do banco novamente para ter dados atualizados
      await freshCampaign.reload();
      const finalExecutionCount = freshCampaign.executionCount;

      // Verificar se deve finalizar a campanha
      if (freshCampaign.isRecurring) {
        // Verificar limite de execuções ANTES de agendar próxima
        if (freshCampaign.maxExecutions && finalExecutionCount >= freshCampaign.maxExecutions) {
          logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId} atingiu limite de ${freshCampaign.maxExecutions} execuções - finalizando`);
          
          await Campaign.update(
            {
              status: "FINALIZADA",
              completedAt: moment(),
              nextScheduledAt: null
            },
            {
              where: {
                id: campaignId,
                status: { [Op.ne]: 'FINALIZADA' } // Apenas atualizar se ainda não foi finalizada
              }
            }
          );
          
          const io = getIO();
          io.of(String(companyId)).emit(`company-${companyId}-campaign`, {
            action: "update",
            record: await Campaign.findByPk(campaignId)
          });
          return;
        }

        // Apenas agendar próxima execução se ainda não atingiu o limite
        if (finalExecutionCount < (freshCampaign.maxExecutions || Infinity)) {
          // Verificar status antes de agendar
          await freshCampaign.reload();
          
          if (freshCampaign.status !== 'FINALIZADA' && freshCampaign.status !== 'CANCELADA') {
            logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId} é recorrente - agendando próxima execução (${finalExecutionCount}/${freshCampaign.maxExecutions || 'ilimitado'})`);
            
            // Agendar próxima execução E atualizar status para PROGRAMADA
            // Isso garante que a próxima execução seja processada no horário correto
            await RecurrenceService.scheduleNextExecution(campaignId);
            
            // Garantir que o status volte para PROGRAMADA após agendar próxima execução
            await Campaign.update(
              { status: 'PROGRAMADA' },
              {
                where: {
                  id: campaignId,
                  status: 'EM_ANDAMENTO'
                }
              }
            );
            
            logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId}: status atualizado para PROGRAMADA após agendar próxima execução`);
            
            // Recarregar campanha e notificar frontend da atualização
            await freshCampaign.reload();
            const io = getIO();
            io.of(String(companyId)).emit(`company-${companyId}-campaign`, {
              action: "update",
              record: freshCampaign
            });
            logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId}: notificação enviada ao frontend com nextScheduledAt=${freshCampaign.nextScheduledAt}`);
          } else {
            logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId} está ${freshCampaign.status}, não agendando próxima execução`);
          }
        }
      } else {
        // Campanha não recorrente: finalizar quando todas as mensagens foram entregues
        if (deliveredCount >= totalContacts) {
          logger.info(`[VERIFY CAMPAIGN] Campanha ${campaignId} não é recorrente - todas as ${deliveredCount} mensagens foram entregues - finalizando`);
          
          await Campaign.update(
            {
              status: "FINALIZADA",
              completedAt: moment()
            },
            {
              where: {
                id: campaignId,
                status: { [Op.ne]: 'FINALIZADA' }
              }
            }
          );
        }
      }

      // Notificar atualização apenas uma vez
      const io = getIO();
      const updatedCampaign = await Campaign.findByPk(campaignId);
      if (updatedCampaign) {
        io.of(String(companyId)).emit(`company-${companyId}-campaign`, {
          action: "update",
          record: updatedCampaign
        });
      }
    } catch (err: any) {
      logger.error(`[VERIFY CAMPAIGN] Erro ao verificar campanha ${campaignId}: ${err.message}`);
      Sentry.captureException(err);
    } finally {
      // Remover lock após conclusão
      campaignVerificationLocks.delete(campaignId);
    }
  })();

  // Armazenar promise no map
  campaignVerificationLocks.set(campaignId, verificationPromise);

  // Aguardar conclusão
  await verificationPromise;
}

async function handleProcessCampaign(job) {
  try {
    const { id, restartMode, messageInterval: customMessageInterval, longerIntervalAfter: customLongerIntervalAfter, greaterInterval: customGreaterInterval }: ProcessCampaignData = job.data;
    const campaign = await getCampaign(id);
    
    if (!campaign) {
      logger.error(`[PROCESS-CAMPAIGN] Campanha ${id} não encontrada`);
      return;
    }

    // Verificar se campanha já foi finalizada ou cancelada
    if (campaign.status === 'FINALIZADA' || campaign.status === 'CANCELADA') {
      logger.info(`[PROCESS-CAMPAIGN] Campanha ${id} está ${campaign.status}, abortando processamento`);
      return;
    }

    // Para campanhas recorrentes, verificar se já está processando outra execução
    if (campaign.isRecurring && campaign.status !== 'EM_ANDAMENTO') {
      logger.warn(`[PROCESS-CAMPAIGN] Campanha ${id} recorrente não está com status EM_ANDAMENTO, abortando`);
      return;
    }

    const settings = await getSettings(campaign);

    // Proteção contra contactList nula (campanha sem lista ou tag não resolvida)
    if (!campaign.contactList) {
      logger.error(`[PROCESS-CAMPAIGN] Campanha ${id} não tem contactList. Verificando se é campanha de tag...`);
      // Tentar recarregar sem cache para forçar resolução de tag
      const freshCampaign = await getCampaign(id, false);
      if (!freshCampaign?.contactList) {
        logger.error(`[PROCESS-CAMPAIGN] Campanha ${id} ainda sem contactList após recarga. Abortando.`);
        return;
      }
      // Usar campanha recarregada
      Object.assign(campaign, freshCampaign);
    }

    const contacts = campaign.contactList?.contacts;

    if (isArray(contacts) && contacts.length > 0) {
      // ✅ DEDUP: remover contatos com o mesmo número que aparecem mais de uma
      // vez na lista (importação duplicada). Mantém apenas a primeira ocorrência.
      const seenNumbers = new Set<string>();
      const uniqueContacts = [];
      let duplicatesSkipped = 0;
      for (const contact of contacts) {
        const key = String(contact.number || "").replace(/\D/g, "");
        if (!key) continue;
        if (seenNumbers.has(key)) {
          duplicatesSkipped++;
          continue;
        }
        seenNumbers.add(key);
        uniqueContacts.push(contact);
      }
      if (duplicatesSkipped > 0) {
        logger.info(
          `[PROCESS-CAMPAIGN] Campanha ${campaign.id}: ${duplicatesSkipped} contato(s) duplicado(s) ignorado(s) (mesmo número).`
        );
      }

      let contactData = uniqueContacts.map(contact => ({
        contactId: contact.id,
        campaignId: campaign.id,
        variables: settings.variables,
        isGroup: contact.isGroup
      }));

        // Para campanhas recorrentes, log informativo
        if (campaign.isRecurring) {
          logger.info(`[PROCESS-CAMPAIGN] Campanha ${campaign.id} recorrente - execução ${campaign.executionCount + 1}: processando ${contactData.length} contatos`);
        }

        // Se for restart, filtrar apenas contatos pendentes
        if (restartMode) {
          // Buscar contatos já entregues
          const deliveredNumbers = await CampaignShipping.findAll({
            where: {
              campaignId: campaign.id,
              deliveredAt: { [Op.ne]: null }
            },
            attributes: ['number'],
            raw: true
          });

          const deliveredNumbersSet = new Set(deliveredNumbers.map(d => d.number));

          // Filtrar apenas contatos pendentes
          const pendingContacts = contacts.filter(contact => !deliveredNumbersSet.has(contact.number));
          contactData = pendingContacts.map(contact => ({
            contactId: contact.id,
            campaignId: campaign.id,
            variables: settings.variables,
            isGroup: contact.isGroup
          }));

        }

        // ✅ SKIP-ALREADY-SENT: pular contatos que já receberam mensagem em
        // QUALQUER campanha anterior usando a mesma contactList. Permite
        // recriar a campanha após pausa/ajuste sem reenviar aos mesmos.
        if ((campaign as any).skipAlreadySent && campaign.contactListId) {
          try {
            const previouslyDelivered = await CampaignShipping.findAll({
              attributes: ["number"],
              where: { deliveredAt: { [Op.ne]: null } },
              include: [
                {
                  model: Campaign,
                  attributes: [],
                  required: true,
                  where: {
                    contactListId: campaign.contactListId,
                    id: { [Op.ne]: campaign.id },
                    companyId: campaign.companyId
                  }
                }
              ],
              raw: true
            });

            const normalize = (n: string) => String(n || "").replace(/\D/g, "");
            const sentSet = new Set(previouslyDelivered.map((d: any) => normalize(d.number)));

            if (sentSet.size > 0) {
              const before = contactData.length;
              const filtered = uniqueContacts.filter(c => !sentSet.has(normalize(c.number)));
              contactData = filtered.map(contact => ({
                contactId: contact.id,
                campaignId: campaign.id,
                variables: settings.variables,
                isGroup: contact.isGroup
              }));
              logger.info(
                `[PROCESS-CAMPAIGN] Campanha ${campaign.id} skipAlreadySent: ${before - contactData.length} contato(s) ignorado(s) (já receberam em campanhas anteriores da mesma lista). Restam ${contactData.length}.`
              );
            }
          } catch (skipErr: any) {
            logger.error(`[PROCESS-CAMPAIGN] Erro ao aplicar skipAlreadySent: ${skipErr.message}`);
          }
        }

        // 🛡️ COOLDOWN POR CONTATO (janela em dias): pula nº que recebeu QUALQUER
        // campanha da mesma empresa nos últimos N dias. Reduz risco de bloqueio.
        const cooldownDays = settings.cooldownDays || 0;
        if (cooldownDays > 0 && contactData.length > 0) {
          try {
            const cutoff = moment().subtract(cooldownDays, "days").toDate();
            const recent = await CampaignShipping.findAll({
              attributes: ["number"],
              where: { deliveredAt: { [Op.gte]: cutoff } },
              include: [
                {
                  model: Campaign,
                  attributes: [],
                  required: true,
                  where: {
                    companyId: campaign.companyId,
                    id: { [Op.ne]: campaign.id }
                  }
                }
              ],
              raw: true
            });
            const normalize = (n: string) => String(n || "").replace(/\D/g, "");
            const recentSet = new Set(recent.map((d: any) => normalize(d.number)));
            if (recentSet.size > 0) {
              const before = contactData.length;
              const allContacts = (campaign as any).contactList?.contacts || uniqueContacts || [];
              const allowed = allContacts.filter((c: any) => !recentSet.has(normalize(c.number)));
              contactData = allowed.map((contact: any) => ({
                contactId: contact.id,
                campaignId: campaign.id,
                variables: settings.variables,
                isGroup: contact.isGroup
              }));
              logger.info(
                `[PROCESS-CAMPAIGN] Campanha ${campaign.id} cooldown ${cooldownDays}d: ${before - contactData.length} contato(s) pulado(s). Restam ${contactData.length}.`
              );
            }
          } catch (cdErr: any) {
            logger.error(`[PROCESS-CAMPAIGN] Erro ao aplicar cooldown: ${cdErr.message}`);
          }
        }

        // Usar configurações customizadas se for restart, senão usar configurações padrão
        const messageInterval = restartMode ? (customMessageInterval || 20) : settings.messageInterval;
        const longerIntervalAfter = restartMode ? (customLongerIntervalAfter || 20) : settings.longerIntervalAfter;
        const greaterInterval = restartMode ? (customGreaterInterval || 60) : settings.greaterInterval;
        const jitterPercent = settings.jitterPercent ?? 40;
        const longPauseEvery = settings.longPauseEvery ?? 50;
        const longPauseDuration = settings.longPauseDuration ?? 30;

        if (contactData.length === 0) {
          return;
        }

        const queuePromises = [];
        let currentDelay = 0;

        for (let i = 0; i < contactData.length; i++) {
          const { contactId, campaignId, variables } = contactData[i];

          // Delay humanizado com jitter + pausa periódica
          const stepDelay = calcHumanizedDelay({
            index: i,
            messageInterval,
            longerIntervalAfter,
            greaterInterval,
            jitterPercent,
            longPauseEvery,
            longPauseDuration,
          });
          currentDelay += stepDelay;

          const queuePromise = campaignQueue.add(
            "PrepareContact",
            { contactId, campaignId, variables },
            {
              removeOnComplete: true,
              delay: currentDelay
            }
          );
          queuePromises.push(queuePromise);
        }

        logger.info(`[CAMPAIGN] ${queuePromises.length} jobs adicionados à fila para campanha ${campaign.id}`);
        await Promise.all(queuePromises);
    } else {
      logger.error(`[PROCESS-CAMPAIGN] Campanha ${id} sem contatos válidos (isWhatsappValid!=false). contactList=${JSON.stringify(campaign.contactList?.id)}, total na lista=${campaign.contactList?.contacts?.length ?? 0}, contacts filtrados=${contacts?.length ?? 'null'}`);
      
      // Cancelar campanha para não ficar presa como EM_ANDAMENTO
      await Campaign.update(
        { status: 'CANCELADA' },
        { where: { id } }
      );
      const cancelledCamp = await Campaign.findByPk(id);
      if (cancelledCamp) {
        const io = getIO();
        io.of(String(cancelledCamp.companyId)).emit(
          `company-${cancelledCamp.companyId}-campaign`,
          { action: "update", record: cancelledCamp }
        );
      }
    }
  } catch (err: any) {
    const campaignId = job?.data?.id ?? 'desconhecido';
    logger.error(`[PROCESS-CAMPAIGN] ERRO CRÍTICO na campanha ${campaignId}: ${err.message}`);
    Sentry.captureException(err);
  }
}

function calculateDelay(
  index,
  baseDelay,
  longerIntervalAfter,
  greaterInterval,
  messageInterval
) {
  const diffSeconds = differenceInSeconds(baseDelay, new Date());

  // Usa calcHumanizedDelay para aplicar jitter e pausa periódica
  const humanizedStep = calcHumanizedDelay({
    index,
    messageInterval,
    longerIntervalAfter,
    greaterInterval,
  });

  const finalDelay = diffSeconds * 1000 + humanizedStep;


  return finalDelay;
}

async function handlePrepareContact(job) {
  try {
    const { contactId, campaignId, variables }: PrepareContactData = job.data;

    const campaign = await getCampaign(campaignId);

    if (!campaign) {
      return;
    }

    // Verificar se a campanha não está cancelada
    if (campaign.status === "CANCELADA") {
      return;
    }

    const contact = await getContact(contactId, campaignId);

    if (!contact) {
      logger.error(`[CAMPAIGN] Contato ${contactId} não encontrado para campanha ${campaignId}`);
      return;
    }

    if (!contact.number) {
      logger.error(`[CAMPAIGN] Contato ${contactId} (${contact.name || 'sem nome'}) não possui número de telefone`);
      return;
    }

    const campaignShipping: any = {};
    campaignShipping.number = contact.number;

    if (campaign.tagListId && !campaign.contactListId) {
      campaignShipping.contactId = null;
    } else {
      campaignShipping.contactId = contactId;
    }

    campaignShipping.campaignId = campaignId;
    const messages = getCampaignValidMessages(campaign);

    // Resolve o slot escolhido (message1..message5) para que possamos vincular
    // a mídia per-slot configurada em campaign.messageMedias a este shipping.
    const slotKeys = ["message1", "message2", "message3", "message4", "message5"];
    const activeSlotKeys = slotKeys.filter(
      k => !isEmpty((campaign as any)[k]) && !isNil((campaign as any)[k])
    );

    let chosenSlotKey: string | null = null;

    if (messages.length >= 0) {
      const radomIndex = randomValue(0, messages.length);
      chosenSlotKey = activeSlotKeys[radomIndex] || activeSlotKeys[0] || null;

      const message = getProcessedMessage(
        messages[radomIndex] || "",
        variables,
        contact
      );

      campaignShipping.message = message === null ? "" : `\u200c ${message}`;
    }

    // Resolve a mídia per-slot a partir de campaign.messageMedias e persiste
    // em campaignShipping.mediaPath/mediaName. Se não houver, o dispatch usa
    // o fallback campaign.mediaPath / campaign.mediaName (mídia global).
    try {
      let parsedMedias: Record<string, { path: string; name: string }> = {};
      if ((campaign as any).messageMedias) {
        parsedMedias = JSON.parse((campaign as any).messageMedias);
      }
      const slotMedia = chosenSlotKey ? parsedMedias[chosenSlotKey] : null;
      if (slotMedia && slotMedia.path) {
        campaignShipping.mediaPath = slotMedia.path;
        campaignShipping.mediaName = slotMedia.name || slotMedia.path;
      }
    } catch (e: any) {
      logger.error(`[CAMPAIGN] Falha ao resolver messageMedias: ${e?.message || e}`);
    }

    if (campaign.confirmation) {
      const confirmationMessages = getCampaignValidConfirmationMessages(campaign);
      if (confirmationMessages.length) {
        const radomIndex = randomValue(0, confirmationMessages.length);
        const message = getProcessedMessage(
          confirmationMessages[radomIndex] || "",
          variables,
          contact
        );
        campaignShipping.confirmationMessage = `\u200c ${message}`;
      }
    }

    let record, created;

    // Para campanhas recorrentes, SEMPRE criar novos registros para cada execução
    // Isso permite rastrear quantas vezes cada contato recebeu a mensagem
    if (campaign.isRecurring) {
      // Verificar se já existe um registro não entregue para esta execução
      let whereClause;
      if (campaign.tagListId && !campaign.contactListId) {
        whereClause = {
          campaignId: campaignShipping.campaignId,
          number: campaignShipping.number,
          deliveredAt: null
        };
      } else {
        whereClause = {
          campaignId: campaignShipping.campaignId,
          contactId: campaignShipping.contactId,
          deliveredAt: null
        };
      }

      const existingRecord = await CampaignShipping.findOne({
        where: whereClause,
        order: [['createdAt', 'DESC']]
      });

      if (existingRecord) {
        // Reutilizar registro existente não entregue
        record = existingRecord;
        created = false;
      } else {
        // Criar novo registro para esta execução
        record = await CampaignShipping.create(campaignShipping);
        created = true;
        logger.info(`[PREPARE-CONTACT] Campanha ${campaign.id} recorrente: criado novo registro ${record.id} para contato ${campaignShipping.number}`);
      }
    } else {
      // Para campanhas não recorrentes, usar findOrCreate normal
      let whereClause;
      if (campaign.tagListId && !campaign.contactListId) {
        whereClause = {
          campaignId: campaignShipping.campaignId,
          number: campaignShipping.number
        };
      } else {
        whereClause = {
          campaignId: campaignShipping.campaignId,
          contactId: campaignShipping.contactId
        };
      }

      [record, created] = await CampaignShipping.findOrCreate({
        where: whereClause,
        defaults: campaignShipping
      });
    }

    // ===== ROTAÇÃO DE WHATSAPP POR BLOCOS =====
    // Se a campanha tem whatsappRotation, atribui a este shipping a conexão
    // correspondente ao bloco. Posição = quantidade de shippings com id menor
    // ou igual ao deste (ordem de criação dentro da campanha).
    try {
      if (created && (campaign as any).whatsappRotation) {
        const rotRaw = (campaign as any).whatsappRotation;
        const rot = typeof rotRaw === "string" ? JSON.parse(rotRaw) : rotRaw;
        if (
          rot &&
          Array.isArray(rot.whatsappIds) &&
          rot.whatsappIds.length > 0 &&
          Number(rot.blockSize) > 0
        ) {
          const position = await CampaignShipping.count({
            where: {
              campaignId: campaign.id,
              id: { [Op.lt]: record.id }
            } as any
          });
          const blockIdx = Math.floor(position / Number(rot.blockSize));
          const wppId = rot.whatsappIds[blockIdx % rot.whatsappIds.length];
          if (wppId) {
            (record as any).whatsappId = wppId;
            await record.update({ whatsappId: wppId } as any);
          }
        }
      }
    } catch (rotErr: any) {
      logger.error(`[ROTATION] erro ao atribuir whatsapp do bloco: ${rotErr.message}`);
    }

    // Verificar se o record já foi entregue (para campanhas reiniciadas)
    if (!created && record.deliveredAt !== null) {
      return;
    }

    if (
      !created &&
      record.deliveredAt === null &&
      record.confirmationRequestedAt === null
    ) {
      record.set(campaignShipping);
      await record.save();
    }

    if (
      record.deliveredAt === null &&
      record.confirmationRequestedAt === null
    ) {
      // ✅ DEDUP: Não reagendar DispatchCampaign se já existe um jobId pendente
      // para este shipping. Sem essa guarda, chamadas duplicadas de
      // PrepareContact (ProcessCampaign disparado duas vezes, recovery job,
      // restart concorrente, etc.) enfileirariam vários DispatchCampaign para
      // o MESMO CampaignShipping, causando envio duplicado ao contato.
      if (!created && record.jobId) {
        try {
          const existingJob = await campaignQueue.getJob(record.jobId);
          // Job ainda existe na fila (waiting/active/delayed) → não duplicar
          if (existingJob) {
            const state = await existingJob.getState().catch(() => null);
            if (state && state !== "failed" && state !== "completed") {
              logger.info(
                `[PREPARE-CONTACT] Dispatch já enfileirado (job=${record.jobId}, state=${state}) para shipping ${record.id}. Ignorando duplicata.`
              );
              return;
            }
          }
        } catch (e: any) {
          logger.warn(`[PREPARE-CONTACT] Falha ao verificar job existente ${record.jobId}: ${e?.message}`);
        }
      }

      const nextJob = await campaignQueue.add(
        "DispatchCampaign",
        {
          campaignId: campaign.id,
          campaignShippingId: record.id,
          contactListItemId: contactId
        }
      );

      await record.update({ jobId: String(nextJob.id) });
    }

  } catch (err: any) {
    Sentry.captureException(err);
    logger.error(`campaignQueue -> PrepareContact -> error: ${err.message}`);
  }
}

/**
 * Uma tentativa de ligação da campanha de voz para um contato.
 *
 * Quem não atende volta para a fila com atraso, até o limite de tentativas
 * configurado na campanha. Quem atendeu (ou esgotou as tentativas) é marcado
 * como entregue, que é o que faz a campanha caminhar para o fim — sem isso ela
 * ficaria "em andamento" para sempre esperando contatos que nunca atendem.
 */
/**
 * Trabalhador da fila de voz: recarrega campanha e contato pelo id e executa a
 * ligação. Recarregar aqui (em vez de receber os objetos) é necessário porque
 * o trabalho trafega pelo Redis, onde só cabem dados simples.
 */
async function handleDispatchVoiceCall(job) {
  const { campaignId, campaignShippingId, chatId } = job.data;

  const campaign = await getCampaign(campaignId, false);
  if (!campaign) {
    logger.error(`[CAMPANHA-VOZ] Campanha ${campaignId} não encontrada`);
    return;
  }
  if (campaign.status === "CANCELADA") return;

  const campaignShipping = await CampaignShipping.findByPk(campaignShippingId, {
    include: [{ model: ContactListItem, as: "contact" }]
  });
  if (!campaignShipping) {
    logger.error(`[CAMPANHA-VOZ] Envio ${campaignShippingId} não encontrado`);
    return;
  }
  if (campaignShipping.deliveredAt) return;

  const {
    reservarVaga,
    liberarVaga,
    registrarEspera
  } = await import("./services/CampaignService/LimiteDeLigacoes");

  // Teto por empresa: sem ele, uma campanha grande ocuparia todas as vagas da
  // fila e as outras empresas ficariam esperando a lista dela terminar.
  if (!reservarVaga(campaign.companyId)) {
    registrarEspera(campaign.companyId);
    await voiceCampaignQueue.add(
      "DispatchVoiceCall",
      { campaignId, campaignShippingId, chatId },
      { delay: 15000 }
    );
    return;
  }

  try {
    await handleDispatchVoiceCampaign(campaign, campaignShipping, chatId);
  } finally {
    // Sempre devolve a vaga, mesmo se a ligação falhar — senão o teto iria
    // baixando a cada erro até a empresa parar de discar.
    liberarVaga(campaign.companyId);
  }

  // Conclusão da campanha e aviso à tela: ficam aqui porque é este o ponto em
  // que o contato realmente termina.
  await verifyAndFinalizeCampaign(campaign);
  const ioVoz = getIO();
  ioVoz.of(String(campaign.companyId)).emit(
    `company-${campaign.companyId}-campaign`,
    { action: "update", record: campaign }
  );
}

async function handleDispatchVoiceCampaign(campaign, campaignShipping, chatId?: string) {
  const tentativaAtual = Number(campaignShipping.voiceAttempts || 0) + 1;
  const maximo = Math.max(1, Number(campaign.voiceMaxAttempts) || 1);

  /**
   * Manda a mensagem de texto da campanha depois da ligação.
   *
   * É opcional: há campanha que quer só a ligação, e mandar texto junto
   * dobraria o incômodo para o contato. Quando `voiceSendText` está
   * desligado — ou não há mensagem escrita — a campanha fica só no áudio.
   */
  const enviarTextoSeConfigurado = async () => {
    if (campaign.voiceSendText === false) return;
    if (!chatId) return;
    // Usa a mensagem da etapa "Mensagem" da própria campanha — com variáveis
    // e anexo, exatamente como numa campanha de texto. Não existe texto
    // separado para a voz: seria um segundo lugar para escrever a mesma coisa.
    if (!campaignShipping.message) return;

    try {
      await handleDispatchCampaignWacalls(campaign, campaignShipping, chatId);
      logger.info(
        `[CAMPANHA-VOZ] Texto enviado para ${campaignShipping.number} após a ligação`
      );
    } catch (err: any) {
      // Falhar no texto não invalida a ligação, que já aconteceu.
      logger.warn(
        `[CAMPANHA-VOZ] Falha ao enviar o texto para ${campaignShipping.number}: ${err?.message}`
      );
    }
  };

  const encerrar = async (resultado: string) => {
    await enviarTextoSeConfigurado();
    await campaignShipping.update({
      voiceAttempts: tentativaAtual,
      voiceLastResult: resultado,
      deliveredAt: moment()
    });
  };

  try {
    const { DispatchVoiceCampaign } = await import(
      "./services/CampaignService/DispatchVoiceCampaignService"
    );
    const resultado = await DispatchVoiceCampaign(campaign, campaignShipping);

    if (resultado.atendida) {
      await encerrar("atendida");
      recordCampaignAttempt(campaign.id, true);
      return;
    }

    if (tentativaAtual >= maximo) {
      await encerrar(`não atendeu (${tentativaAtual} tentativas)`);
      // Não atender não é erro da campanha: contar como falha acionaria a
      // pausa automática por taxa de erro numa lista fria qualquer.
      recordCampaignAttempt(campaign.id, true);
      return;
    }

    const minutos = Math.max(1, Number(campaign.voiceRetryMinutes) || 60);
    await campaignShipping.update({
      voiceAttempts: tentativaAtual,
      voiceLastResult: resultado.motivo || "não atendeu"
    });

    logger.info(
      `[CAMPANHA-VOZ] ${campaignShipping.number} não atendeu (tentativa ${tentativaAtual}/${maximo}). Nova tentativa em ${minutos} min.`
    );

    await voiceCampaignQueue.add(
      "DispatchVoiceCall",
      {
        campaignId: campaign.id,
        campaignShippingId: campaignShipping.id,
        chatId
      },
      { delay: minutos * 60 * 1000 }
    );
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.error(
      `[CAMPANHA-VOZ] Falha ao ligar para ${campaignShipping.number}: ${msg}`
    );
    await campaignShipping
      .update({ voiceAttempts: tentativaAtual, voiceLastResult: `erro: ${msg}` })
      .catch(() => undefined);
    // Erro de verdade (sessão caída, áudio inválido) conta para a pausa
    // automática, ao contrário de "não atendeu".
    recordCampaignAttempt(campaign.id, false);
    await encerrar(`erro: ${msg}`).catch(() => undefined);
  }
}

async function handleDispatchCampaign(job) {
  try {
    const { data } = job;
    const { campaignShippingId, campaignId }: DispatchCampaignData = data;

    const campaign = await getCampaign(campaignId);

    if (!campaign) {
      logger.error(`[CAMPAIGN] Campanha ${campaignId} não encontrada`);
      return;
    }

    // Verificar se a campanha não está cancelada
    if (campaign.status === "CANCELADA") {
      return;
    }

    // Carregar shipping primeiro — pode forçar override do whatsapp (rotação de blocos)
    const campaignShipping = await CampaignShipping.findByPk(
      campaignShippingId,
      {
        include: [{ model: ContactListItem, as: "contact" }]
      }
    );

    if (!campaignShipping) {
      logger.error(`[CAMPAIGN] CampaignShipping ${campaignShippingId} não encontrado`);
      return;
    }

    // ✅ DEDUP: se este shipping já foi entregue, abortar imediatamente.
    // Evita reenvio quando dois jobs DispatchCampaign para o mesmo shipping
    // chegam à fila (PrepareContact duplicado, recovery, restart, retry).
    if (campaignShipping.deliveredAt) {
      logger.warn(
        `[CAMPAIGN] Shipping ${campaignShippingId} já entregue em ${campaignShipping.deliveredAt}. Ignorando job duplicado.`
      );
      return;
    }

    // ===== OVERRIDE DE WHATSAPP POR ROTAÇÃO =====
    try {
      const shippingWppId = (campaignShipping as any).whatsappId;
      if (shippingWppId && shippingWppId !== (campaign as any).whatsappId) {
        const overrideWpp = await Whatsapp.findByPk(shippingWppId);
        if (overrideWpp) {
          (campaign as any).whatsapp = overrideWpp;
          (campaign as any).whatsappId = overrideWpp.id;
        }
      }
    } catch (rotErr: any) {
      logger.error(`[ROTATION] override whatsapp falhou: ${rotErr.message}`);
    }

    // ===== MODO SEQUENCIAL =====
    // Blocos posteriores só disparam após todos os shippings dos blocos
    // anteriores terem sido entregues. Caso contrário, reagenda em 30s.
    try {
      const rotRaw = (campaign as any).whatsappRotation;
      const rot = rotRaw
        ? typeof rotRaw === "string"
          ? JSON.parse(rotRaw)
          : rotRaw
        : null;
      const shippingWppId = (campaignShipping as any).whatsappId;
      if (
        rot?.sequential &&
        Array.isArray(rot.whatsappIds) &&
        shippingWppId
      ) {
        const order = rot.whatsappIds.indexOf(shippingWppId);
        if (order > 0) {
          const earlierIds = rot.whatsappIds.slice(0, order);
          const pending = await CampaignShipping.count({
            where: {
              campaignId: campaign.id,
              whatsappId: { [Op.in]: earlierIds },
              deliveredAt: null
            } as any
          });
          if (pending > 0) {
            logger.info(
              `[ROTATION-SEQ] Bloco ${order} aguardando ${pending} envios anteriores. Reagendando shipping ${campaignShipping.id}.`
            );
            await campaignQueue.add(
              "DispatchCampaign",
              {
                campaignShippingId: campaignShipping.id,
                campaignId: campaign.id,
                contactListItemId: (campaignShipping as any).contactId
              },
              { delay: 30000 }
            );
            return;
          }
        }
      }
    } catch (seqErr: any) {
      logger.error(`[ROTATION-SEQ] ${seqErr.message}`);
    }

    if (!campaign.whatsapp) {
      logger.error(`[CAMPAIGN] WhatsApp não encontrado para campanha ${campaignId}`);
      return;
    }

    const isOficial = campaign.whatsapp.channel === "whatsapp_oficial";
    const isWacalls = campaign.whatsapp.channel === "wacalls";

    // Para WhatsApp normal (Baileys), precisamos do wbot. Oficial e wacalls
    // têm seus próprios caminhos de envio e não usam sessão Baileys.
    let wbot = null;
    if (!isOficial && !isWacalls) {
      wbot = await GetWhatsappWbot(campaign.whatsapp);

      if (!wbot) {
        logger.error(`[CAMPAIGN] Wbot não encontrado para campanha ${campaignId}`);
        return;
      }

      if (!wbot?.user?.id) {
        logger.error(`[CAMPAIGN] Usuário do wbot não encontrado para campanha ${campaignId}`);
        return;
      }
    }

    logger.info(`Disparo de campanha solicitado: Campanha=${campaignId};Registro=${campaignShippingId}${isOficial ? ' (API Oficial)' : ''}${isWacalls ? ' (wacalls)' : ''}`);


    let chatId;
    if (campaignShipping.contact && campaignShipping.contact.isGroup) {
      chatId = `${campaignShipping.number}@g.us`;
    } else {
      const isGroupNumber = campaignShipping.number.includes('@') || campaignShipping.number.length > 15;
      chatId = isGroupNumber
        ? `${campaignShipping.number}@g.us`
        : `${campaignShipping.number}@s.whatsapp.net`;
    }

    // ===== CAMPANHA DE VOZ =====
    // Vem antes do envio de mensagem porque não é envio: aqui a campanha liga
    // para o contato e toca um áudio. Só existe pelo WhatsApp Plus, que é o
    // único canal com chamada de voz própria.
    if (campaign.campaignType === "voice") {
      if (!isWacalls) {
        logger.error(
          `[CAMPANHA-VOZ] Campanha ${campaign.id} é de voz mas a conexão não é WhatsApp Plus. Ignorando.`
        );
        return;
      }
      // Passa para a fila de voz e libera este trabalhador na hora. Segurar a
      // ligação aqui pararia as campanhas de texto de todas as empresas.
      await voiceCampaignQueue.add("DispatchVoiceCall", {
        campaignId: campaign.id,
        campaignShippingId: campaignShipping.id,
        chatId
      });
      return;
    }

    // ===== DISPATCH VIA WACALLS (wacalls-chat) =====
    if (isWacalls) {
      try {
        await handleDispatchCampaignWacalls(campaign, campaignShipping, chatId);
        recordCampaignAttempt(campaign.id, true);
      } catch (dispatchErr) {
        const errMsg = dispatchErr?.message || String(dispatchErr);
        logger.error(`[DISPATCH-CAMPAIGN-WACALLS] Falha ao enviar para ${campaignShipping.number}: ${errMsg}`);
        await campaignShipping.update({ confirmationRequestedAt: null }).catch(() => {});

        // 🛡️ PAUSA AUTOMÁTICA POR TAXA DE ERRO (mesmo mecanismo da API Oficial)
        try {
          const stats = recordCampaignAttempt(campaign.id, false);
          const total = stats.sent + stats.failed;
          const sett = await getSettings(campaign).catch(() => null);
          const threshold = sett?.errorPauseThreshold ?? 30;
          const minAttempts = sett?.errorPauseMinAttempts ?? 10;
          if (threshold > 0 && total >= minAttempts) {
            const failRate = (stats.failed / total) * 100;
            if (failRate >= threshold) {
              logger.error(
                `[CAMPAIGN-AUTOPAUSE] Campanha ${campaign.id} cancelada: taxa de falha ${failRate.toFixed(1)}% >= ${threshold}% (sent=${stats.sent}, failed=${stats.failed})`
              );
              await Campaign.update(
                { status: 'CANCELADA', completedAt: moment() },
                { where: { id: campaign.id, status: { [Op.notIn]: ['FINALIZADA', 'CANCELADA'] } } }
              );
              invalidateCampaignCache(campaign.id);
              clearCampaignErrorStats(campaign.id);
              const io = getIO();
              io.emit(`company-${campaign.companyId}-campaign`, {
                action: "update",
                record: { id: campaign.id, status: 'CANCELADA', autoPaused: true, failRate: Math.round(failRate) }
              });
              return;
            }
          }
        } catch (apErr: any) {
          logger.error(`[CAMPAIGN-AUTOPAUSE] erro ao avaliar pausa: ${apErr.message}`);
        }

        const totalCount = await CampaignShipping.count({ where: { campaignId: campaign.id } });
        const deliveredCount = await CampaignShipping.count({ where: { campaignId: campaign.id, deliveredAt: { [Op.ne]: null } } });
        const pendingCount = await CampaignShipping.count({ where: { campaignId: campaign.id, deliveredAt: null, confirmationRequestedAt: null } });

        if (pendingCount === 0 && deliveredCount === 0 && totalCount > 0) {
          logger.error(`[DISPATCH-CAMPAIGN-WACALLS] Campanha ${campaign.id} sem nenhuma entrega - mudando para CANCELADA`);
          await Campaign.update(
            { status: 'CANCELADA', completedAt: moment() },
            { where: { id: campaign.id, status: { [Op.ne]: 'FINALIZADA' } } }
          );
          invalidateCampaignCache(campaign.id);
          const io = getIO();
          io.emit(`company-${campaign.companyId}-campaign`, {
            action: "update",
            record: { id: campaign.id, status: 'CANCELADA' }
          });
        }

        return;
      }

      if (campaign.isRecurring) {
        await campaign.reload();
        if (campaign.status !== 'EM_ANDAMENTO') return;
        const deliveredCount = await CampaignShipping.count({
          where: { campaignId: campaign.id, deliveredAt: { [Op.ne]: null } }
        });
        const campaignWithContacts = await getCampaign(campaign.id);
        const totalContacts = campaignWithContacts?.contactList?.contacts?.length || 0;
        if (totalContacts > 0) {
          const remainingMessages = deliveredCount % totalContacts;
          const currentExecution = Math.floor(deliveredCount / totalContacts);
          if (remainingMessages === 0 && deliveredCount > 0) {
            const expectedExecution = campaign.executionCount;
            if (currentExecution > expectedExecution) {
              await verifyAndFinalizeCampaign(campaign);
            }
          }
        }
      } else {
        await verifyAndFinalizeCampaign(campaign);
      }

      const io = getIO();
      io.of(String(campaign.companyId)).emit(
        `company-${campaign.companyId}-campaign`,
        { action: "update", record: campaign }
      );
      return;
    }

    // ===== DISPATCH VIA API OFICIAL =====
    if (isOficial) {
      const MAX_RETRIES = 3;
      const retryAttempt = job.data.retryAttempt || 0;

      try {
        await handleDispatchCampaignOficial(campaign, campaignShipping, chatId);
        // Quando follow-up está habilitado, marca o início da janela de 24h da Meta
        // para que, ao receber a resposta do contato, possamos disparar as mensagens 1..5.
        const shippingUpdate: any = { deliveredAt: moment() };
        if ((campaign as any).sendFollowUpMessage) {
          shippingUpdate.awaitingResponseSince = new Date();
        }
        await campaignShipping.update(shippingUpdate);
        recordCampaignAttempt(campaign.id, true);
      } catch (dispatchErr) {
        const errMsg = dispatchErr?.message || String(dispatchErr);
        const httpStatus = dispatchErr?.response?.status || 0;

        // Retry com backoff exponencial para erros 429 (rate limit) e 500+ (server error)
        if ((httpStatus === 429 || httpStatus >= 500) && retryAttempt < MAX_RETRIES) {
          const backoffDelay = Math.pow(2, retryAttempt) * 5000 + Math.random() * 2000;
          logger.warn(`[DISPATCH-CAMPAIGN-OFICIAL] Retry ${retryAttempt + 1}/${MAX_RETRIES} para ${campaignShipping.number} (HTTP ${httpStatus}). Aguardando ${Math.round(backoffDelay / 1000)}s`);

          await campaignQueue.add(
            "DispatchCampaign",
            {
              campaignShippingId: campaignShipping.id,
              campaignId: campaign.id,
              retryAttempt: retryAttempt + 1
            },
            {
              delay: backoffDelay,
              removeOnComplete: true,
              removeOnFail: true
            }
          );
          return;
        }

        logger.error(`[DISPATCH-CAMPAIGN-OFICIAL] Falha ao enviar para ${campaignShipping.number}: ${errMsg}${retryAttempt > 0 ? ` (após ${retryAttempt} retries)` : ''}`);

        // Marcar o shipping com erro (sem deliveredAt) para não bloquear a campanha
        await campaignShipping.update({ confirmationRequestedAt: null }).catch(() => {});

        // 🛡️ PAUSA AUTOMÁTICA POR TAXA DE ERRO
        try {
          const stats = recordCampaignAttempt(campaign.id, false);
          const total = stats.sent + stats.failed;
          const sett = await getSettings(campaign).catch(() => null);
          const threshold = sett?.errorPauseThreshold ?? 30;
          const minAttempts = sett?.errorPauseMinAttempts ?? 10;
          if (threshold > 0 && total >= minAttempts) {
            const failRate = (stats.failed / total) * 100;
            if (failRate >= threshold) {
              logger.error(
                `[CAMPAIGN-AUTOPAUSE] Campanha ${campaign.id} cancelada: taxa de falha ${failRate.toFixed(1)}% >= ${threshold}% (sent=${stats.sent}, failed=${stats.failed})`
              );
              await Campaign.update(
                { status: 'CANCELADA', completedAt: moment() },
                { where: { id: campaign.id, status: { [Op.notIn]: ['FINALIZADA', 'CANCELADA'] } } }
              );
              invalidateCampaignCache(campaign.id);
              clearCampaignErrorStats(campaign.id);
              const io = getIO();
              io.emit(`company-${campaign.companyId}-campaign`, {
                action: "update",
                record: { id: campaign.id, status: 'CANCELADA', autoPaused: true, failRate: Math.round(failRate) }
              });
              return;
            }
          }
        } catch (apErr: any) {
          logger.error(`[CAMPAIGN-AUTOPAUSE] erro ao avaliar pausa: ${apErr.message}`);
        }

        // Verificar se TODOS os shippings falharam para cancelar a campanha
        const totalCount = await CampaignShipping.count({ where: { campaignId: campaign.id } });
        const deliveredCount = await CampaignShipping.count({ where: { campaignId: campaign.id, deliveredAt: { [Op.ne]: null } } });
        const pendingCount = await CampaignShipping.count({ where: { campaignId: campaign.id, deliveredAt: null, confirmationRequestedAt: null } });

        logger.warn(`[DISPATCH-CAMPAIGN-OFICIAL] Campanha ${campaign.id}: total=${totalCount}, entregues=${deliveredCount}, pendentes=${pendingCount}`);

        // Se não há mais pendentes E nenhum foi entregue → cancelar campanha
        if (pendingCount === 0 && deliveredCount === 0 && totalCount > 0) {
          logger.error(`[DISPATCH-CAMPAIGN-OFICIAL] Campanha ${campaign.id} sem nenhuma entrega - mudando para CANCELADA`);
          await Campaign.update(
            { status: 'CANCELADA', completedAt: moment() },
            { where: { id: campaign.id, status: { [Op.ne]: 'FINALIZADA' } } }
          );
          invalidateCampaignCache(campaign.id);
          const io = getIO();
          io.emit(`company-${campaign.companyId}-campaign`, {
            action: "update",
            record: { id: campaign.id, status: 'CANCELADA' }
          });
        }

        // Não relançar o erro: permite que outros shippings da campanha continuem
        return;
      }

      // Verificar finalização
      if (campaign.isRecurring) {
        await campaign.reload();
        if (campaign.status !== 'EM_ANDAMENTO') return;
        const deliveredCount = await CampaignShipping.count({
          where: { campaignId: campaign.id, deliveredAt: { [Op.ne]: null } }
        });
        const campaignWithContacts = await getCampaign(campaign.id);
        const totalContacts = campaignWithContacts?.contactList?.contacts?.length || 0;
        if (totalContacts > 0) {
          const remainingMessages = deliveredCount % totalContacts;
          const currentExecution = Math.floor(deliveredCount / totalContacts);
          if (remainingMessages === 0 && deliveredCount > 0) {
            const expectedExecution = campaign.executionCount;
            if (currentExecution > expectedExecution) {
              await verifyAndFinalizeCampaign(campaign);
            }
          }
        }
      } else {
        await verifyAndFinalizeCampaign(campaign);
      }

      const io = getIO();
      io.of(String(campaign.companyId)).emit(
        `company-${campaign.companyId}-campaign`,
        { action: "update", record: campaign }
      );
      return;
    }

    // ===== DISPATCH VIA BAILEYS (original) =====

    if (campaign.openTicket === "enabled") {
      const [contact] = await Contact.findOrCreate({
        where: {
          number: campaignShipping.number,
          companyId: campaign.companyId
        },
        defaults: {
          companyId: campaign.companyId,
          name: campaignShipping.contact ? campaignShipping.contact.name : "Contato da Campanha",
          number: campaignShipping.number,
          email: campaignShipping.contact ? campaignShipping.contact.email : "",
          whatsappId: campaign.whatsappId,
          profilePicUrl: ""
        }
      });
      const whatsapp = await Whatsapp.findByPk(campaign.whatsappId);

      let ticket = await Ticket.findOne({
        where: {
          contactId: contact.id,
          companyId: campaign.companyId,
          whatsappId: whatsapp.id,
          status: ["open", "pending"]
        }
      });

      if (!ticket) {
        ticket = await Ticket.create({
          companyId: campaign.companyId,
          contactId: contact.id,
          whatsappId: whatsapp.id,
          queueId: campaign?.queueId,
          userId: campaign?.userId,
          status: campaign?.statusTicket
        });
      }

      ticket = await ShowTicketService(ticket.id, campaign.companyId);

      if (whatsapp.status === "CONNECTED") {
        if (campaign.confirmation && campaignShipping.confirmation === null) {
          const confirmationMessage = await wbot.sendMessage(getJidOf(chatId), {
            text: `\u200c ${campaignShipping.confirmationMessage}`
          });

          await verifyMessage(
            confirmationMessage,
            ticket,
            contact,
            null,
            true,
            false
          );

          await campaignShipping.update({ confirmationRequestedAt: moment() });
        } else {
          // Mídia efetiva: per-slot (campaignShipping) sobrepõe global (campaign)
          const effMediaPath = (campaignShipping as any).mediaPath || campaign.mediaPath;
          const effMediaName = (campaignShipping as any).mediaName || campaign.mediaName;

          if (!effMediaPath) {
            const sentMessage = await wbot.sendMessage(getJidOf(chatId), {
              text: `\u200c ${campaignShipping.message}`
            });

            await verifyMessage(
              sentMessage,
              ticket,
              contact,
              null,
              true,
              false
            );
          }

          if (effMediaPath) {
            const publicFolder = path.resolve(__dirname, "..", "public");
            const filePath = path.join(
              publicFolder,
              `company${campaign.companyId}`,
              effMediaPath
            );

            const options = await getMessageOptions(
              effMediaName,
              filePath,
              String(campaign.companyId),
              `\u200c ${campaignShipping.message}`
            );
            if (Object.keys(options).length) {
              if (options.mimetype === "audio/mp4") {
                const audioMessage = await wbot.sendMessage(getJidOf(chatId), {
                  text: `\u200c ${campaignShipping.message}`
                });

                await verifyMessage(
                  audioMessage,
                  ticket,
                  contact,
                  null,
                  true,
                  false
                );
              }
              const sentMessage = await wbot.sendMessage(getJidOf(chatId), {
                ...options
              });

              await verifyMediaMessage(
                sentMessage,
                ticket,
                ticket.contact,
                null,
                false,
                true,
                wbot
              );
            } else {
              logger.warn(`[CAMPAIGN] Mídia não pôde ser preparada (path=${filePath}). Verifique se o arquivo existe em public/company${campaign.companyId}/.`);
            }
          }
          // if (campaign?.statusTicket === 'closed') {
          //   await ticket.update({
          //     status: "closed"
          //   })
          //   const io = getIO();

          //   io.of(String(ticket.companyId))
          //     // .to(ticket.id.toString())
          //     .emit(`company-${ticket.companyId}-ticket`, {
          //       action: "delete",
          //       ticketId: ticket.id
          //     });
          // }
        }
        await campaignShipping.update({ deliveredAt: moment() });
      }
    } else {
      if (campaign.confirmation && campaignShipping.confirmation === null) {
        await wbot.sendMessage(getJidOf(chatId), {
          text: campaignShipping.confirmationMessage
        });
        await campaignShipping.update({ confirmationRequestedAt: moment() });
      } else {
        const effMediaPath = (campaignShipping as any).mediaPath || campaign.mediaPath;
        const effMediaName = (campaignShipping as any).mediaName || campaign.mediaName;

        if (!effMediaPath) {
          const sentMessage = await wbot.sendMessage(getJidOf(chatId), {
            text: campaignShipping.message
          });
        }

        if (effMediaPath) {
          const publicFolder = path.resolve(__dirname, "..", "public");
          const filePath = path.join(
            publicFolder,
            `company${campaign.companyId}`,
            effMediaPath
          );

          const options = await getMessageOptions(
            effMediaName,
            filePath,
            String(campaign.companyId),
            campaignShipping.message
          );
          if (Object.keys(options).length) {
            if (options.mimetype === "audio/mp4") {
              await wbot.sendMessage(getJidOf(chatId), {
                text: campaignShipping.message
              });
            }
            await wbot.sendMessage(getJidOf(chatId), { ...options });
          } else {
            logger.warn(`[CAMPAIGN] Mídia não pôde ser preparada (path=${filePath}).`);
          }
        }
      }

      await campaignShipping.update({ deliveredAt: moment() });
    }

    // Para campanhas recorrentes, verificar apenas quando uma execução completa for detectada
    if (campaign.isRecurring) {
      // Recarregar campanha para ter dados atualizados
      await campaign.reload();
      
      // Verificar se campanha ainda está EM_ANDAMENTO (evita processar se já foi finalizada)
      if (campaign.status !== 'EM_ANDAMENTO') {
        logger.info(`[DISPATCH-CAMPAIGN] Campanha ${campaign.id} não está mais EM_ANDAMENTO (status: ${campaign.status}), não verificando`);
        return;
      }
      
      const deliveredCount = await CampaignShipping.count({
        where: {
          campaignId: campaign.id,
          deliveredAt: { [Op.ne]: null }
        }
      });

      let totalContacts = 0;
      if (campaign.tagListId && !campaign.contactListId) {
        totalContacts = await CampaignShipping.count({
          where: { campaignId: campaign.id }
        });
      } else {
        const campaignWithContacts = await getCampaign(campaign.id);
        totalContacts = campaignWithContacts?.contactList?.contacts?.length || 0;
      }
      
      if (totalContacts > 0) {
        const remainingMessages = deliveredCount % totalContacts;
        const currentExecution = Math.floor(deliveredCount / totalContacts);
        
        logger.info(`[DISPATCH-CAMPAIGN] Campanha ${campaign.id} recorrente: ${deliveredCount} mensagens entregues, execução ${currentExecution + 1}, ${remainingMessages}/${totalContacts} mensagens restantes`);
        
        // Só verificar quando uma execução estiver completa (sem mensagens restantes)
        // E garantir que não estamos processando execução futura
        if (remainingMessages === 0 && deliveredCount > 0) {
          // Verificar se a execução atual corresponde ao executionCount esperado
          const expectedExecution = campaign.executionCount;
          
          // Só processar se a execução atual é maior que a esperada (nova execução completa)
          if (currentExecution > expectedExecution) {
            logger.info(`[DISPATCH-CAMPAIGN] Campanha ${campaign.id} recorrente: execução ${currentExecution} completa detectada (esperado ${expectedExecution}), verificando se deve agendar próxima`);
            await verifyAndFinalizeCampaign(campaign);
          } else if (currentExecution === expectedExecution) {
            // Execução já foi processada, mas pode ser que ainda esteja aguardando próxima
            logger.info(`[DISPATCH-CAMPAIGN] Campanha ${campaign.id} recorrente: execução ${currentExecution} já foi processada (executionCount=${expectedExecution}), aguardando próxima execução`);
          } else {
            logger.warn(`[DISPATCH-CAMPAIGN] Campanha ${campaign.id} recorrente: execução ${currentExecution} menor que esperado (${expectedExecution}), possível inconsistência`);
          }
        }
      }
    } else {
      // Para campanhas não recorrentes, verificar normalmente a cada mensagem
      await verifyAndFinalizeCampaign(campaign);
    }

    const io = getIO();
    io.of(String(campaign.companyId)).emit(
      `company-${campaign.companyId}-campaign`,
      {
        action: "update",
        record: campaign
      }
    );

    logger.info(
      `Campanha enviada para: Campanha=${campaignId};Contato=${campaignShipping.contact ? campaignShipping.contact.name : campaignShipping.number}`
    );
  } catch (err: any) {
    Sentry.captureException(err);
    logger.error(err.message);
  }
}

async function handleLoginStatus(job) {
  const thresholdTime = new Date();
  thresholdTime.setMinutes(thresholdTime.getMinutes() - 5);

  await User.update(
    { online: false },
    {
      where: {
        updatedAt: { [Op.lt]: thresholdTime },
        online: true
      }
    }
  );
}

async function handleResumeTicketsOutOfHour(job) {
  // logger.info("Buscando atendimentos perdidos nas filas");
  try {
    const companies = await Company.findAll({
      attributes: ["id", "name"],
      where: {
        status: true
      },
      include: [
        {
          model: Whatsapp,
          required: true,
          attributes: ["id", "name", "status", "timeSendQueue", "sendIdQueue"],
          where: {
            // `status` era testado só em JavaScript, depois de o banco já ter
            // devolvido a conexão. Filtrar aqui é equivalente e evita trazer
            // conexão desconectada a cada passada do job.
            status: "CONNECTED",
            timeSendQueue: { [Op.gt]: 0 }
          }
        }
      ]
    });

    await Promise.all(companies.map(async c => {
      await Promise.all(c.whatsapps.map(async w => {
        if (w.status === "CONNECTED") {
          var companyId = c.id;

          const moveQueue = w.timeSendQueue ? w.timeSendQueue : 0;
          const moveQueueId = w.sendIdQueue;
          const moveQueueTime = moveQueue;
          const idQueue = moveQueueId;
          const timeQueue = moveQueueTime;

          if (moveQueue > 0) {
            if (
              !isNaN(idQueue) &&
              Number.isInteger(idQueue) &&
              !isNaN(timeQueue) &&
              Number.isInteger(timeQueue)
            ) {
              const tempoPassado = moment()
                .subtract(timeQueue, "minutes")
                .utc()
                .format();
              // const tempoAgora = moment().utc().format();

              // ATENÇÃO: não voltar a colocar `attributes: ["id"]` aqui.
              //
              // O Sequelize 5 faz `reload()` reaproveitando as options da
              // consulta ORIGINAL. Com `attributes: ["id"]`, o `reload()`
              // logo abaixo recarregava SÓ o id, e o `emit` mandava para o
              // frontend um ticket sem status, sem queueId e sem contato.
              // Resultado: o job movia o atendimento perdido para a fila,
              // mas o card na tela não refletia — só depois de um F5.
              // `findAll` em vez de `findAndCountAll`: o `count` só era usado
              // no `if (count > 0)`, que `tickets.length` resolve. O
              // findAndCountAll disparava um COUNT(*) extra com os mesmos três
              // JOINs, por conexão, a cada minuto, sem nenhuma utilidade.
              const tickets = await Ticket.findAll({
                where: {
                  status: "pending",
                  queueId: null,
                  companyId: companyId,
                  whatsappId: w.id,
                  updatedAt: {
                    [Op.lt]: tempoPassado
                  }
                  // isOutOfHour: false
                },
                include: [
                  {
                    model: Contact,
                    as: "contact",
                    attributes: [
                      "id",
                      "name",
                      "number",
                      "email",
                      "profilePicUrl",
                      "acceptAudioMessage",
                      "active",
                      "disableBot",
                      "urlPicture",
                      "lgpdAcceptedAt",
                      "companyId"
                    ],
                    include: ["extraInfo", "tags"]
                  },
                  {
                    model: Queue,
                    as: "queue",
                    attributes: ["id", "name", "color"]
                  },
                  {
                    model: Whatsapp,
                    as: "whatsapp",
                    attributes: [
                      "id",
                      "name",
                      "expiresTicket",
                      "groupAsTicket",
                      "color"
                    ]
                  }
                ],
                // Teto por passada. O job roda a cada minuto, então o que
                // sobrar é tratado na passada seguinte. Sem o limite, um
                // acúmulo grande de atendimentos pendentes (ex: depois de uma
                // conexão ficar horas fora) hidratava tudo de uma vez, com
                // três JOINs por linha, num único tique do cron.
                limit: 200
              });

              if (tickets.length > 0) {
                await Promise.all(tickets.map(async ticket => {
                  try {
                    await ticket.update({ queueId: idQueue });
                    await ticket.reload();

                    const io = getIO();
                    io.of(String(companyId))
                      .emit(`company-${companyId}-ticket`, {
                        action: "update",
                        ticket,
                        ticketId: ticket.id
                      });

                    logger.info(
                      `Atendimento Perdido: ${ticket.id} - Empresa: ${companyId}`
                    );
                  } catch (err: any) {
                    logger.error(
                      `Erro ao atualizar ticket ${ticket.id}: ${err?.message}`
                    );
                  }
                }));
              }
            } else {
              logger.info(`Condição não respeitada - Empresa: ${companyId}`);
            }
          }
        }
      }));
    }));
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SearchForQueue -> VerifyQueue: error", e.message);
    throw e;
  }
}

async function handleVerifyQueue(job) {
  // logger.info("Buscando atendimentos perdidos nas filas");
  try {
    // Este job roda a CADA 60 SEGUNDOS (cron "0 * * * * *").
    //
    // Antes, a consulta trazia TODAS as empresas ativas com TODAS as suas
    // conexões, e só depois, em JavaScript, descartava as que não estavam
    // conectadas ou que não têm redirecionamento por tempo configurado
    // (`timeSendQueue`). Numa instalação multi-tenant isso era uma varredura
    // completa da tabela de conexões por minuto, para na esmagadora maioria
    // das vezes não fazer nada.
    //
    // Filtrando no SQL, o banco devolve só o que interessa. O
    // handleResumeTicketsOutOfHour logo acima já fazia assim para
    // `timeSendQueue`; aqui a filtragem tinha ficado de fora.
    //
    // `required: true` é explícito de propósito: o Sequelize já assume true
    // quando existe `where` no include, mas deixar escrito evita que alguém
    // mexa no where depois e o INNER JOIN vire LEFT JOIN sem querer.
    const companies = await Company.findAll({
      attributes: ["id", "name"],
      where: {
        status: true
      },
      include: [
        {
          model: Whatsapp,
          required: true,
          where: {
            status: "CONNECTED",
            timeSendQueue: { [Op.gt]: 0 }
          },
          attributes: ["id", "name", "status", "timeSendQueue", "sendIdQueue"]
        }
      ]
    });

    await Promise.all(companies.map(async c => {
      await Promise.all(c.whatsapps.map(async w => {
        if (w.status === "CONNECTED") {
          var companyId = c.id;

          const moveQueue = w.timeSendQueue ? w.timeSendQueue : 0;
          const moveQueueId = w.sendIdQueue;
          const moveQueueTime = moveQueue;
          const idQueue = moveQueueId;
          const timeQueue = moveQueueTime;

          if (moveQueue > 0) {
            if (
              !isNaN(idQueue) &&
              Number.isInteger(idQueue) &&
              !isNaN(timeQueue) &&
              Number.isInteger(timeQueue)
            ) {
              const tempoPassado = moment()
                .subtract(timeQueue, "minutes")
                .utc()
                .format();
              // const tempoAgora = moment().utc().format();

              // ATENÇÃO: não voltar a colocar `attributes: ["id"]` aqui.
              //
              // O Sequelize 5 faz `reload()` reaproveitando as options da
              // consulta ORIGINAL. Com `attributes: ["id"]`, o `reload()`
              // logo abaixo recarregava SÓ o id, e o `emit` mandava para o
              // frontend um ticket sem status, sem queueId e sem contato.
              // Resultado: o job movia o atendimento perdido para a fila,
              // mas o card na tela não refletia — só depois de um F5.
              // `findAll` em vez de `findAndCountAll`: o `count` só era usado
              // no `if (count > 0)`, que `tickets.length` resolve. O
              // findAndCountAll disparava um COUNT(*) extra com os mesmos três
              // JOINs, por conexão, a cada minuto, sem nenhuma utilidade.
              const tickets = await Ticket.findAll({
                where: {
                  status: "pending",
                  queueId: null,
                  companyId: companyId,
                  whatsappId: w.id,
                  updatedAt: {
                    [Op.lt]: tempoPassado
                  }
                  // isOutOfHour: false
                },
                include: [
                  {
                    model: Contact,
                    as: "contact",
                    attributes: [
                      "id",
                      "name",
                      "number",
                      "email",
                      "profilePicUrl",
                      "acceptAudioMessage",
                      "active",
                      "disableBot",
                      "urlPicture",
                      "lgpdAcceptedAt",
                      "companyId"
                    ],
                    include: ["extraInfo", "tags"]
                  },
                  {
                    model: Queue,
                    as: "queue",
                    attributes: ["id", "name", "color"]
                  },
                  {
                    model: Whatsapp,
                    as: "whatsapp",
                    attributes: [
                      "id",
                      "name",
                      "expiresTicket",
                      "groupAsTicket",
                      "color"
                    ]
                  }
                ],
                // Teto por passada. O job roda a cada minuto, então o que
                // sobrar é tratado na passada seguinte. Sem o limite, um
                // acúmulo grande de atendimentos pendentes (ex: depois de uma
                // conexão ficar horas fora) hidratava tudo de uma vez, com
                // três JOINs por linha, num único tique do cron.
                limit: 200
              });

              if (tickets.length > 0) {
                await Promise.all(tickets.map(async ticket => {
                  try {
                    await ticket.update({ queueId: idQueue });
                    await CreateLogTicketService({
                      userId: null,
                      queueId: idQueue,
                      ticketId: ticket.id,
                      type: "redirect"
                    });
                    await ticket.reload();

                    const io = getIO();
                    io.of(String(companyId))
                      .emit(`company-${companyId}-ticket`, {
                        action: "update",
                        ticket,
                        ticketId: ticket.id
                      });

                    logger.info(
                      `Atendimento Perdido: ${ticket.id} - Empresa: ${companyId}`
                    );
                  } catch (err: any) {
                    logger.error(
                      `Erro ao redirecionar ticket ${ticket.id}: ${err?.message}`
                    );
                  }
                }));
              }
            } else {
              logger.info(`Condição não respeitada - Empresa: ${companyId}`);
            }
          }
        }
      }));
    }));
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SearchForQueue -> VerifyQueue: error", e.message);
    throw e;
  }
}

async function handleRandomUser() {
  // logger.info("Iniciando a randomização dos atendimentos...");

  const jobR = new CronJob('0 */5 * * * *', async () => {

    try {
      const companies = await Company.findAll({
        attributes: ['id', 'name'],
        where: {
          status: true
        },
        include: [
          {
            model: Queues,
            attributes: ["id", "name", "ativarRoteador", "tempoRoteador"],
            where: {
              ativarRoteador: true,
              tempoRoteador: {
                [Op.ne]: 0
              }
            }
          },
        ]
      });

      if (companies) {
        await Promise.all(companies.map(async c => {
          await Promise.all(c.queues.map(async q => {
           try {
            const { count, rows: tickets } = await Ticket.findAndCountAll({
              where: {
                companyId: c.id,
                status: "pending",
                queueId: q.id,
              },
              include: [
                {
                  model: Contact,
                  as: "contact",
                  include: [
                    {
                      model: ContactWallet,
                      as: "contactWallets",
                      where: {
                        queueId: q.id
                      },
                      required: false
                    }
                  ]
                }
              ]
            });

            //logger.info(`Localizado: ${count} filas para randomização.`);

            const getRandomUserId = (userIds) => {
              const randomIndex = Math.floor(Math.random() * userIds.length);
              return userIds[randomIndex];
            };

            // Function to fetch the User record by userId
            const findUserById = async (userId, companyId) => {
              try {
                const user = await User.findOne({
                  where: {
                    id: userId,
                    companyId
                  },
                });

                if (user && user?.profile === "user") {
                  if (user.online === true) {
                    return user.id;
                  } else {
                    // logger.info("USER OFFLINE");
                    return 0;
                  }
                } else {
                  // logger.info("ADMIN");
                  return 0;
                }

              } catch (errorV) {
                Sentry.captureException(errorV);
                logger.error(`[VerifyUsersRandom] VerifyUsersRandom: error ${JSON.stringify(errorV)}`);
                throw errorV;
              }
            };

            if (count > 0) {
              for (const ticket of tickets) {
                const { queueId, userId } = ticket;
                const tempoRoteador = q.tempoRoteador;

                // Verificar se o contato possui carteira definida para esta fila
                if (ticket.contact && ticket.contact.contactWallets && ticket.contact.contactWallets.length > 0) {
                  const hasWalletForQueue = ticket.contact.contactWallets.some(wallet => wallet.queueId === queueId);

                  if (hasWalletForQueue) {
                    logger.info(`[RANDOM USER] Ticket ${ticket.id} possui carteira definida para fila ${queueId} - pulando randomização`);
                    continue; // Pular este ticket, não randomizar
                  }
                }
                // Find all UserQueue records with the specific queueId
                const userQueues = await UserQueue.findAll({
                  where: {
                    queueId: queueId,
                  },
                });

                // Extract the userIds from the UserQueue records
                const userIds = userQueues.map((userQueue) => userQueue.userId);

                const tempoPassadoB = moment().subtract(tempoRoteador, "minutes").utc().toDate();
                const updatedAtV = new Date(ticket.updatedAt);

                let settings = await CompaniesSettings.findOne({
                  where: {
                    companyId: ticket.companyId
                  }
                });

                const sendGreetingMessageOneQueues = settings.sendGreetingMessageOneQueues === "enabled" || false;

                if (!userId) {
                  // ticket.userId is null, randomly select one of the provided userIds
                  const randomUserId = getRandomUserId(userIds);

                  if (randomUserId !== undefined && await findUserById(randomUserId, ticket.companyId) > 0) {
                    // Update the ticket with the randomly selected userId
                    //ticket.userId = randomUserId;
                    //ticket.save();

                    // if (sendGreetingMessageOneQueues) {
                    //   const ticketToSend = await ShowTicketService(ticket.id, ticket.companyId);
                    //   await SendWhatsAppMessage({ body: `\u200e *Assistente Virtual*:\nAguarde enquanto localizamos um atendente... Você será atendido em breve!`, ticket: ticketToSend });
                    // }

                    await UpdateTicketService({
                      ticketData: { status: "pending", userId: randomUserId, queueId: queueId },
                      ticketId: ticket.id,
                      companyId: ticket.companyId,

                    });

                    //await ticket.reload();
                    logger.info(`Ticket ID ${ticket.id} atualizado para UserId ${randomUserId} - ${ticket.updatedAt}`);
                  } else {
                    //logger.info(`Ticket ID ${ticket.id} NOT updated with UserId ${randomUserId} - ${ticket.updatedAt}`);            
                  }

                } else if (userIds.includes(userId)) {
                  if (tempoPassadoB > updatedAtV) {
                    // ticket.userId is present and is in userIds, exclude it from random selection
                    const availableUserIds = userIds.filter((id) => id !== userId);

                    if (availableUserIds.length > 0) {
                      // Randomly select one of the remaining userIds
                      const randomUserId = getRandomUserId(availableUserIds);

                      if (randomUserId !== undefined && await findUserById(randomUserId, ticket.companyId) > 0) {
                        // Update the ticket with the randomly selected userId
                        //ticket.userId = randomUserId;
                        //ticket.save();

                        // if (sendGreetingMessageOneQueues) {
                        //   const ticketToSend = await ShowTicketService(ticket.id, ticket.companyId);
                        //   await SendWhatsAppMessage({ body: "*Assistente Virtual*:\nAguarde enquanto localizamos um atendente... Você será atendido em breve!", ticket: ticketToSend });
                        // };

                        await UpdateTicketService({
                          ticketData: { status: "pending", userId: randomUserId, queueId: queueId },
                          ticketId: ticket.id,
                          companyId: ticket.companyId,

                        });

                        logger.info(`Ticket ID ${ticket.id} atualizado para UserId ${randomUserId} - ${ticket.updatedAt}`);
                      } else {
                        //logger.info(`Ticket ID ${ticket.id} NOT updated with UserId ${randomUserId} - ${ticket.updatedAt}`);            
                      }

                    }
                  }
                }

              }
            }
           } catch (err: any) {
             logger.error(`[RandomUser] erro empresa ${c.id} fila ${q.id}: ${err?.message}`);
           }
          }));
        }));
      }
    } catch (e) {
      Sentry.captureException(e);
      logger.error(`[VerifyUsersRandom] VerifyUsersRandom: error ${JSON.stringify(e)}`);
      throw e;
    }

  });

  jobR.start();
}

async function handleProcessLanes() {
  const job = new CronJob("*/5 * * * *", async () => {
    const companies = await Company.findAll({
      include: [
        {
          model: Plan,
          as: "plan",
          attributes: ["id", "name", "useKanban"],
          where: {
            useKanban: true
          }
        }
      ]
    });
    await Promise.all(companies.map(async c => {
      try {
        const companyId = c.id;

        const ticketTags = await TicketTag.findAll({
          include: [
            {
              model: Ticket,
              as: "ticket",
              where: {
                status: "open",
                fromMe: true,
                companyId
              },
              attributes: ["id", "contactId", "updatedAt", "whatsappId"]
            },
            {
              model: Tag,
              as: "tag",
              attributes: [
                "id",
                "timeLane",
                "nextLaneId",
                "greetingMessageLane"
              ],
              where: {
                companyId
              }
            }
          ]
        });

        if (ticketTags.length > 0) {
          await Promise.all(ticketTags.map(async t => {
           try {
            if (
              !isNil(t?.tag.nextLaneId) &&
              t?.tag.nextLaneId > 0 &&
              t?.tag.timeLane > 0
            ) {
              const nextTag = await Tag.findByPk(t?.tag.nextLaneId);

              const dataLimite = new Date();
              dataLimite.setMinutes(
                dataLimite.getMinutes() - Number(t.tag.timeLane)
              );
              const dataUltimaInteracaoChamado = new Date(t.ticket.updatedAt);

              if (dataUltimaInteracaoChamado < dataLimite) {
                await TicketTag.destroy({
                  where: { ticketId: t.ticketId, tagId: t.tagId }
                });
                await TicketTag.create({
                  ticketId: t.ticketId,
                  tagId: nextTag.id
                });

                const whatsapp = await Whatsapp.findByPk(t.ticket.whatsappId);

                if (
                  !isNil(nextTag.greetingMessageLane) &&
                  nextTag.greetingMessageLane !== ""
                ) {
                  const bodyMessage = nextTag.greetingMessageLane;

                  const ticketUpdate = await ShowTicketService(
                    t.ticketId,
                    companyId
                  );

                  if (ticketUpdate.channel === "whatsapp") {
                    // Enviar mensagem de texto
                    const sentMessage = await SendWhatsAppMessage({
                      body: bodyMessage,
                      ticket: ticketUpdate
                    });

                    await verifyMessage(
                      sentMessage,
                      ticketUpdate,
                      ticketUpdate.contact
                    );
                  }

                  if (ticketUpdate.channel === "whatsapp_oficial") {
                    await SendWhatsAppOficialMessage({
                      body: bodyMessage,
                      ticket: ticketUpdate,
                      quotedMsg: null,
                      type: 'text',
                      media: null,
                      vCard: null
                    });
                  }

                  // Enviar mídias se existirem
                  if (nextTag.mediaFiles) {
                    try {
                      const mediaFiles = JSON.parse(nextTag.mediaFiles);
                      for (const mediaFile of mediaFiles) {

                        if (ticketUpdate.channel === "whatsapp") {
                          const sentMedia = await SendWhatsAppMedia({
                            media: mediaFile,
                            ticket: ticketUpdate
                          });
                          await verifyMessage(
                            sentMedia,
                            ticketUpdate,
                            ticketUpdate.contact
                          );
                        }

                        if (ticketUpdate.channel === "whatsapp_oficial") {
                          const mediaSrc = {
                            fieldname: 'medias',
                            originalname: mediaFile.originalname,
                            encoding: '7bit',
                            mimetype: mediaFile.mimetype,
                            filename: mediaFile.filename,
                            path: mediaFile.path
                          } as Express.Multer.File

                          await SendWhatsAppOficialMessage({
                            body: "",
                            ticket: ticketUpdate,
                            type: mediaFile.mimetype.split("/")[0],
                            media: mediaSrc
                          });
                        }

                      }

                    } catch (error) {
                    }
                  }
                }
              }
            }
           } catch (err: any) {
             logger.error(`[ProcessLanes] erro ticketTag ${t?.ticketId}: ${err?.message}`);
           }
          }));
        }
      } catch (e: any) {
        Sentry.captureException(e);
        logger.error("Process Lanes -> Verify: error", e.message);
        // não relança para não derrubar o lote inteiro
      }
    }));
  });
  job.start();
}

async function handleCloseTicketsAutomatic() {
  const job = new CronJob("*/5 * * * *", async () => {
    const companies = await Company.findAll({
      where: {
        status: true
      }
    });
    await Promise.all(companies.map(async c => {
      try {
        const companyId = c.id;
        await ClosedAllOpenTickets(companyId);
      } catch (e: any) {
        Sentry.captureException(e);
        logger.error("ClosedAllOpenTickets -> Verify: error", e.message);
        // não relança para não derrubar o lote inteiro
      }
    }));
  });
  job.start();
}

async function handleInvoiceCreate() {
  logger.info("GERANDO RECEITA...");
  const job = new CronJob("0 * * * *", async () => {
    try {
      const companies = await Company.findAll({
        where: {
          generateInvoice: true
        }
      });

      for (const c of companies) {
        try {
          const { status, dueDate, id: companyId, planId } = c;

          // Validar dueDate antes de usar moment
          if (!dueDate || !moment(dueDate).isValid()) {
            logger.warn(`EMPRESA: ${companyId} - dueDate inválido ou nulo: ${dueDate}, pulando...`);
            continue;
          }

          const date = moment(dueDate).format();
          const timestamp = moment().format();
          const hoje = moment().format("DD/MM/yyyy");
          const vencimento = moment(dueDate).format("DD/MM/yyyy");
          const diff = moment(vencimento, "DD/MM/yyyy").diff(
            moment(hoje, "DD/MM/yyyy")
          );
          const dias = moment.duration(diff).asDays();

          if (status === true) {
            // Verifico se a empresa está a mais de 3 dias sem pagamento
            if (dias <= -3) {
              logger.info(
                `EMPRESA: ${companyId} está VENCIDA A MAIS DE 3 DIAS... INATIVANDO... ${dias}`
              );

              await c.update({ status: false });
              logger.info(`EMPRESA: ${companyId} foi INATIVADA.`);
              logger.info(
                `EMPRESA: ${companyId} Desativando conexões com o WhatsApp...`
              );

              try {
                const whatsapps = await Whatsapp.findAll({
                  where: { companyId },
                  attributes: ["id", "status", "session"]
                });

                for (const whatsapp of whatsapps) {
                  if (whatsapp.session) {
                    await whatsapp.update({
                      status: "DISCONNECTED",
                      session: ""
                    });

                    try {
                      const wbot = getWbot(whatsapp.id);
                      await wbot.logout();
                      logger.info(
                        `EMPRESA: ${companyId} teve o WhatsApp ${whatsapp.id} desconectado...`
                      );
                    } catch (wbotError) {
                      logger.warn(
                        `Erro ao desconectar WhatsApp ${whatsapp.id} da empresa ${companyId}: ${wbotError.message}`
                      );
                    }
                  }
                }
              } catch (whatsappError) {
                logger.error(
                  `Erro ao desconectar WhatsApps da empresa ${companyId}: ${whatsappError.message}`
                );
                Sentry.captureException(whatsappError);
              }
            } else {
              // Buscar o plano da empresa
              const plan = await Plan.findByPk(planId);

              if (!plan) {
                logger.error(
                  `EMPRESA: ${companyId} - Plano não encontrado (planId: ${planId})`
                );
                continue;
              }

              const valuePlan = plan.amount.replace(",", ".");

              // Verificar faturas em aberto
              const sql = `SELECT * FROM "Invoices" WHERE "companyId" = ${c.id} AND "status" = 'open';`
              const openInvoices = await sequelize.query(sql, { type: QueryTypes.SELECT }) as { id: number, dueDate: Date | string | null }[];
              const existingInvoice = openInvoices.find(invoice => {
                if (!invoice.dueDate) return false;
                try {
                  const invoiceDate = moment(invoice.dueDate);
                  if (!invoiceDate.isValid()) return false;
                  return invoiceDate.format("DD/MM/yyyy") === vencimento;
                } catch (error) {
                  logger.warn(`Erro ao processar dueDate da fatura ${invoice.id}: ${error.message}`);
                  return false;
                }
              });

              if (existingInvoice) {
                // Due date already exists, no action needed
                //logger.info(`Fatura Existente`);
              }

              if (openInvoices.length > 0) {
                const invoiceToUpdate = openInvoices[0];
                const updateSql = `UPDATE "Invoices" SET "dueDate" = '${date}', value = ${valuePlan} WHERE "id" = ${invoiceToUpdate.id};`;
                await sequelize.query(updateSql, { type: QueryTypes.UPDATE });

                logger.info(`Fatura Atualizada ID: ${invoiceToUpdate.id} com valor ${valuePlan}`);

              } else {
                const sql = `INSERT INTO "Invoices" ("companyId", "dueDate", detail, status, value, users, connections, queues, "updatedAt", "createdAt")
            VALUES (${c.id}, '${date}', '${plan.name}', 'open', ${valuePlan}, ${plan.users}, ${plan.connections}, ${plan.queues}, '${timestamp}', '${timestamp}');`
                const invoiceInsert = await sequelize.query(sql, { type: QueryTypes.INSERT });

                logger.info(`Fatura Gerada para o cliente: ${c.id}`);
              }
            }
          }
        } catch (e: any) {
          Sentry.captureException(e);
          logger.error("InvoiceCreate -> Verify: error", e);
          throw e;
        }
      }
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error("InvoiceCreate -> Verify: error", e);
      throw e;
    }
  });
  job.start();
}

handleInvoiceCreate();
handleProcessLanes();
handleCloseTicketsAutomatic();
handleRandomUser();


async function handleLidRetry(job) {
  try {
    const { data } = job;
    const { contactId, whatsappId, companyId, number, retryCount, maxRetries = 5 } = data as LidRetryData;

    logger.info(`[RDS-LID-RETRY] Tentativa ${retryCount} de obter LID para contato ${contactId} (${number})`);

    // Buscar o contato e o whatsapp
    const contact = await Contact.findByPk(contactId);
    const whatsapp = await Whatsapp.findByPk(whatsappId);

    if (!contact) {
      logger.error(`[RDS-LID-RETRY] Contato ${contactId} não encontrado. Cancelando retentativa.`);
      return;
    }

    if (!whatsapp || whatsapp.status !== "CONNECTED") {
      logger.error(`[RDS-LID-RETRY] WhatsApp ${whatsappId} não está conectado. Reagendando retentativa.`);

      // Se ainda não atingiu o limite de retentativas, reagendar
      if (retryCount < maxRetries) {
        await lidRetryQueue.add(
          "RetryLidLookup",
          {
            contactId,
            whatsappId,
            companyId,
            number,
            retryCount: retryCount + 1,
            maxRetries
          },
          {
            delay: 5 * 60 * 1000, // 5 minutos de espera entre tentativas
            attempts: 1,
            removeOnComplete: true
          }
        );
      } else {
        logger.warn(`[RDS-LID-RETRY] Número máximo de tentativas (${maxRetries}) atingido para contato ${contactId}. Desistindo.`);
      }
      return;
    }

    try {
      // ✅ v7: Verificar localmente via WhatsappLidMap antes de chamar onWhatsApp
      const localMap = await WhatsappLidMap.findOne({
        where: { companyId, contactId }
      });

      if (localMap) {
        logger.info(`[RDS-LID-RETRY] LID já existe localmente para contato ${contactId}: ${localMap.lid}`);

        // Atualizar o campo lid do contato se ainda não estiver preenchido
        if (!contact.lid || contact.lid !== localMap.lid) {
          await contact.update({ lid: localMap.lid });
        }

        return; // Resolvido localmente, sem necessidade de chamar onWhatsApp
      }

      // Fallback: Obter a instância do WhatsApp e consultar onWhatsApp
      const wbot = getWbot(whatsappId);

      if (!wbot) {
        throw new Error(`Instância WhatsApp ${whatsappId} não encontrada no wbot`);
      }

      // Formatar o número adequadamente se não terminar com @s.whatsapp.net
      const formattedNumber = number.endsWith("@s.whatsapp.net") ? number : `${number}@s.whatsapp.net`;

      // Fazer a consulta ao WhatsApp
      const ow = await wbot.onWhatsApp(formattedNumber);

      if (ow?.[0]?.exists) {
        const lid = (ow[0] as any).lid as string;

        if (lid) {
          logger.info(`[RDS-LID-RETRY] LID ${lid} obtido via onWhatsApp para contato ${contactId}`);

          // Verificar e deduplicar contatos
          // mergeContacts espera dois objetos Contact; aqui o merge é feito via WhatsappLidMap abaixo

          // Criar o mapeamento de LID
          await WhatsappLidMap.findOrCreate({
            where: { companyId, contactId, lid },
            defaults: { companyId, contactId, lid }
          });

          // Atualizar o campo lid do contato se ainda não estiver preenchido
          if (!contact.lid) {
            await contact.update({ lid });
          }

          logger.info(`[RDS-LID-RETRY] Mapeamento de LID criado/atualizado para contato ${contactId}`);
          return;
        }
      }

      // Se chegou aqui, não conseguiu obter o LID
      logger.warn(`[RDS-LID-RETRY] Não foi possível obter LID para contato ${contactId} (${number})`);

      // Se ainda não atingiu o limite de retentativas, reagendar
      if (retryCount < maxRetries) {
        await lidRetryQueue.add(
          "RetryLidLookup",
          {
            contactId,
            whatsappId,
            companyId,
            number,
            retryCount: retryCount + 1,
            maxRetries
          },
          {
            delay: Math.pow(2, retryCount) * 60 * 1000, // Backoff exponencial (1min, 2min, 4min, 8min, etc)
            attempts: 1,
            removeOnComplete: true
          }
        );

        logger.info(`[RDS-LID-RETRY] Reagendada tentativa ${retryCount + 1} para contato ${contactId}`);
      } else {
        logger.warn(`[RDS-LID-RETRY] Número máximo de tentativas (${maxRetries}) atingido para contato ${contactId}. Desistindo.`);
      }
    } catch (error) {
      logger.error(`[RDS-LID-RETRY] Erro ao processar retentativa para contato ${contactId}: ${error.message}`);

      // Reagendar em caso de erro se não atingiu o limite de retentativas
      if (retryCount < maxRetries) {
        await lidRetryQueue.add(
          "RetryLidLookup",
          {
            contactId,
            whatsappId,
            companyId,
            number,
            retryCount: retryCount + 1,
            maxRetries
          },
          {
            delay: Math.pow(2, retryCount) * 60 * 1000, // Backoff exponencial
            attempts: 1,
            removeOnComplete: true
          }
        );
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`[RDS-LID-RETRY] Erro geral no processador de retentativas: ${err.message}`);
  }
}

/**
 * Job: ExpireAwaitingFollowUps
 * Marca como expirados os CampaignShipping (API Oficial) cujo template foi enviado
 * há mais de 24h (janela da Meta) sem resposta do cliente. Isso impede o disparo
 * tardio das mensagens 2-5 e mantém a métrica "Aguardando resposta" limpa.
 */
async function handleExpireAwaitingFollowUps(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [affectedCount] = await CampaignShipping.update(
      { followUpExpiredAt: new Date() } as any,
      {
        where: {
          awaitingResponseSince: { [Op.ne]: null, [Op.lt]: cutoff } as any,
          followUpSentAt: { [Op.is]: null } as any,
          followUpExpiredAt: { [Op.is]: null } as any
        } as any
      }
    );

    if (affectedCount > 0) {
      logger.info(
        `[EXPIRE-FOLLOWUPS] ${affectedCount} CampaignShipping marcado(s) como expirado(s) (janela 24h da Meta)`
      );
    }
  } catch (err: any) {
    Sentry.captureException(err);
    logger.error(`[EXPIRE-FOLLOWUPS] Erro: ${err?.message || err}`);
  }
}

export async function startQueueProcess() {
  logger.info("Iniciando processamento de filas");

  messageQueue.process("SendMessage", handleSendMessage);

  scheduleMonitor.process("Verify", handleVerifySchedules);
  scheduleMonitor.process("VerifyReminders", handleVerifyReminders);

  sendScheduledMessages.process("SendMessage", handleSendScheduledMessage);

  campaignQueue.process("ProcessCampaign", handleProcessCampaign);

  campaignQueue.process("PrepareContact", handlePrepareContact);

  campaignQueue.process("DispatchCampaign", handleDispatchCampaign);

  // Ligações em paralelo. O teto vem do ambiente para poder ser ajustado sem
  // recompilar; 5 é conservador e fica abaixo do limite de 8 chamadas
  // simultâneas por conexão imposto pelo microserviço de voz.
  const ligacoesSimultaneas =
    parseInt(process.env.VOICE_CAMPAIGN_CONCURRENCY || "", 10) || 5;
  voiceCampaignQueue.process(
    "DispatchVoiceCall",
    ligacoesSimultaneas,
    handleDispatchVoiceCall
  );

  userMonitor.process("VerifyLoginStatus", handleLoginStatus);

  queueMonitor.process("VerifyQueueStatus", handleVerifyQueue);

  lidRetryQueue.process("RetryLidLookup", handleLidRetry);

  initializeBirthdayJobs();
  
  // Inicializar job do Floup
  const { initializeFloupJob } = await import("./jobs/FloupJob");
  initializeFloupJob();

  scheduleMonitor.add(
    "Verify",
    {},
    {
      repeat: { cron: "0 * * * * *", key: "verify" },
      removeOnComplete: true
    }
  );

  // ✅ Adicionar verificação de lembretes
  scheduleMonitor.add(
    "VerifyReminders",
    {},
    {
      repeat: { cron: "0 * * * * *", key: "verify-reminders" },
      removeOnComplete: true
    }
  );

  campaignQueue.add(
    "VerifyCampaignsDaatabase",
    {},
    {
      repeat: { cron: "*/60 * * * * *", key: "verify-campaing" },
      removeOnComplete: true
    }
  );

  userMonitor.add(
    "VerifyLoginStatus",
    {},
    {
      repeat: { cron: "*/3 * * * *", key: "verify-login" },
      removeOnComplete: true
    }
  );

  queueMonitor.add(
    "VerifyQueueStatus",
    {},
    {
      repeat: { cron: "0 * * * * *", key: "verify-queue" },
      removeOnComplete: true
    }
  );

  // ✅ Recovery job: a cada 5 minutos, verifica campanhas perdidas (PROGRAMADA com scheduledAt no passado)
  campaignQueue.add(
    "RecoverLostCampaigns",
    {},
    {
      repeat: { cron: "*/5 * * * *", key: "recover-lost-campaigns" },
      removeOnComplete: true
    }
  );

  // ✅ Expiração da janela de 24h da Meta (API Oficial): a cada 15 minutos
  campaignQueue.process("ExpireAwaitingFollowUps", handleExpireAwaitingFollowUps);
  campaignQueue.add(
    "ExpireAwaitingFollowUps",
    {},
    {
      repeat: { cron: "*/15 * * * *", key: "expire-awaiting-followups" },
      removeOnComplete: true
    }
  );

  // ✅ Processador para campanhas perdidas (PROGRAMADA com scheduledAt no passado)
  // ANTES: estes jobs eram adicionados mas nunca processados, resultando em campanhas
  // Baileys/API Oficial presas eternamente como "PROGRAMADA" mesmo com horário vencido.
  const handleVerifyAndDispatchCampaigns = async () => {
    try {
      const now = moment().toDate();

      // Campanhas PROGRAMADA / INATIVA cujo horário já passou
      const lostCampaigns = await Campaign.findAll({
        where: {
          status: { [Op.in]: ["PROGRAMADA", "INATIVA"] },
          scheduledAt: { [Op.lte]: now }
        },
        order: [["scheduledAt", "ASC"]],
        limit: 50
      });

      if (lostCampaigns.length === 0) return;

      logger.info(`[CAMPAIGN-RECOVERY] ${lostCampaigns.length} campanha(s) com hor\u00e1rio vencido detectada(s) — disparando agora`);

      for (const camp of lostCampaigns) {
        try {
          // Atualiza status atomicamente para evitar disparo duplicado por outro tick
          const [updatedRows] = await Campaign.update(
            { status: "EM_ANDAMENTO" },
            {
              where: {
                id: camp.id,
                status: { [Op.in]: ["PROGRAMADA", "INATIVA"] }
              }
            }
          );

          if (updatedRows === 0) {
            // Outro processo j\u00e1 pegou
            continue;
          }

          await campaignQueue.add(
            "ProcessCampaign",
            { id: camp.id, delay: 5000 },
            { removeOnComplete: true, removeOnFail: true }
          );

          // Notificar frontend
          const updated = await Campaign.findByPk(camp.id);
          if (updated) {
            const io = getIO();
            io.of(String(camp.companyId)).emit(
              `company-${camp.companyId}-campaign`,
              { action: "update", record: updated }
            );
          }

          logger.info(`[CAMPAIGN-RECOVERY] Campanha ${camp.id} (${camp.name}) enfileirada para disparo`);
        } catch (innerErr: any) {
          logger.error(`[CAMPAIGN-RECOVERY] Erro ao recuperar campanha ${camp.id}: ${innerErr.message}`);
        }
      }
    } catch (err: any) {
      logger.error(`[CAMPAIGN-RECOVERY] Erro no verificador de campanhas: ${err.message}`);
      Sentry.captureException(err);
    }
  };

  campaignQueue.process("VerifyCampaignsDaatabase", handleVerifyAndDispatchCampaigns);
  campaignQueue.process("RecoverLostCampaigns", handleVerifyAndDispatchCampaigns);
}
