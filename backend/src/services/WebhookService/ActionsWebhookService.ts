import AppError from "../../errors/AppError";
import moment from "moment-timezone";
import { WebhookModel } from "../../models/Webhook";
import { obterNomeEExtensaoDoArquivo, sendMessageFlow } from "../../controllers/MessageController";
import { SendMessageFlow } from "../../helpers/SendMessageFlow";
import { buildAiAgentGreeting, buildAiAgentGreetingFromPromptLanguages } from "../../helpers/AiAgentGreeting";
import { IConnections, INodes } from "./DispatchWebHookService";
import { resolveFlowEntryNodeId } from "./resolveFlowEntryNodeId";

import { Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import CreateContactService from "../ContactServices/CreateContactService";
import Contact from "../../models/Contact";
import CreateTicketService from "../TicketServices/CreateTicketService";
// import CreateTicketServiceWebhook from "../TicketServices/CreateTicketServiceWebhook";
import { SendMessage } from "../../helpers/SendMessage";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import fs from "fs";
import GetWhatsappWbot from "../../helpers/GetWhatsappWbot";
import path from "path";
import SendWhatsAppMedia from "../WbotServices/SendWhatsAppMedia";
import SendWhatsAppMediaFlow, { typeSimulation } from "../WbotServices/SendWhatsAppMediaFlow";
import { randomizarCaminho } from "../../utils/randomizador";
// import { SendMessageFlow } from "../../helpers/SendMessageFlow";
import formatBody from "../../helpers/Mustache";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import ShowTicketService from "../TicketServices/ShowTicketService";
import CreateMessageService, {
  MessageData
} from "../MessageServices/CreateMessageService";
import { randomString } from "../../utils/randomCode";
import ShowQueueService from "../QueueService/ShowQueueService";
import Queue from "../../models/Queue";
import Prompt from "../../models/Prompt";
import UserRating from "../../models/UserRating";
import Schedule from "../../models/Schedule";
import TicketNote from "../../models/TicketNote";
import { getIO } from "../../libs/socket";
import { emitFlowNodeEvent } from "./emitFlowNodeEvent";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import { pickDistributionTarget } from "../FlowBuilderService/DistributionService";
import MoveTicketToKanbanService from "../FlowBuilderService/MoveTicketToKanbanService";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import ShowTicketUUIDService from "../TicketServices/ShowTicketFromUUIDService";
import logger from "../../utils/logger";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";
import CompaniesSettings from "../../models/CompaniesSettings";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import SyncTags from "../TagServices/SyncTagsService";
import Tag from "../../models/Tag";
import ContactTag from "../../models/ContactTag";
import flowBuilderQueue from "./flowBuilderQueue";
import { proto } from "@whiskeysockets/baileys";
import { getWbot } from "../../libs/wbot";
import SendWhatsAppOficialMessage from "../WhatsAppOficial/SendWhatsAppOficialMessage";
import Whatsapp from "../../models/Whatsapp";
import axios from "axios";
import https from "https";
import { flowbuilderIntegration } from "../WbotServices/wbotMessageListener";
import HandleFlowExitKeyword from "../FlowBuilderService/HandleFlowExitKeyword";
import { logN8NExecution } from "../N8NLogService/LogN8NExecution";

const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
import { handleOpenAiFlow, isWithinWorkingHours } from "../IntegrationsServices/OpenAiService";
import { IOpenAi } from "../../@types/openai";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import {
  fetchPendingBoletosByDoc,
  formatBoletosMessage,
  fetchPixForBoleto,
  renderBoletoTemplate,
  isValidCpfCnpj,
  sanitizeDoc
} from "../AsaasServices/AsaasService";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import { detectChannel, sendQueueGreeting, sendTextByChannel } from "../../helpers/SendGreetingMessage";
import { scheduleFlowWaitTimer, cancelFlowWaitTimer } from "./FlowWaitTimerService";
import mimeTypes from "mime-types";
import { SendWacallsMediaMessage } from "../WacallsServices/SendWacallsMessageService";
import AppointmentService from "../../models/AppointmentService";
import AppointmentServiceProfessional from "../../models/AppointmentServiceProfessional";
import User from "../../models/User";
import Company from "../../models/Company";
import {
  createBooking,
  listAvailableSlots
} from "../AppointmentService/BookingService";
import getAppointmentBookingMessage from "../AppointmentService/BookingMessages";

// Nós de mídia do FlowBuilder (imagem/áudio/vídeo/documento/application) e o
// PIX de boleto usam SendWhatsAppMediaFlow (Baileys-only) — sem um branch
// próprio pra wacalls, conexões WhatsApp Plus simplesmente não enviavam
// nada nesses nós. Monta um "arquivo" no formato que SendWacallsMediaMessage
// espera (mesmo padrão usado no despacho de campanhas via wacalls em
// queues.ts) a partir de um caminho local, e delega pro envio real.
const sendWacallsFlowMedia = async (
  ticketForSend: Ticket,
  filePath: string,
  caption?: string
): Promise<void> => {
  const mimetype = (mimeTypes.lookup(filePath) || "application/octet-stream") as string;
  const stat = fs.statSync(filePath);
  const fakeFile: any = {
    fieldname: "file",
    originalname: path.basename(filePath),
    encoding: "7bit",
    mimetype,
    size: stat.size,
    destination: path.dirname(filePath),
    filename: path.basename(filePath),
    path: filePath
  };
  await SendWacallsMediaMessage({ ticket: ticketForSend, media: fakeFile, body: caption || "" });
};


declare global {
  namespace NodeJS {
    interface Global {
      flowVariables: Record<string, any>;
    }
  }
}

if (!global.flowVariables) {
  global.flowVariables = {};
}

// Timers agendados para o nó "Aguardar Resposta do Cliente" (lembrete/timeout).
// Chave: `${ticketId}_${nodeId}` — evita empilhar timers em re-entradas.
const waitInputTimers: Map<string, NodeJS.Timeout[]> = (global as any).__waitInputTimers
  || ((global as any).__waitInputTimers = new Map());

export const clearWaitInputTimers = (ticketId: number, nodeId?: string) => {
  for (const key of Array.from(waitInputTimers.keys())) {
    if (key.startsWith(`${ticketId}_`) && (!nodeId || key === `${ticketId}_${nodeId}`)) {
      const timers = waitInputTimers.get(key) || [];
      timers.forEach(t => clearTimeout(t));
      waitInputTimers.delete(key);
    }
  }
};
interface IAddContact {
  companyId: number;
  name: string;
  phoneNumber: string;
  email?: string;
  dataMore?: any;
}

interface DataNoWebhook {
  nome: string;
  numero: string;
  email: string;
}

// ✅ Função auxiliar: busca ticket com whatsapp incluído (necessário para SendWhatsAppOficialMessage)
const getTicketWithWhatsapp = async (ticketId: number, whatsappId?: number, companyId?: number): Promise<Ticket | null> => {
  const where: any = { id: ticketId };
  if (whatsappId) where.whatsappId = whatsappId;
  if (companyId) where.companyId = companyId;
  return Ticket.findOne({
    where,
    include: [
      { model: Contact, as: "contact", attributes: ["id", "name", "number", "email", "profilePicUrl"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name", "token", "channel", "status", "tokenMeta", "send_token", "zapiInstanceId", "zapiToken", "zapiClientToken"] }
    ]
  });
};

// Resolve uma variável do fluxo suportando acesso por ponto em JSON.
// Ex.: "cnpj.razao_social" busca a variável "cnpj" (que pode ser um objeto
// ou uma string JSON) e navega até a propriedade "razao_social".
const resolveFlowVariable = (rawName: string, ticketId?: number): any => {
  if (!rawName) return undefined;
  const name = rawName.trim();

  const lookup = (key: string): any => {
    if (ticketId) {
      const tv = global.flowVariables[`${ticketId}_${key}`];
      if (tv !== null && tv !== undefined) return tv;
    }
    return global.flowVariables[key];
  };

  // 1) Tentativa direta (nome exato, inclusive nomes com pontos salvos achatados)
  const direct = lookup(name);
  if (direct !== null && direct !== undefined) return direct;

  // 2) Acesso por ponto: navega em objeto/JSON
  if (name.includes(".")) {
    const parts = name.split(".");
    let base = lookup(parts[0]);
    if (base === null || base === undefined) return undefined;

    if (typeof base === "string") {
      const trimmed = base.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          base = JSON.parse(trimmed);
        } catch {
          return undefined;
        }
      } else {
        return undefined;
      }
    }

    let value: any = base;
    for (let i = 1; i < parts.length; i += 1) {
      if (value === null || value === undefined) return undefined;
      // Desempacota arrays do n8n: [{...}] -> {...}
      if (Array.isArray(value) && value.length > 0) value = value[0];
      if (typeof value !== "object") return undefined;
      value = value[parts[i]];
    }
    return value;
  }

  return undefined;
};

const processVariableValue = (text: string, dataWebhook: any, ticketId?: number): string => {
  if (!text) return "";


  if (text.includes("${")) {
    const regex = /\${([^}]+)}/g;
    let match;
    let processedText = text;

    while ((match = regex.exec(text)) !== null) {
      const variableName = match[1];


      let variableValue = resolveFlowVariable(variableName, ticketId);


      if (variableValue !== null && variableValue !== undefined) {
        // Objetos/arrays viram JSON legível
        if (typeof variableValue === "object") {
          variableValue = JSON.stringify(variableValue);
        }
        // Normalizar o valor: trim + remover caracteres invisíveis
        const cleanValue = variableValue.toString()
          .trim()
          .replace(/[\r\n\u200e\u200f\u200b]/g, "");
        processedText = processedText.replace(
          match[0],
          cleanValue
        );
      }
    }

    return processedText;
  }

  return text;
};

const compareValues = (value1: string, value2: string, operator: string): boolean => {
  // Normalizar valores — nunca null/undefined nas comparações
  const v1 = value1 !== null && value1 !== undefined ? String(value1) : "";
  const v2 = value2 !== null && value2 !== undefined ? String(value2) : "";

  // Versões lowercase para comparações case-insensitive
  const low1 = v1.toLowerCase().trim();
  const low2 = v2.toLowerCase().trim();

  // Versões numéricas (tentativa)
  const num1 = parseFloat(v1.replace(",", "."));
  const num2 = parseFloat(v2.replace(",", "."));
  const bothNumeric = !isNaN(num1) && !isNaN(num2);

  logger.info(`[IF/ELSE] "${v1}" ${operator} "${v2}" | numeric: ${bothNumeric ? `${num1} vs ${num2}` : "n/a"}`);

  switch (operator) {
    // ── Igualdade ────────────────────────────────────────────────────────────
    case "equals":
      // Tenta comparação numérica primeiro, depois textual
      if (bothNumeric) return num1 === num2;
      return low1 === low2;

    case "notEquals":
      if (bothNumeric) return num1 !== num2;
      return low1 !== low2;

    // ── Texto ────────────────────────────────────────────────────────────────
    case "contains":
      return low1.includes(low2);

    case "notContains":
      return !low1.includes(low2);

    case "startsWith":
      return low1.startsWith(low2);

    case "endsWith":
      return low1.endsWith(low2);

    case "containsAny": {
      // Valor2 pode ser lista separada por vírgula: "sim,s,yes"
      const tokens = low2.split(",").map(t => t.trim()).filter(Boolean);
      return tokens.some(t => low1.includes(t));
    }

    // ── Numérico ─────────────────────────────────────────────────────────────
    case "greaterThan":
      if (!bothNumeric) {
        logger.warn(`[IF/ELSE] greaterThan: valores não numéricos ("${v1}", "${v2}") — retorna false`);
        return false;
      }
      return num1 > num2;

    case "lessThan":
      if (!bothNumeric) {
        logger.warn(`[IF/ELSE] lessThan: valores não numéricos ("${v1}", "${v2}") — retorna false`);
        return false;
      }
      return num1 < num2;

    case "greaterOrEqual":
      if (!bothNumeric) return false;
      return num1 >= num2;

    case "lessOrEqual":
      if (!bothNumeric) return false;
      return num1 <= num2;

    // ── Vazio / Não vazio ────────────────────────────────────────────────────
    case "isEmpty":
      return v1.trim() === "";

    case "isNotEmpty":
      return v1.trim() !== "";

    // ── Regex ────────────────────────────────────────────────────────────────
    case "regex":
      try {
        const re = new RegExp(v2, "i");
        return re.test(v1);
      } catch (e) {
        logger.error(`[IF/ELSE] Regex inválido: "${v2}" — ${e.message}`);
        return false;
      }

    default:
      logger.error(`[IF/ELSE] Operador desconhecido: "${operator}"`);
      return false;
  }
};

// ✅ Auto-popular variáveis do ticket (tags, fila, contato, conexão, status)
// para uso no nó conditionCompare e em qualquer ${variavel} dentro do fluxo.
// Ex.: ${ticketTags} contém "SUPORTE", ${ticketQueue} igual "Suporte"
const populateTicketAutoVariables = async (idTicket?: string | number): Promise<void> => {
  try {
    if (!idTicket) return;
    const ticket = await Ticket.findByPk(idTicket as any, {
      include: [
        { model: Contact, as: "contact", attributes: ["id", "name", "number", "email"] },
        { model: Queue, as: "queue", attributes: ["id", "name"] },
        { model: Whatsapp, as: "whatsapp", attributes: ["id", "name"] },
        { model: Tag, as: "tags", attributes: ["id", "name"], through: { attributes: [] } }
      ]
    });
    if (!ticket) return;

    const tagsList = (ticket as any).tags || [];
    const tagsCsv = tagsList.map((t: any) => (t?.name || "").toString().trim()).filter(Boolean).join(",");

    const vars: Record<string, any> = {
      nome: (ticket as any).contact?.name || "",
      email: (ticket as any).contact?.email || "",
      telefone: (ticket as any).contact?.number || "",
      ticketId: String(ticket.id || ""),
      ticketStatus: ticket.status || "",
      ticketQueue: (ticket as any).queue?.name || "",
      ticketQueueId: ticket.queueId ? String(ticket.queueId) : "",
      ticketConnection: (ticket as any).whatsapp?.name || "",
      ticketConnectionId: ticket.whatsappId ? String(ticket.whatsappId) : "",
      ticketTags: tagsCsv,
      ticketIsOpen: ticket.status === "open" ? "true" : "false",
      ticketIsClosed: ticket.status === "closed" ? "true" : "false",
      ticketIsPending: ticket.status === "pending" ? "true" : "false",
      ticketUserId: ticket.userId ? String(ticket.userId) : ""
    };

    Object.entries(vars).forEach(([k, v]) => {
      global.flowVariables[`${idTicket}_${k}`] = v;
      // Também grava sem prefixo como fallback (compatibilidade com fluxos antigos)
      if (global.flowVariables[k] === undefined) global.flowVariables[k] = v;
    });

    logger.info(`[FLOW VARS] Auto-vars do ticket ${idTicket} populadas: ticketQueue="${vars.ticketQueue}", ticketTags="${vars.ticketTags}"`);
  } catch (e: any) {
    logger.warn(`[FLOW VARS] Falha ao popular auto-vars: ${e?.message}`);
  }
};

const finalizeTriggeredFlow = async (
  ticket: Ticket,
  nodeSelected: any,
  companyId: number,
  finalStatus: string = "open"
) => {
  try {
    // ✅ CORRIGIDO: Para tickets pending (fluxo automático), também limpar estado do fluxo e marcar como executado
    if (ticket.status === "pending") {
      logger.debug(`[TICKET UPDATE] Finalizando fluxo automático para ticket ${ticket.id} (status: pending)`);
      try {
        await ticket.update({
          flowWebhook: false,
          lastFlowId: null,
          hashFlowId: null,
          flowStopped: null,
          dataWebhook: null,
          useIntegration: null,
          integrationId: null,
          isBot: false,
          // ✅ CHAVE: Incrementar amountUsedBotQueues para marcar que o fluxo já foi executado
          // Isso impede que o fluxo reinicie quando o contato mandar nova mensagem
          amountUsedBotQueues: (ticket.amountUsedBotQueues || 0) + 1
        });
        logger.debug(`[TICKET UPDATE] Ticket ${ticket.id} (pending) - estado do fluxo limpo, amountUsedBotQueues incrementado`);
      } catch (err) {
        logger.error(`[TICKET UPDATE] Erro ao finalizar fluxo automático para ticket ${ticket.id}:`, err);
      }
      return;
    }

    // Verificar se o ticket está com status "open" (fluxo disparado manualmente)
    if (ticket.status === "open") {
      logger.debug(`[TICKET UPDATE] Finalizando fluxo disparado manualmente para ticket ${ticket.id}`);

      // Determinar status final baseado no nó ou usar "pending" como padrão
      let targetStatus = finalStatus;

      // Se o nó tem configuração de status final, usar essa configuração
      if (nodeSelected?.data?.finalStatus) {
        targetStatus = nodeSelected.data.finalStatus;
        logger.debug(`[TICKET UPDATE] Status final definido pelo nó: ${targetStatus}`);
      }

      logger.debug(`[TICKET UPDATE] Ticket ${ticket.id} será alterado para status: ${targetStatus}`);

      // Atualizar ticket para o status final
      await UpdateTicketService({
        ticketData: {
          status: targetStatus,
          userId: ticket.userId,
          flowWebhook: false,
          lastFlowId: null,
          hashFlowId: null,
          flowStopped: null,
          dataWebhook: null,
          isBot: false,
          isTransfered: false,
          amountUsedBotQueues: (ticket.amountUsedBotQueues || 0) + 1
        },
        ticketId: ticket.id,
        companyId
      });

      logger.debug(`[TICKET UPDATE] Ticket ${ticket.id} atualizado com sucesso - Status: ${targetStatus}, FlowWebhook: false, LastFlowId: null`);

      // Criar log da finalização
      await CreateLogTicketService({
        userId: ticket.userId,
        ticketId: ticket.id,
        type: "open",
        queueId: ticket.queueId
      });

      logger.debug(`[TICKET UPDATE] Log criado para finalização do fluxo - Ticket ${ticket.id}`);
    }
    logger.debug(`[TICKET UPDATE] Log criado para finalização do fluxo - Ticket ${ticket.id}`);

  } catch (error) {
    logger.error(`[TICKET UPDATE ERROR] Erro ao finalizar fluxo disparado manualmente para ticket ${ticket.id}:`, error);
  }
};

export const ActionsWebhookService = async (
  whatsappId: number,
  idFlowDb: number,
  companyId: number,
  nodes: INodes[],
  connects: IConnections[],
  nextStage: string,
  dataWebhook: any,
  details: any,
  hashWebhookId: string,
  pressKey?: string,
  idTicket?: number,
  numberPhrase: "" | { number: string; name: string; email: string } = "",
  inputResponded: boolean = false,
  msg?: proto.IWebMessageInfo,
  isManualTrigger: boolean = false
): Promise<string> => {


  logger.info(`[ACTIONS WEBHOOK] ========== INICIANDO SERVIÇO ==========`);
  logger.info(`[ACTIONS WEBHOOK] WhatsApp ID: ${whatsappId}, Company ID: ${companyId}`);
  logger.info(`[ACTIONS WEBHOOK] Ticket ID: ${idTicket || 'N/A'}, Flow ID: ${idFlowDb}`);
  logger.info(`[ACTIONS WEBHOOK] Next Stage: ${nextStage}, PressKey: ${pressKey || 'N/A'}`);
  logger.info(`[ACTIONS WEBHOOK] Hash Webhook ID: ${hashWebhookId || 'N/A'}`);
  logger.info(`[ACTIONS WEBHOOK] Total de nós: ${nodes?.length || 0}, Total de conexões: ${connects?.length || 0}`);

  // ✅ Garantir hash válido para continuidade do fluxo (evita hash vazio em flowIdWelcome/flowIdNotPhrase)
  if (!hashWebhookId || !String(hashWebhookId).trim()) {
    hashWebhookId = randomString(32);
    logger.warn(`[ACTIONS WEBHOOK] hashWebhookId ausente/vazio - gerado novo hash: ${hashWebhookId}`);
  }

  // ✅ VALIDAÇÃO DOS PARÂMETROS ESSENCIAIS
  if (!nodes || nodes.length === 0) {
    logger.error(`[ACTIONS WEBHOOK] ❌ Nenhum nó foi fornecido ao serviço!`);
    return "no_nodes";
  }

  if (!whatsappId || !companyId) {
    logger.error(`[ACTIONS WEBHOOK] ❌ WhatsApp ID ou Company ID não fornecidos!`);
    return "missing_ids";
  }

  try {
    const io = getIO()
    let next = nextStage;

    // ⏱️ Contabilizar execução do fluxo (apenas ao iniciar uma nova execução).
    // Considera "início" quando não há pressKey/inputResponded (não é continuação do usuário)
    // e o ticket ainda não tem lastFlowId persistido para este fluxo.
    try {
      if (idFlowDb && !pressKey && !inputResponded) {
        let shouldCount = true;
        if (idTicket) {
          const t = await Ticket.findByPk(idTicket);
          if (t?.lastFlowId) shouldCount = false;
        }
        if (shouldCount) {
          await FlowBuilderModel.increment(
            { executionCount: 1 },
            { where: { id: idFlowDb, company_id: companyId } }
          );
          logger.info(`[ACTIONS WEBHOOK] executionCount incrementado para fluxo ${idFlowDb}`);
        }
      }
    } catch (incErr) {
      logger.warn(`[ACTIONS WEBHOOK] Falha ao incrementar executionCount: ${incErr?.message || incErr}`);
    }

    let createFieldJsonName = "";
    let ticket = null;
    const connectStatic = connects;
    if (numberPhrase === "") {
      const nameInput = details.inputs.find(item => item.keyValue === "nome");
      nameInput.data.split(",").map(dataN => {
        const lineToData = details.keysFull.find(item => item === dataN);
        let sumRes = "";
        if (!lineToData) {
          sumRes = dataN;
        } else {
          sumRes = constructJsonLine(lineToData, dataWebhook);
        }
        createFieldJsonName = createFieldJsonName + sumRes
      });
    } else {
      createFieldJsonName = numberPhrase.name;
    }


    if (idTicket) {
      const currentTicket = await Ticket.findByPk(idTicket);


      const isInitialStage = nextStage === "start" || nextStage === "1"; // normalmente o nó inicial é "start" ou "1"


      // ✅ CRÍTICO: Verificar se o fluxo está realmente executando (não apenas se tem flowWebhook)
      // Se flowWebhook=true, lastFlowId existe, mas não há pressKey (resposta do usuário) ou inputResponded,
      // então o fluxo está em execução e não devemos iniciar uma nova execução paralela
      // EXCEÇÃO: Se há pressKey ou inputResponded, é uma resposta legítima do usuário e deve continuar
      const hasUserResponse = !!pressKey || !!inputResponded;
      const isFlowActive = currentTicket?.flowWebhook && currentTicket?.lastFlowId;
      
      // Se o fluxo está ativo mas não há resposta do usuário e não é estágio inicial, bloquear
      if (isFlowActive && !hasUserResponse && !isInitialStage) {
        return "already_running";
      }

      if (!currentTicket?.flowWebhook || !currentTicket?.lastFlowId || isInitialStage || hasUserResponse) {
      }
      else {
        return "already_running";
      }

      if (pressKey) {
      } else if (isInitialStage) {
      }
    }

    ticket = await Ticket.findByPk(idTicket);
    if (ticket && !ticket.flowWebhook) {
      await ticket.update({
        flowWebhook: true,
        flowStopped: idFlowDb.toString(),
        hashFlowId: hashWebhookId
      });
    }



    let numberClient = "";

    if (numberPhrase === "") {
      const numberInput = details.inputs.find(
        item => item.keyValue === "celular"
      );

      numberInput.data.split(",").map(dataN => {
        const lineToDataNumber = details.keysFull.find(item => item === dataN);
        let createFieldJsonNumber = "";
        if (!lineToDataNumber) {
          createFieldJsonNumber = dataN;
        } else {
          createFieldJsonNumber = constructJsonLine(
            lineToDataNumber,
            dataWebhook
          );
        }

        numberClient = numberClient + createFieldJsonNumber;
      });
    } else {
      numberClient = numberPhrase.number;
    }

    numberClient = removerNaoLetrasNumeros(numberClient);

    if (numberClient.substring(0, 2) === "55") {
      if (parseInt(numberClient.substring(2, 4)) >= 31) {
        if (numberClient.length === 13) {
          numberClient =
            numberClient.substring(0, 4) + numberClient.substring(5, 13);
        }
      }
    }

    let createFieldJsonEmail = "";

    if (numberPhrase === "") {
      const emailInput = details.inputs.find(item => item.keyValue === "email");
      emailInput.data.split(",").map(dataN => {

        const lineToDataEmail = details.keysFull.find(item =>
          item.endsWith("email")
        );

        let sumRes = "";
        if (!lineToDataEmail) {
          sumRes = dataN;
        } else {
          sumRes = constructJsonLine(lineToDataEmail, dataWebhook);
        }

        createFieldJsonEmail = createFieldJsonEmail + sumRes;
      });
    } else {
      createFieldJsonEmail = numberPhrase.email;
    }

    const lengthLoop = nodes.length;

    const whatsapp = await Whatsapp.findByPk(whatsappId);

    if (whatsapp.status !== "CONNECTED") {
      return;
    }

    let execCount = 0;

    let execFn = "";



    let noAlterNext = false;
    let isMenu: boolean;
    let lastProcessedNodeId: string | null = null;
    const visitedTerminalNodes = new Set<string>();

    for (var i = 0; i < lengthLoop; i++) {
      logger.info(`[FLOW LOOP] ========== Iteração ${i + 1}/${lengthLoop} - Next: ${next}, ExecCount: ${execCount} ==========`);

      // ✅ Verificar se ainda há próximo nó válido
      if (!next || next === "") {
        logger.warn(`[FLOW LOOP] Next está vazio na iteração ${i + 1} - finalizando loop`);
        break;
      }

      // ✅ Guard anti-repetição: se estamos prestes a re-processar o mesmo nó
      // sem input do usuário (pressKey) OU se já visitamos um nó terminal (sem
      // conexões de saída), finalizar o fluxo imediatamente para evitar loop.
      const upcomingNode = nodes.find(n => n.id === next);
      const upcomingHasOutgoing = upcomingNode
        ? connects.some(c => c.source === upcomingNode.id)
        : false;

      if (!pressKey && lastProcessedNodeId && lastProcessedNodeId === next) {
        logger.warn(`[FLOW LOOP] Nó repetido detectado (${next}) sem input do usuário - finalizando fluxo`);
        const tFinal = ticket || (idTicket ? await getTicketWithWhatsapp(idTicket, whatsappId, companyId) : null);
        if (tFinal) {
          await finalizeTriggeredFlow(tFinal, upcomingNode || {}, companyId, "closed");
        }
        break;
      }

      if (upcomingNode && !upcomingHasOutgoing && visitedTerminalNodes.has(upcomingNode.id)) {
        logger.warn(`[FLOW LOOP] Nó terminal (${upcomingNode.id}) já foi visitado - finalizando fluxo`);
        const tFinal = ticket || (idTicket ? await getTicketWithWhatsapp(idTicket, whatsappId, companyId) : null);
        if (tFinal) {
          await finalizeTriggeredFlow(tFinal, upcomingNode, companyId, "closed");
        }
        break;
      }
      if (upcomingNode && !upcomingHasOutgoing) {
        visitedTerminalNodes.add(upcomingNode.id);
      }


      let nodeSelected: any;
      let ticketInit: Ticket;
      if (idTicket) {
        ticketInit = await Ticket.findOne({
          where: { id: idTicket, whatsappId }
        });

        if (!ticketInit) {
          logger.warn(`[FLOW LOOP] Ticket ${idTicket} não encontrado. Encerrando fluxo.`);
          break;
        }

        if (ticketInit.status === "closed") {
          if (numberPhrase === "") {
            logger.info(`[FLOW LOOP] Ticket ${idTicket} está fechado - encerrando fluxo`);
            break;
          }
        }

      }

      if (pressKey) {
        logger.debug(`[FLOW] ========== PROCESSANDO COM PRESSKEY ==========`);
        logger.debug(`[FLOW] PressKey: ${pressKey}`);
        logger.debug(`[FLOW] ExecFn: ${execFn || 'undefined'}`);
        logger.debug(`[FLOW] Next: ${next}`);

        if (pressKey === "parar") {
          if (idTicket) {
            ticketInit = await Ticket.findOne({
              where: { id: idTicket, whatsappId }
            });

            if (ticketInit) {
              logger.debug(`[TICKET UPDATE] Parando fluxo para ticket ${ticketInit.id} - Status alterado para closed`);

              await ticketInit.update({
                status: "closed"
              });

              logger.debug(`[TICKET UPDATE] Ticket ${ticketInit.id} fechado com sucesso`);
            } else {
              logger.warn(`[TICKET UPDATE] Ticket ${idTicket} não encontrado para fechar`);
            }
          }
          break;
        }

        // ✅ CORRIGIDO: Buscar o nó real ao invés de criar temporário
        if (execFn === "" || !execFn) {
          // Se execFn está vazio, significa que estamos no mesmo nó (menu aguardando resposta)
          // Buscar o nó usando 'next' que contém o ID do nó menu
          logger.debug(`[FLOW] ExecFn vazio - buscando nó usando next: ${next}`);
          nodeSelected = nodes.filter(node => node.id === next)[0];

          if (nodeSelected) {
            logger.debug(`[FLOW] ✅ Nó encontrado via next: ${nodeSelected.id} (tipo: ${nodeSelected.type})`);
          } else {
            logger.error(`[FLOW] ❌ Nó ${next} NÃO ENCONTRADO! Criando nó temporário`);
            nodeSelected = { type: "menu" };
          }
        } else {
          logger.debug(`[FLOW] Buscando nó com ID: ${execFn}`);
          nodeSelected = nodes.filter(node => node.id === execFn)[0];
          if (nodeSelected) {
            logger.debug(`[FLOW] ✅ Nó encontrado: ${nodeSelected.id} (tipo: ${nodeSelected.type})`);
          } else {
            logger.error(`[FLOW] ❌ Nó ${execFn} NÃO ENCONTRADO!`);
          }
        }
      } else {
        logger.debug(`[FLOW] ========== PROCESSANDO SEM PRESSKEY ==========`);
        logger.debug(`[FLOW] Buscando nó com ID: ${next}`);
        const otherNode = nodes.filter((node) => node.id === next)[0]
        if (otherNode) {
          nodeSelected = otherNode;
          logger.debug(`[FLOW] ✅ Nó encontrado: ${nodeSelected.id} (tipo: ${nodeSelected.type})`);
        } else {
          logger.error(`[FLOW] ❌ Nó ${next} NÃO ENCONTRADO!`);
        }
      }

      // ✅ CORRIGIDO: Verificar se nodeSelected foi encontrado antes de continuar
      if (!nodeSelected) {
        logger.error(`[FLOW ERROR] Nó não encontrado - Next: ${next}, ExecFn: ${execFn}`);
        logger.error(`[FLOW ERROR] Nós disponíveis: ${nodes.map(n => n.id).join(', ')}`);
        break;
      }


      let msg;

      // Função auxiliar para garantir que o ticket esteja disponível
      const ensureTicket = async () => {
        if (!ticket && idTicket) {
          ticket = await getTicketWithWhatsapp(idTicket, whatsappId);

          if (!ticket) {
            console.error(`Não foi possível encontrar o ticket ${idTicket} para o nó ${nodeSelected.type}`);
            return false;
          }
        }
        return true;
      };

      logger.info(`[FLOW NODE] Processando nó - ID: ${nodeSelected.id}, Tipo: ${nodeSelected.type}`);

      // 🔴 Realtime: nó em execução
      emitFlowNodeEvent({
        companyId,
        flowId: idFlowDb,
        ticketId: idTicket,
        nodeId: nodeSelected.id,
        nodeType: nodeSelected.type,
        status: "running"
      });

      // ✅ Log adicional para debug de erros
      if (nodeSelected.type === "httpRequest") {
        logger.info(`[HTTP REQUEST NODE] Dados do nó: ${JSON.stringify({
          id: nodeSelected.id,
          url: nodeSelected.data?.url || 'undefined',
          method: nodeSelected.data?.method || 'undefined',
          hasHeaders: !!nodeSelected.data?.headersString,
          hasBody: !!nodeSelected.data?.requestBody
        })}`);
      }

      if (nodeSelected.type === "tag") {
        if (!(await ensureTicket())) continue;

        try {
          const tagFind = await Tag.findByPk(nodeSelected.data.tag.id);

          if (!tagFind) {
            logger.error(`[TICKET TAG] Tag com ID ${nodeSelected.data.tag.id} não encontrada`);
          } else {
            // ✅ Adicionar a tag SEM remover as outras tags já associadas ao contato
            const [, created] = await ContactTag.findOrCreate({
              where: { contactId: ticket.contactId, tagId: tagFind.id },
              defaults: { contactId: ticket.contactId, tagId: tagFind.id }
            });

            if (created) {
              logger.info(`[TICKET TAG] Tag ${tagFind.name} adicionada ao contato ${ticket.contactId} do ticket ${ticket.id}`);

              // Notificar UI sobre atualização do ticket/contato
              try {
                const ticketShow = await ShowTicketService(ticket.id, companyId);
                const ioInstance = getIO();
                ioInstance.of(String(companyId)).emit(`company-${companyId}-ticket`, {
                  action: "update",
                  ticket: ticketShow,
                  ticketId: ticket.id
                });
              } catch (emitErr) {
                logger.warn(`[TICKET TAG] Falha ao emitir socket após adicionar tag: ${emitErr?.message || emitErr}`);
              }

              // Disparar Floup se tag estiver vinculada
              try {
                const FloupService = (await import('../../plugins/floup/service')).default;
                await FloupService.verificarEIniciarFloupsAoAdicionarTag(ticket.contactId, companyId, tagFind.name);
              } catch (floupErr) {
                logger.warn(`[TICKET TAG] Falha ao processar Floup após adicionar tag: ${floupErr?.message || floupErr}`);
              }
            } else {
              logger.info(`[TICKET TAG] Tag ${tagFind.name} já estava associada ao contato ${ticket.contactId}`);
            }
          }
        } catch (tagError) {
          logger.error(`[TICKET TAG] Erro ao adicionar tag ao contato: ${tagError?.message || tagError}`);
        }
      }

      if (nodeSelected.type === "removeTag") {
        await ensureTicket();

        if (!ticket) {
          logger.error(`[REMOVE TAG NODE] Ticket não encontrado para processar remoção de tag`);
          return;
        }

        try {
          const tagFind = await Tag.findByPk(nodeSelected.data.tag.id);

          if (!tagFind) {
            logger.error(`[REMOVE TAG NODE] Tag com ID ${nodeSelected.data.tag.id} não encontrada`);
            return;
          }

          // Importar o serviço de remoção de tags
          const { RemoveTagsService } = await import("../TagServices/RemoveTagsService");

          // Remover a tag do contato
          await RemoveTagsService({
            contactId: ticket.contactId,
            tags: [tagFind],
            companyId: companyId
          });

          logger.info(`[REMOVE TAG NODE] Tag ${tagFind.name} removida do contato ${ticket.contactId} do ticket ${ticket.id}`);

        } catch (error) {
          logger.error(`[REMOVE TAG NODE] Erro ao remover tag do contato:`, error);
        }
      }

      if (nodeSelected.type === "interval") {
        try {
          const rawValue = nodeSelected.data?.sec ?? nodeSelected.data?.value ?? nodeSelected.data?.seconds;
          const parsed = parseInt(String(rawValue), 10);
          if (rawValue === undefined || rawValue === null || rawValue === "" || !Number.isFinite(parsed) || parsed <= 0) {
            logger.warn(`[INTERVAL NODE] ⚠️ Valor de intervalo inválido (rawValue=${JSON.stringify(rawValue)}). Usando fallback de 1s.`);
          }
          const intervalSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

          logger.info(`[INTERVAL NODE] Aguardando ${intervalSeconds} segundos`);

          // Verificar a cada 1s se o ticket foi aceito (status open) — exceto em disparo manual
          let elapsed = 0;
          const tickStep = 1;
          while (elapsed < intervalSeconds) {
            const remaining = intervalSeconds - elapsed;
            const wait = Math.min(tickStep, remaining);
            await intervalWhats(String(wait));
            elapsed += wait;

            if (idTicket) {
              const ticketDuringInterval = await Ticket.findByPk(idTicket);
              if (ticketDuringInterval && ticketDuringInterval.status === "open" && !isManualTrigger) {
                logger.warn(`[INTERVAL NODE] ⚠️ Ticket ${idTicket} foi aceito durante intervalo - parando fluxo`);
                await ticketDuringInterval.update({
                  flowWebhook: false,
                  lastFlowId: null,
                  hashFlowId: null,
                  flowStopped: null,
                  dataWebhook: null,
                  isBot: false
                });
                return;
              }
            }
          }

          logger.info(`[INTERVAL NODE] ✅ Intervalo de ${intervalSeconds}s concluído`);
        } catch (intervalErr: any) {
          logger.error(`[INTERVAL NODE] ❌ Erro ao executar intervalo: ${intervalErr?.message || intervalErr}`);
        }
      }

      if (nodeSelected.type === "message") {
        // Garantir que ticket tenha whatsapp para envio via API Oficial
        if (!ticket?.whatsapp && idTicket) {
          ticket = await getTicketWithWhatsapp(idTicket, whatsappId, companyId);
        }

        // ✅ Carregar ticket com relações para interpolação de variáveis ({{queue}}, {{userName}}, etc.)
        const ticketDetailsMsg = idTicket ? await ShowTicketService(idTicket, companyId) : null;

        if (dataWebhook === "") {
          msg = {
            body: ticketDetailsMsg ? formatBody(nodeSelected.data.label, ticketDetailsMsg) : nodeSelected.data.label,
            number: numberClient,
            companyId: companyId
          };
        } else {
          const dataLocal = {
            nome: createFieldJsonName,
            numero: numberClient,
            email: createFieldJsonEmail
          };
          const replacedBody = replaceMessages(
            nodeSelected.data.label,
            details,
            dataWebhook,
            dataLocal,
            idTicket
          );
          msg = {
            body: ticketDetailsMsg ? formatBody(replacedBody, ticketDetailsMsg) : replacedBody,
            number: numberClient,
            companyId: companyId
          };
        }


        if (whatsapp.channel === "whatsapp" || whatsapp.channel === "wacalls") {
          await SendWhatsAppMessage({
            body: msg.body,
            ticket: ticket,
            quotedMsg: null
          });
        }

        if (whatsapp.channel === "whatsapp_oficial") {
          await SendWhatsAppOficialMessage({
            body: msg.body,
            ticket: ticket,
            quotedMsg: null,
            type: 'text',
            media: null,
            vCard: null
          });
        }

        await intervalWhats("1");
      }

      if (nodeSelected.type === "asaasBoleto") {
        logger.info(`[ASAAS NODE] ========== PROCESSANDO SEGUNDA VIA ASAAS ==========`);
        if (!(await ensureTicket())) continue;

        const d = nodeSelected.data || {};
        const askMessage = d.askMessage || "Para enviar a segunda via, digite seu CPF ou CNPJ (apenas números):";
        const invalidMessage = d.invalidMessage || "CPF/CNPJ inválido. Verifique e digite novamente:";
        const maxAttempts = Number.isFinite(Number(d.maxAttempts)) ? Math.max(1, Number(d.maxAttempts)) : 3;
        const giveUpMessage = d.giveUpMessage || "Não consegui validar seu CPF/CNPJ. Encaminhando para um atendente.";
        const notFoundMessage = d.notFoundMessage || "Não localizei boletos pendentes para este CPF/CNPJ.";
        const errorMessage = d.errorMessage || "Não consegui consultar agora. Tente novamente em instantes.";
        const headerMessage = d.headerMessage || "*Segunda via dos seus boletos:*";
        const boletoTemplate = d.boletoTemplate ||
          "*{{indice}}.* {{descricao}}\nValor: {{valor}}\nVencimento: {{vencimento}}\nStatus: {{status}}\nLink: {{linkBoleto}}";
        const statuses: string[] = Array.isArray(d.statuses) && d.statuses.length ? d.statuses : ["PENDING", "OVERDUE"];
        const sendMode = d.sendMode === "separate" ? "separate" : "single";
        const sendPixQrCode = !!d.sendPixQrCode;
        // Modo de entrega do PIX em mensagens separadas por boleto
        const pixDelivery: "none" | "copypaste" | "qrimage" | "both" =
          ["none", "copypaste", "qrimage", "both"].includes(d.pixDelivery)
            ? d.pixDelivery
            : (sendPixQrCode ? "copypaste" : "none");
        const pixMessageTemplate =
          d.pixMessageTemplate || "*PIX Copia e Cola:*\n```{{pixCopiaCola}}```";
        const pixQrCaption = d.pixQrCaption || "QR Code PIX para pagamento";
        const finalMessage = d.finalMessage || "";
        const countVariable = d.countVariable || "";
        const sortBy = d.sortBy === "value" || d.sortBy === "none" ? d.sortBy : "dueDate";
        const sortOrder = d.sortOrder === "desc" ? "desc" : "asc";
        const inputTimeoutSeconds = Number.isFinite(Number(d.inputTimeoutSeconds))
          ? Math.max(0, Number(d.inputTimeoutSeconds))
          : 0;
        const timeoutMessage = d.timeoutMessage ||
          "Você ainda está aí? Por favor, digite seu CPF ou CNPJ (apenas números):";
        const asaasToken = (d.asaasToken || "").trim();
        const asaasEnvironment = d.asaasEnvironment === "sandbox" ? "sandbox" : "production";

        const inputVar = `__asaas_${nodeSelected.id}__`;
        const inputIdentifier = `${ticket.id}_${inputVar}`;
        const attemptsKey = `${ticket.id}_asaas_attempts_${nodeSelected.id}`;
        global.flowVariables = global.flowVariables || {};
        (global as any).asaasTimers = (global as any).asaasTimers || {};

        const sendText = async (body: string) => {
          if (!body) return;
          try {
            if (whatsapp.channel === "whatsapp_oficial") {
              await SendWhatsAppOficialMessage({
                body, ticket, quotedMsg: null, type: "text", media: null, vCard: null
              });
            } else if (whatsapp.channel === "whatsapp") {
              await SendWhatsAppMessage({ body, ticket, quotedMsg: null });
            } else {
              await SendMessage(whatsapp, { number: numberClient, body });
            }
          } catch (e: any) {
            logger.error(`[ASAAS NODE] Falha ao enviar: ${e?.message}`);
          }
        };

        // Envia o PIX (texto e/ou imagem do QR) de um boleto, conforme configuração
        const sendPixForBoleto = async (b: any) => {
          if (pixDelivery === "none") return;
          const wantText = pixDelivery === "copypaste" || pixDelivery === "both";
          const wantImage = pixDelivery === "qrimage" || pixDelivery === "both";

          if (wantText && b.pixCopyPaste) {
            const txt = pixMessageTemplate.replace(/\{\{\s*pixCopiaCola\s*\}\}/g, b.pixCopyPaste);
            await sendText(txt);
            await intervalWhats("1");
          }

          if (wantImage && b.pixQrBase64) {
            try {
              const dir = path.join(publicFolder, `company${companyId}/flow`);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              const fileName = `pix_${b.id}_${Date.now()}.png`;
              const filePath = path.join(dir, fileName);
              const base64 = String(b.pixQrBase64).replace(/^data:image\/\w+;base64,/, "");
              fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

              const ticketInt = await ShowTicketService(ticket.id, companyId);

              if (whatsapp.channel === "whatsapp") {
                await SendWhatsAppMediaFlow({
                  media: filePath,
                  ticket: ticketInt,
                  whatsappId: whatsapp.id,
                  body: pixQrCaption,
                  isRecord: false
                });
              } else if (whatsapp.channel === "wacalls") {
                await sendWacallsFlowMedia(ticketInt, filePath, pixQrCaption);
              } else if (whatsapp.channel === "whatsapp_oficial") {
                const mediaSrc = {
                  fieldname: "medias",
                  originalname: fileName,
                  encoding: "7bit",
                  mimetype: "image/png",
                  filename: fileName,
                  path: filePath
                } as Express.Multer.File;
                await SendWhatsAppOficialMessage({
                  body: pixQrCaption,
                  ticket: ticketInt,
                  quotedMsg: null,
                  type: "image",
                  media: mediaSrc,
                  vCard: null
                });
              }

              // limpa arquivo temporário
              setTimeout(() => { try { fs.unlinkSync(filePath); } catch {} }, 30000);
              await intervalWhats("1");
            } catch (e: any) {
              logger.error(`[ASAAS NODE] Falha ao enviar QR PIX: ${e?.message}`);
            }
          }
        };

        const askForCpf = async (msgBody: string) => {
          await sendText(msgBody);
          // Limpa qualquer valor antigo da variável
          delete global.flowVariables[inputVar];
          delete global.flowVariables[inputIdentifier];

          const nextNodeId = nodeSelected.id; // ao responder, retorna a este mesmo nó
          await ticket.update({
            status: "pending",
            lastFlowId: nodeSelected.id,
            flowWebhook: true,
            hashFlowId: hashWebhookId,
            flowStopped: idFlowDb.toString(),
            dataWebhook: {
              ...ticket.dataWebhook,
              flowId: idFlowDb,
              waitingInput: true,
              inputVariableName: inputVar,
              inputIdentifier,
              nextNodeId
            }
          });
          global.flowVariables[`${inputIdentifier}_next`] = nextNodeId;

          // Agenda timeout para reenviar a solicitação (ou desistir) se o cliente não responder
          if ((global as any).asaasTimers[inputIdentifier]) {
            clearTimeout((global as any).asaasTimers[inputIdentifier]);
            delete (global as any).asaasTimers[inputIdentifier];
          }
          if (inputTimeoutSeconds > 0) {
            (global as any).asaasTimers[inputIdentifier] = setTimeout(async () => {
              try {
                delete (global as any).asaasTimers[inputIdentifier];
                const fresh = await Ticket.findByPk(ticket.id);
                if (!fresh) return;
                const dw: any = fresh.dataWebhook || {};
                // Se o cliente já respondeu ou o fluxo mudou, não faz nada
                if (!dw.waitingInput || dw.inputIdentifier !== inputIdentifier) return;

                const attempts = (global.flowVariables[attemptsKey] || 0) + 1;
                global.flowVariables[attemptsKey] = attempts;
                logger.info(`[ASAAS NODE] Timeout aguardando CPF/CNPJ (tentativa ${attempts}/${maxAttempts})`);

                if (attempts < maxAttempts) {
                  // Reenvia mensagem e reagenda
                  await askForCpf(timeoutMessage);
                } else {
                  // Esgotou: envia giveUp e libera o ticket (sai do estado waitingInput)
                  await sendText(giveUpMessage);
                  const newData = { ...dw };
                  delete newData.waitingInput;
                  delete newData.inputVariableName;
                  delete newData.inputIdentifier;
                  delete newData.nextNodeId;
                  await fresh.update({
                    flowWebhook: false,
                    flowStopped: null,
                    lastFlowId: null,
                    hashFlowId: null,
                    dataWebhook: newData
                  });
                  delete global.flowVariables[attemptsKey];
                  delete global.flowVariables[inputVar];
                  delete global.flowVariables[inputIdentifier];
                }
              } catch (e: any) {
                logger.error(`[ASAAS NODE] Erro no timer de timeout: ${e?.message}`);
              }
            }, inputTimeoutSeconds * 1000);
          }
        };

        // Verifica se já estamos retornando da resposta do cliente
        const respondedValue = global.flowVariables[inputVar] || global.flowVariables[inputIdentifier];

        // Cliente respondeu → cancela timer pendente
        if (inputResponded && respondedValue && (global as any).asaasTimers[inputIdentifier]) {
          clearTimeout((global as any).asaasTimers[inputIdentifier]);
          delete (global as any).asaasTimers[inputIdentifier];
        }

        if (!inputResponded || !respondedValue) {
          // 1ª visita ao nó → pergunta o CPF/CNPJ e pausa o fluxo
          global.flowVariables[attemptsKey] = 0;
          await askForCpf(askMessage);
          break;
        }

        // Resumindo após o cliente responder
        const raw = String(respondedValue || "").trim();
        const sanitized = sanitizeDoc(raw);

        if (!isValidCpfCnpj(sanitized)) {
          const attempts = (global.flowVariables[attemptsKey] || 0) + 1;
          global.flowVariables[attemptsKey] = attempts;
          logger.info(`[ASAAS NODE] CPF/CNPJ inválido (tentativa ${attempts}/${maxAttempts})`);
          if (attempts < maxAttempts) {
            await askForCpf(invalidMessage);
            break;
          }
          // Esgotou tentativas → segue fluxo após giveUpMessage
          await sendText(giveUpMessage);
          delete global.flowVariables[attemptsKey];
          delete global.flowVariables[inputVar];
          delete global.flowVariables[inputIdentifier];
          await intervalWhats("1");
          // continua para o próximo nó normalmente
        } else {
          // CPF/CNPJ válido → consulta Asaas
          const result = await fetchPendingBoletosByDoc(companyId, sanitized, statuses, asaasToken, asaasEnvironment);

          if (!result.ok) {
            await sendText(result.message || errorMessage);
          } else if (result.boletos.length === 0) {
            await sendText(notFoundMessage);
          } else {
            // Ordenação dos boletos
            if (sortBy !== "none") {
              const dir = sortOrder === "desc" ? -1 : 1;
              result.boletos.sort((a: any, b: any) => {
                if (sortBy === "value") {
                  return ((Number(a.value) || 0) - (Number(b.value) || 0)) * dir;
                }
                // dueDate (YYYY-MM-DD ordena lexicograficamente)
                const av = String(a.dueDate || "");
                const bv = String(b.dueDate || "");
                if (av < bv) return -1 * dir;
                if (av > bv) return 1 * dir;
                return 0;
              });
            }

            // Enriquecer com PIX se solicitado (legado ou nova entrega)
            const needPix = sendPixQrCode || pixDelivery !== "none";
            if (needPix) {
              for (const b of result.boletos) {
                const pix = await fetchPixForBoleto(companyId, b.id, asaasToken, asaasEnvironment);
                if (pix?.payload) b.pixCopyPaste = pix.payload;
                if (pix?.encodedImage) (b as any).pixQrBase64 = pix.encodedImage;
              }
            }

            if (sendMode === "single") {
              const parts: string[] = [];
              if (headerMessage) parts.push(headerMessage);
              result.boletos.forEach((b, i) => {
                parts.push(renderBoletoTemplate(boletoTemplate, b, i));
              });
              await sendText(parts.join("\n\n"));
              // PIX por boleto (em mensagens separadas)
              for (const b of result.boletos) {
                await sendPixForBoleto(b);
              }
            } else {
              if (headerMessage) await sendText(headerMessage);
              for (let i = 0; i < result.boletos.length; i++) {
                const b = result.boletos[i];
                await sendText(renderBoletoTemplate(boletoTemplate, b, i));
                await intervalWhats("1");
                await sendPixForBoleto(b);
              }
            }

            if (finalMessage) await sendText(finalMessage);
          }

          if (countVariable) {
            global.flowVariables[countVariable] = result.boletos.length;
            global.flowVariables[`${ticket.id}_${countVariable}`] = result.boletos.length;
          }

          // Cleanup
          delete global.flowVariables[attemptsKey];
          delete global.flowVariables[inputVar];
          delete global.flowVariables[inputIdentifier];
          await intervalWhats("1");
        }
      }

      if (
        nodeSelected.type === "integration" ||
        nodeSelected.type === "typebotIntegration" ||
        nodeSelected.type === "n8nIntegration"
      ) {
        logger.info(`[INTEGRATION NODE] ========== EXECUTANDO INTEGRAÇÃO DE FILA ==========`);
        if (!(await ensureTicket())) continue;

        const integrationId = nodeSelected.data?.queueIntegrationId || nodeSelected.data?.integrationId;
        if (!integrationId) {
          logger.warn(`[INTEGRATION NODE] queueIntegrationId não definido no nó ${nodeSelected.id}`);
          continue;
        }
        try {
          const integration = await ShowQueueIntegrationService(Number(integrationId), companyId);
          if (!integration) {
            logger.warn(`[INTEGRATION NODE] Integração ${integrationId} não encontrada para company ${companyId}`);
            continue;
          }

          // Delega o atendimento à integração e LIMPA o estado do fluxo,
          // para que a próxima mensagem do contato seja roteada para a
          // integração (typebot/dialogflow) e não retorne para o flowbuilder.
          await ticket.update({
            useIntegration: true,
            integrationId: integration.id,
            isBot: true,
            flowWebhook: false,
            lastFlowId: null,
            hashFlowId: null,
            flowStopped: null,
            dataWebhook: null
          });

          // Para integrações via webhook/n8n, dispara o POST imediatamente
          // usando exclusivamente a URL configurada em Integrações.
          // Tratamos como n8n se: tipo for n8n/webhook OU se o nó do fluxo
          // for explicitamente o n8nIntegration (mesmo que o tipo da
          // integração esteja em branco/legado).
          const treatAsN8n =
            integration.type === "n8n" ||
            integration.type === "webhook" ||
            nodeSelected.type === "n8nIntegration";

          logger.info(
            `[INTEGRATION NODE] integrationId=${integration.id} type=${integration.type} nodeType=${nodeSelected.type} treatAsN8n=${treatAsN8n} urlN8N=${integration.urlN8N ? "OK" : "VAZIO"}`
          );

          if (treatAsN8n) {
            const url = String(integration.urlN8N || "").trim();
            if (url) {
              // Envia o payload bruto do Baileys (key, message, pushName, etc.)
              // acrescido de _integrationConfig com metadados da integração/ticket.
              const rawMsg: any = msg ? JSON.parse(JSON.stringify(msg)) : {};
              const remoteJid: string = rawMsg?.key?.remoteJid || "";
              const numberFromJid = remoteJid
                ? remoteJid.split("@")[0].split(":")[0]
                : null;

              let contact: Contact | null = (ticket as any).contact || null;
              if (!contact && ticket.contactId) {
                try {
                  contact = await Contact.findByPk(ticket.contactId);
                } catch (e: any) {
                  logger.warn(
                    `[INTEGRATION NODE] Falha ao carregar contato: ${e?.message}`
                  );
                }
              }

              const contactNumber =
                numberFromJid || contact?.number || null;
              const contactName =
                rawMsg?.pushName || contact?.name || null;

              let messageText =
                rawMsg?.message?.conversation ||
                rawMsg?.message?.extendedTextMessage?.text ||
                rawMsg?.message?.imageMessage?.caption ||
                rawMsg?.message?.videoMessage?.caption ||
                rawMsg?.message?.buttonsResponseMessage?.selectedDisplayText ||
                rawMsg?.message?.listResponseMessage?.title ||
                "";

              let messageType = rawMsg?.message
                ? Object.keys(rawMsg.message)[0]
                : null;

              let lastDbMessage: Message | null = null;
              if (!messageText || !messageType || !msg) {
                try {
                  lastDbMessage = await Message.findOne({
                    where: { ticketId: ticket.id, fromMe: false },
                    order: [["createdAt", "DESC"]]
                  });
                } catch (e: any) {
                  logger.warn(
                    `[INTEGRATION NODE] Falha ao buscar última mensagem: ${e?.message}`
                  );
                }
              }

              if (!messageText && lastDbMessage?.body) {
                messageText = lastDbMessage.body;
              }
              if (!messageType && lastDbMessage?.mediaType) {
                messageType = lastDbMessage.mediaType;
              }

              const payload = {
                ticketId: ticket.id,
                companyId,
                integrationId: integration.id,
                contactNumber,
                contactName,
                fromMe: !!rawMsg?.key?.fromMe,
                messageText,
                messageType,
                rawMsg,
                _integrationConfig: {
                  enableTransfer: (integration as any).enableTransfer ?? false,
                  transferQueueId: (integration as any).transferQueueId ?? null,
                  transferUserId: (integration as any).transferUserId ?? null,
                  queueIdAssign: (integration as any).queueIdAssign ?? null,
                  whatsappId: (integration as any).whatsappId ?? ticket.whatsappId ?? null,
                  userIdAssign: (integration as any).userIdAssign ?? null,
                  enableCloseTicket: (integration as any).enableCloseTicket ?? false,
                  closeTicketMessage: (integration as any).closeTicketMessage ?? null,
                  enableOpenTicket: (integration as any).enableOpenTicket ?? false,
                  openTicketQueueId: (integration as any).openTicketQueueId ?? null,
                  openTicketUserId: (integration as any).openTicketUserId ?? null,
                  openTicketMessage: (integration as any).openTicketMessage ?? null,
                  ticketId: ticket.id,
                  companyId
                }
              };

              logger.info(
                `[INTEGRATION NODE] POST -> ${url} ticket=${ticket.id} number=${contactNumber} type=${messageType} textLen=${(messageText || "").length}`
              );

              try {
                const resp = await axios.post(url, payload, {
                  headers: { "Content-Type": "application/json" },
                  timeout: 15000,
                  httpsAgent: new https.Agent({ rejectUnauthorized: false })
                });
                logger.info(
                  `[INTEGRATION NODE] Webhook n8n OK status=${resp.status}`
                );
              } catch (e: any) {
                logger.error(
                  `[INTEGRATION NODE] Falha POST n8n status=${e?.response?.status} msg=${e?.message} body=${JSON.stringify(e?.response?.data)?.slice(0,400)}`
                );
              }
            } else {
              logger.warn(
                `[INTEGRATION NODE] Integração id=${integration.id} (${integration.name}) sem urlN8N configurada — edite em Integrações > Filas e preencha a URL do webhook do n8n.`
              );
            }
          } else if (integration.type === "typebot") {
            logger.info(`[INTEGRATION NODE] Typebot "${integration.name}" ativado (slug=${integration.typebotSlug}). Será acionado na próxima mensagem do contato.`);
          } else {
            logger.info(`[INTEGRATION NODE] Integração "${integration.type}" ativada. Será acionada na próxima mensagem do contato.`);
          }
        } catch (e: any) {
          logger.error(`[INTEGRATION NODE] Erro: ${e?.message}`);
        }
        // Após delegar para a integração (n8n/typebot/webhook), o atendimento
        // passa a ser controlado pela integração via wbotMessageListener.
        // Encerramos o processamento do fluxo para evitar que nós seguintes
        // sobrescrevam useIntegration/queueId ou enviem mensagens duplicadas.
        logger.info(`[INTEGRATION NODE] Fluxo encerrado — atendimento delegado à integração.`);
        break;
      }

      if (nodeSelected.type === "openai" || nodeSelected.type === "gemini") {
        try {
          // ✅ CORRIGIDO: Verificar se o ticket foi aceito antes de ativar IA
          // EXCEÇÃO: Se o fluxo foi disparado manualmente (isManualTrigger=true), permitir execução mesmo com status "open"
          if (ticket.status === "open" && ticket.userId && !isManualTrigger) {
            logger.info(`[${nodeSelected.type.toUpperCase()} NODE] Ticket ${ticket.id} já foi aceito por usuário ${ticket.userId} - pulando ativação de IA`);
            continue;
          }

          const {
            name = "",
            prompt = "",
            voice = "texto",
            voiceKey = "",
            voiceRegion = "",
            maxTokens = 1000,
            temperature = 0.7,
            apiKey = "",
            queueId = 0,
            maxMessages = 10,
            model = "",
            provider = nodeSelected.type,
            flowMode = "permanent",
            maxInteractions = 0,
            continueKeywords = ["continuar", "próximo", "avançar", "prosseguir"],
            completionTimeout = 0,
            objective = "",
            autoCompleteOnObjective = false,
            responseDelay = 0,
            charLimit = 0,
            humanizeConversation = false,
            allowTransfer = false,
            transferKeywords = "",
            transferMessage = "",
            transcribeAudio = false,
            audioEnabled = false,
            responseMode = "text",
            agentVoice = "",
            sendAsPTT = false,
            languages = undefined
          } = nodeSelected.data.typebotIntegration as IOpenAi;

          if (!apiKey || !model) {
            logger.error(`[${provider.toUpperCase()} NODE] Configurações obrigatórias não encontradas`);
            continue;
          }

          const finalVoice = provider === "gemini" ? "texto" : voice;

          const aiSettings: IOpenAi = {
            name,
            prompt,
            voice: finalVoice,
            voiceKey: provider === "openai" ? voiceKey : "",
            voiceRegion: provider === "openai" ? voiceRegion : "",
            maxTokens: Number(maxTokens) || 1000,
            temperature: Number(temperature) || 0.7,
            apiKey,
            queueId: Number(queueId) || 0,
            maxMessages: Number(maxMessages) || 10,
            model,
            provider,
            flowMode,
            maxInteractions: Number(maxInteractions) || 0,
            continueKeywords,
            completionTimeout: Number(completionTimeout) || 0,
            objective,
            autoCompleteOnObjective,
            responseDelay: Number(responseDelay) || 0,
            charLimit: Number(charLimit) || 0,
            humanizeConversation,
            allowTransfer,
            transferKeywords,
            transferMessage,
            transcribeAudio,
            audioEnabled,
            responseMode,
            agentVoice,
            sendAsPTT,
            languages
          } as IOpenAi;

          logger.info(`[${provider.toUpperCase()} NODE] Ativando modo ${provider.toUpperCase()} para ticket ${ticket.id} (${flowMode})`);

          // ✅ Guarda anti-duplicação: se este mesmo agente já está aguardando
          // a primeira resposta do usuário, não reenvia a saudação.
          const prevDwAi: any = (ticket as any).dataWebhook || {};
          const alreadyGreetedAi =
            prevDwAi &&
            (prevDwAi.type === provider) &&
            prevDwAi.awaitingUserResponse === true &&
            (prevDwAi.settings?.name === name);

          if (flowMode === "permanent") {
            // MODO PERMANENTE: Para o fluxo e fica em IA
            await ticket.update({
              flowWebhook: false,
              lastFlowId: null,
              hashFlowId: null,
              flowStopped: null,
              useIntegration: true,
              isBot: true,
              status: "pending",
              dataWebhook: {
                type: provider,
                settings: aiSettings,
                mode: "permanent",
                awaitingUserResponse: true // ✅ AGUARDA PRIMEIRA RESPOSTA DO USUÁRIO
              }
            });

            logger.info(`[${provider.toUpperCase()} NODE] Modo permanente ativado`);

          } else {
            // MODO TEMPORÁRIO: Mantém informações do fluxo
            const nextConnection = connects.filter(
              connect => connect.source === nodeSelected.id && connect.sourceHandle === "a"
            )[0];

            await ticket.update({
              flowWebhook: true,
              lastFlowId: nodeSelected.id,
              hashFlowId: hashWebhookId,
              flowStopped: idFlowDb.toString(),
              useIntegration: true,
              isBot: true,
              dataWebhook: {
                type: provider,
                settings: aiSettings,
                mode: "temporary",
                awaitingUserResponse: true, // ✅ AGUARDA PRIMEIRA RESPOSTA DO USUÁRIO
                flowContinuation: {
                  nextNodeId: nextConnection?.target,
                  interactionCount: 0,
                  startTime: new Date().toISOString(),
                  originalDataWebhook: dataWebhook
                }
              }
            });

            logger.info(`[${provider.toUpperCase()} NODE] Modo temporário ativado`);
          }

          // ❌ NÃO enviar saudação automática aqui.
          // A única mensagem inicial permitida é a "Mensagem Inicial" configurada
          // no agente (greetingMessage), tratada exclusivamente no nó "aiAgent".
          logger.info(`[${provider.toUpperCase()} NODE] Saudação automática desativada - apenas Mensagem Inicial configurada será enviada.`);

          // ✅ PARAR FLUXO E AGUARDAR RESPOSTA DO USUÁRIO
          break;

        } catch (error) {
          logger.error(`[AI NODE] Erro ao processar nó ${nodeSelected.type}:`, error);
          continue;
        }
      }

      // NÓ AGENTE DE IA - usa prompt cadastrado no sistema
      if (nodeSelected.type === "aiAgent") {
        try {
          // ✅ CORRIGIDO: Garantir que ticket existe antes de acessar propriedades
          if (!(await ensureTicket())) {
            logger.error(`[AI AGENT NODE] Ticket não encontrado - pulando nó aiAgent`);
            continue;
          }

          if (ticket.status === "open" && ticket.userId && !isManualTrigger) {
            logger.info(`[AI AGENT NODE] Ticket ${ticket.id} já foi aceito - pulando`);
            continue;
          }

          const agentData = nodeSelected.data || {};
          const { promptId, agentName, modelOverride, temperatureOverride, maxTokensOverride, greetingMessage, useOverrides } = agentData;

          if (!promptId) {
            logger.error(`[AI AGENT NODE] promptId não configurado no nó`);
            continue;
          }

          // Buscar o prompt cadastrado.
          //
          // ANTES: usava ShowPromptService, que LANÇA AppError quando o prompt
          // não existe para a empresa do ticket. Como AppError não estende
          // Error, o catch registrava "Stack: N/A" e o nó morria — sem dizer o
          // porquê. Era o erro que aparecia ao usar o Agente Comercial: o nó
          // aiAgent guardava um promptId (ex.: 1) que não pertencia à empresa
          // daquele ticket, então a busca por (id + companyId) não achava nada.
          //
          // AGORA: busca direta que retorna null em vez de lançar, e um log que
          // diz exatamente o que houve (prompt some, ou existe em outra empresa).
          let promptRecord: any = null;
          try {
            promptRecord = await Prompt.findOne({
              where: { id: promptId, companyId: ticket.companyId },
              include: [{ model: Queue, as: "queue" }]
            });
          } catch (lookupErr: any) {
            logger.error(`[AI AGENT NODE] Falha ao buscar prompt ${promptId}: ${lookupErr?.message || lookupErr}`);
            promptRecord = null;
          }

          if (!promptRecord) {
            // Diagnóstico: o prompt existe em ALGUMA empresa? Ajuda a distinguir
            // "prompt apagado" de "prompt de outra empresa".
            const existeEmOutra = await Prompt.findByPk(promptId).catch(() => null);
            if (existeEmOutra) {
              logger.error(
                `[AI AGENT NODE] Prompt ${promptId} pertence à empresa ${(existeEmOutra as any).companyId}, ` +
                `mas o ticket ${ticket.id} é da empresa ${ticket.companyId}. ` +
                `Reconfigure o nó do fluxo para um prompt desta empresa.`
              );
            } else {
              logger.error(`[AI AGENT NODE] Prompt ${promptId} não existe. Reconfigure o nó do fluxo.`);
            }
            // Não derruba o fluxo: segue para o próximo nó em vez de estourar.
            continue;
          }

          // ✅ Verificação de horário de expediente do agente (mesma lógica usada fora do FlowBuilder)
          if ((promptRecord as any).workingHoursEnabled && !isWithinWorkingHours(promptRecord as any)) {
            logger.info(`[AI AGENT NODE] Fora do horário de expediente (prompt ${promptId}) - ticket ${ticket.id}`);
            const outMsg = String((promptRecord as any).workingHoursOutOfMessage || "").trim();
            if (outMsg) {
              try {
                if (whatsapp.channel === "whatsapp" || whatsapp.channel === "wacalls") {
                  await SendWhatsAppMessage({ body: outMsg, ticket, quotedMsg: null });
                }
                if (whatsapp.channel === "whatsapp_oficial") {
                  await SendWhatsAppOficialMessage({
                    body: outMsg,
                    ticket,
                    quotedMsg: null,
                    type: "text",
                    media: null,
                    vCard: null
                  });
                }
              } catch (e: any) {
                logger.error(`[AI AGENT NODE] Falha ao enviar mensagem fora do expediente: ${e?.message}`);
              }
            }
            // Não ativar o agente; encerrar fluxo para que o ticket fique aguardando atendimento humano
            break;
          }

          // Montar configurações usando prompt + overrides opcionais
          const finalModel = (useOverrides && modelOverride) ? modelOverride : "gpt-4.1-mini";
          const finalTemperature = (useOverrides && temperatureOverride) ? Number(temperatureOverride) : promptRecord.temperature;
          const finalMaxTokens = (useOverrides && maxTokensOverride) ? Number(maxTokensOverride) : promptRecord.maxTokens;

          const aiSettings: IOpenAi = {
            name: agentName || promptRecord.name,
            prompt: promptRecord.prompt,
            voice: promptRecord.voice || "texto",
            voiceKey: promptRecord.voiceKey || "",
            voiceRegion: promptRecord.voiceRegion || "",
            maxTokens: finalMaxTokens,
            temperature: finalTemperature,
            apiKey: promptRecord.apiKey,
            queueId: promptRecord.queueId || 0,
            maxMessages: promptRecord.maxMessages || 10,
            model: finalModel,
            provider: "openai",
            flowMode: "permanent",
            responseDelay: promptRecord.responseDelay,
            charLimit: promptRecord.charLimit,
            humanizeConversation: promptRecord.humanizeConversation,
            allowTransfer: promptRecord.allowTransfer,
            transferKeywords: promptRecord.transferKeywords,
            transferMessage: promptRecord.transferMessage,
            transcribeAudio: promptRecord.transcribeAudio,
            audioEnabled: promptRecord.audioEnabled,
            responseMode: (promptRecord.responseMode === "audio" || promptRecord.responseMode === "both") ? promptRecord.responseMode : "text",
            agentVoice: promptRecord.agentVoice,
            sendAsPTT: promptRecord.sendAsPTT,
            languages: promptRecord.languages,
          } as any;

          logger.info(`[AI AGENT NODE] Ativando agente "${agentName}" (prompt ${promptId}) para ticket ${ticket.id}`);

          // ✅ Guarda anti-duplicação: se o agente JÁ foi ativado neste ticket
          // e ainda está aguardando a primeira resposta do usuário, NÃO reenviar saudação.
          const prevDw: any = (ticket as any).dataWebhook || {};
          const alreadyGreeted =
            prevDw &&
            prevDw.type === "aiAgent" &&
            prevDw.awaitingUserResponse === true &&
            (prevDw.settings?.name === (agentName || promptRecord.name));

          // Salvar promptId e modelo no ticket para processamento pelo handleAiAgent
          await ticket.update({
            promptId: promptId,
            aiModel: finalModel,
            flowWebhook: false,
            lastFlowId: null,
            hashFlowId: null,
            flowStopped: null,
            useIntegration: true,
            isBot: true,
            userId: null,
            status: "pending",
            dataWebhook: {
              type: "aiAgent",
              settings: aiSettings,
              mode: "permanent",
              awaitingUserResponse: true
            }
          });

          // Enviar APENAS a "Mensagem Inicial" configurada no agente.
          // Se não houver greetingMessage configurado, NENHUMA saudação é enviada.
          const configuredGreeting =
            (greetingMessage && String(greetingMessage).trim().length > 0)
              ? String(greetingMessage).trim()
              : (promptRecord as any)?.greetingMessage && String((promptRecord as any).greetingMessage).trim().length > 0
                ? String((promptRecord as any).greetingMessage).trim()
                : "";

          if (!alreadyGreeted && configuredGreeting) {
            if (whatsapp.channel === "whatsapp" || whatsapp.channel === "wacalls") {
              await SendWhatsAppMessage({ body: configuredGreeting, ticket, quotedMsg: null });
            }
            if (whatsapp.channel === "whatsapp_oficial") {
              await SendWhatsAppOficialMessage({
                body: configuredGreeting,
                ticket,
                quotedMsg: null,
                type: "text",
                media: null,
                vCard: null
              });
            }
          } else if (alreadyGreeted) {
            logger.info(`[AI AGENT NODE] Saudação já enviada anteriormente para ticket ${ticket.id} - ignorando reenvio`);
          } else {
            logger.info(`[AI AGENT NODE] Sem "Mensagem Inicial" configurada - nenhuma saudação será enviada.`);
          }

          // Parar fluxo - agente assume
          break;

        } catch (error) {
          const msg = (error && (error as any).message) || String(error);
          logger.error(`[AI AGENT NODE] Erro ao ativar agente de IA: ${msg}`);
          logger.error(`[AI AGENT NODE] Stack: ${(error as any)?.stack || msg || 'N/A'}`);
          logger.error(`[AI AGENT NODE] Dados do nó: ${JSON.stringify(nodeSelected?.data || {})}`);
          continue;
        }
      }

      if (nodeSelected.type === "input") {
        try {
          // Garantir que o ticket esteja disponível
          if (!ticket && idTicket) {
            ticket = await getTicketWithWhatsapp(idTicket, whatsappId);

            if (!ticket) {
              continue;
            }
          }

          let question = nodeSelected.data.question || "";
          const variableName = nodeSelected.data.variableName || "";

          if (!variableName) {
            continue;
          }

          // ✅ Carregar ticket com relações para interpolação de variáveis ({{queue}}, {{userName}}, etc.)
          const ticketDetailsInput = idTicket ? await ShowTicketService(idTicket, companyId) : null;

          if (question.includes("${")) {
            const dataLocal = {
              nome: createFieldJsonName,
              numero: numberClient,
              email: createFieldJsonEmail
            };

            question = replaceMessages(
              question,
              details,
              dataWebhook,
              dataLocal,
              idTicket
            );
          }

          // Aplicar formatBody para variáveis Mustache ({{queue}}, {{userName}}, etc.)
          if (ticketDetailsInput) {
            question = formatBody(question, ticketDetailsInput);
          }

          // Verifica se este input específico já foi respondido
          const inputIdentifier = `${ticket.id}_${nodeSelected.id}_${variableName}`;
          const thisInputResponded = global.flowVariables[inputIdentifier];
          const alwaysAsk = nodeSelected.data?.alwaysAsk || false;
          const pendingInputIdentifier = (ticket.dataWebhook as any)?.inputIdentifier;
          const isResumingThisExactInput = pendingInputIdentifier === inputIdentifier;

          logger.debug(`[INPUT NODE] Debug - Ticket ${ticket.id}, Variable: ${variableName}, InputIdentifier: ${inputIdentifier}`);
          logger.debug(`[INPUT NODE] Debug - inputResponded: ${inputResponded}, thisInputResponded: ${thisInputResponded}, alwaysAsk: ${alwaysAsk}, pendingInputIdentifier: ${pendingInputIdentifier || "none"}`);

          // Só pode pular o envio da pergunta se a resposta recebida pertence
          // exatamente ao Input que estava pendente no ticket. Sem essa trava,
          // valores antigos em global.flowVariables faziam Inputs seguintes ou
          // novas execuções do mesmo fluxo pularem direto para o nó Mensagem.
          if (inputResponded && thisInputResponded && isResumingThisExactInput && !alwaysAsk) {
            logger.debug(`[INPUT NODE] Retomando fluxo após resposta deste input específico - Ticket ${ticket.id}`);

            // Recuperar o valor do próximo nó salvo anteriormente
            const savedNext = global.flowVariables[`${inputIdentifier}_next`];
            logger.debug(`[INPUT NODE] Próximo nó salvo: ${savedNext}`);

            if (savedNext) {
              next = savedNext;
              // Limpar a variável após uso
              delete global.flowVariables[`${inputIdentifier}_next`];
              logger.debug(`[INPUT NODE] Continuando para próximo nó: ${next}`);
            } else {
              logger.warn(`[INPUT NODE] Nenhum próximo nó encontrado para ${inputIdentifier}`);
            }

            await ticket.update({
              dataWebhook: {
                ...ticket.dataWebhook,
                waitingInput: false
              }
            });

            // Pular para o próximo nó sem processar mais este nó
            continue;
          } else {
            logger.debug(`[INPUT NODE] Processando novo input - Ticket ${ticket.id}`);
            delete global.flowVariables[inputIdentifier];

            // ✅ CORRIGIDO: Verificar se o ticket está "open" antes de enviar mensagem do Input
            // EXCEÇÃO: Se o fluxo foi disparado manualmente (isManualTrigger=true), permitir execução mesmo com status "open"
            // Recarregar o ticket para obter o status mais atualizado
            if (idTicket) {
              const currentTicket = await Ticket.findByPk(idTicket);
              const currentHasActiveFlow = Boolean(
                currentTicket?.flowWebhook ||
                currentTicket?.flowStopped ||
                currentTicket?.lastFlowId ||
                (currentTicket?.dataWebhook as any)?.waitingInput ||
                (currentTicket?.dataWebhook as any)?.inputVariableName ||
                idFlowDb ||
                nextStage
              );
              if (currentTicket && currentTicket.status === "open" && !currentHasActiveFlow && !isManualTrigger) {
                logger.debug(`[INPUT NODE] ⚠️ Ticket ${idTicket} está OPEN - Parando fluxo e não enviando mensagem do Input`);
                // Limpar os dados do webhook relacionados ao Input
                await currentTicket.update({
                  dataWebhook: {
                    ...currentTicket.dataWebhook,
                    waitingInput: false,
                    inputVariableName: null,
                    inputIdentifier: null,
                    nextNodeId: null
                  }
                });
                return "stopped_by_open_ticket";
              }
              // Atualizar a referência do ticket
              ticket = currentTicket;
            }

            // Enviar a pergunta e aguardar resposta
            await intervalWhats("1");
            try {
              if (whatsapp?.channel === "whatsapp") {
                typeSimulation(ticket, "composing");
              }
            } catch (simErr: any) {
              logger.warn(`[ACTIONS WEBHOOK] typeSimulation ignorado: ${simErr?.message}`);
            }

            if (whatsapp.channel === "whatsapp_oficial") {
              await SendWhatsAppOficialMessage({
                body: question,
                ticket: ticket,
                quotedMsg: null,
                type: 'text',
                media: null,
                vCard: null
              });
            } else if (whatsapp.channel === "whatsapp") {
              await SendWhatsAppMessage({
                body: question,
                ticket: ticket,
                quotedMsg: null
              });
            } else {
              await SendMessage(whatsapp, {
                number: numberClient,
                body: question
              });
      }


            if (ticket) {
              // Salvar a conexão de saída para ser usada quando o fluxo for retomado
              const outputConnection = connects.filter(
                connect => connect.source === nodeSelected.id && connect.sourceHandle === "a"
              )[0];

              // BUG relatado: "pergunta, recebe a resposta e repete a pergunta,
              // não avança pro próximo nó". Antes, quando não existia conexão de
              // saída (nó Input sem linha ligada ao próximo passo — falta
              // desenhar a conexão no editor, ou uma conexão antiga sem
              // sourceHandle "a"), o código caía no fallback `next` — que
              // NESTE ponto do loop é o próprio id do nó Input (ainda estamos
              // processando ele). Isso salvava nextNodeId = ele mesmo, e
              // quando o cliente respondia, o fluxo "retomava" voltando pro
              // MESMO nó Input, que reenviava a mesma pergunta — um loop.
              // Agora: sem conexão de saída, não inventa um next (evita o
              // auto-loop) — loga um aviso claro pra facilitar diagnóstico.
              if (!outputConnection) {
                logger.warn(`[INPUT NODE] ⚠️ Nó ${nodeSelected.id} não tem conexão de saída (handle "a") configurada no fluxo — depois de responder, o fluxo vai encerrar em vez de repetir a pergunta. Verifique se falta ligar este nó Input ao próximo passo no editor do FlowBuilder.`);
              }
              const nextNodeId = outputConnection ? outputConnection.target : "";

              logger.debug(`[TICKET UPDATE] Preparando ticket ${ticket.id} para aguardar input - Status: pending, LastFlowId: ${nodeSelected.id}, WaitingInput: true`);

              await ticket.update({
                status: "pending",
                lastFlowId: nodeSelected.id,
                flowWebhook: true,
                hashFlowId: hashWebhookId,
                flowStopped: idFlowDb.toString(),
                dataWebhook: {
                  ...ticket.dataWebhook,
                  flowId: idFlowDb, // persistir flowId para retomadas resilientes
                  waitingInput: true,
                  inputVariableName: variableName,
                  inputIdentifier: inputIdentifier,
                  nextNodeId: nextNodeId // Salvar no dataWebhook também como backup
                }
              });

              logger.debug(`[TICKET UPDATE] Ticket ${ticket.id} configurado para aguardar input - Variable: ${variableName}, NextNodeId: ${nextNodeId}`);

              global.flowVariables = global.flowVariables || {};
              global.flowVariables[`${inputIdentifier}_next`] = nextNodeId;

              return "waiting_input"; // Parar o fluxo imediatamente para aguardar a resposta
            }
          }
        } catch (error) {
          logger.error(`[INPUT NODE] Erro ao preparar pergunta do input ${nodeSelected?.id} no ticket ${idTicket}:`, error);
          return "input_error";
        }
      }

      // [conditionCompare legado removido — o bloco principal com suporte a AND/OR e múltiplas condições está abaixo]

      if (nodeSelected.type === "variable") {
        try {
          const variableName = nodeSelected.data.variableName;
          let variableValue = nodeSelected.data.variableValue;

          if (variableName) {
            // Processar o valor da variável usando replaceMessages se contiver variáveis
            if (typeof variableValue === "string" && variableValue.includes("${")) {
              const dataLocal = {
                nome: createFieldJsonName,
                numero: numberClient,
                email: createFieldJsonEmail
              };

              variableValue = replaceMessages(
                variableValue,
                details,
                dataWebhook,
                dataLocal,
                idTicket
              );
            }

            global.flowVariables = global.flowVariables || {};

            // Salvar a variável globalmente
            global.flowVariables[variableName] = variableValue;

            // Se temos um ticketId, salvar também como variável específica do ticket
            if (idTicket) {
              const ticketSpecificVar = `${idTicket}_${variableName}`;
              global.flowVariables[ticketSpecificVar] = variableValue;
            }
          }
        } catch (error) {
        }
      }

      if (nodeSelected.type === "httpRequest") {
        try {
          const {
            url,
            method,
            requestBody,
            headersString,
            queryParams,
            saveVariables,
            responseVariables,
            timeout
          } = nodeSelected.data;

          // ✅ VALIDAÇÃO MELHORADA: Verificar se URL é válida antes de continuar
          if (!url || typeof url !== 'string' || url.trim().length === 0) {
            logger.warn(`[HTTP REQUEST NODE] URL vazia ou inválida no nó ${nodeSelected.id} - pulando execução`);
            continue;
          }

          // ✅ Verificar se URL contém variáveis não substituídas
          if (url.includes("${") && url.includes("}")) {
            const unresolvedVars = url.match(/\${([^}]+)}/g);
            if (unresolvedVars) {
              logger.warn(`[HTTP REQUEST NODE] URL contém variáveis não resolvidas: ${unresolvedVars.join(', ')} - pulando execução`);
              continue;
            }
          }

          let headers = {};
          try {
            if (headersString && typeof headersString === "string") {
              headers = JSON.parse(headersString);
            } else if (typeof headersString === "object") {
              headers = headersString;
            }
          } catch (err) {
            console.error(
              "[httpRequestNode] Erro ao parsear headers JSON:",
              err
            );
          }

          let body = null;
          if (
            ["POST", "PUT", "PATCH", "DELETE"].includes(
              method?.toUpperCase() || "GET"
            )
          ) {
            try {
              body =
                requestBody && typeof requestBody === "string"
                  ? requestBody.trim().startsWith("{")
                    ? JSON.parse(requestBody)
                    : requestBody
                  : null;
            } catch (err) {
              console.error(
                "[httpRequestNode] Erro ao parsear body JSON, usando como string:",
                err
              );
              body = requestBody;
            }
          }

          const requestTimeout = timeout || 10000;

          logger.info(`[HTTP REQUEST NODE] Executando requisição - URL: ${url}, Method: ${method || "GET"}`);

          const response = await makeHttpRequest(
            url,
            method || "GET",
            headers,
            body,
            queryParams,
            requestTimeout
          );

          // ✅ Verificar se houve erro na resposta
          if (response.error) {
            logger.error(`[HTTP REQUEST NODE] Requisição falhou: ${response.message} - Status: ${response.status}`);
            // Continuar o fluxo mesmo com erro
            global.flowVariables = global.flowVariables || {};
            global.flowVariables["apiResponse"] = null;
            global.flowVariables["apiError"] = response.message;
            continue;
          }

          logger.info(`[HTTP REQUEST NODE] Requisição bem-sucedida - Status: ${response.status}`);

          global.flowVariables = global.flowVariables || {};
          global.flowVariables["apiResponse"] = response.data;

          if (response.data) {
            let variablesToProcess = [];

            if (
              responseVariables &&
              Array.isArray(responseVariables) &&
              responseVariables.length > 0
            ) {
              variablesToProcess = responseVariables;
            } else if (
              saveVariables &&
              Array.isArray(saveVariables) &&
              saveVariables.length > 0
            ) {
              variablesToProcess = saveVariables.map(item => ({
                path: item.path,
                variableName: item.variable
              }));
            } else if (
              nodeSelected.data.responseVariables &&
              Array.isArray(nodeSelected.data.responseVariables)
            ) {
              variablesToProcess = nodeSelected.data.responseVariables;
            } else if (
              nodeSelected.data.saveVariables &&
              Array.isArray(nodeSelected.data.saveVariables)
            ) {
              variablesToProcess = nodeSelected.data.saveVariables.map(
                item => ({
                  path: item.path,
                  variableName: item.variable || item.variableName
                })
              );
            }

            if (variablesToProcess && variablesToProcess.length > 0) {
              for (let i = 0; i < variablesToProcess.length; i++) {
                const extractor = variablesToProcess[i];

                if (extractor && extractor.path && extractor.variableName) {
                  const parts = extractor.path.split(".");
                  let value = response.data;
                  let pathValid = true;

                  for (const part of parts) {
                    if (value && typeof value === "object" && part in value) {
                      value = value[part];
                    } else {
                      pathValid = false;
                      break;
                    }
                  }

                  if (pathValid && value !== undefined && value !== null) {
                    if (typeof setFlowVariable === "function") {
                      setFlowVariable(extractor.variableName, value);
                    } else {
                      global.flowVariables[extractor.variableName] = value;
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          logger.error(`[HTTP REQUEST NODE] Erro ao processar nó HTTP Request: ${error.message}`);
          logger.error(`[HTTP REQUEST NODE] Stack: ${error.stack}`);

          // ✅ Salvar informações do erro nas variáveis globais
          global.flowVariables = global.flowVariables || {};
          global.flowVariables["apiResponse"] = null;
          global.flowVariables["apiError"] = error.message;

          // ✅ Continuar o fluxo mesmo com erro (não quebrar o fluxo inteiro)
          logger.info(`[HTTP REQUEST NODE] Continuando fluxo apesar do erro no nó ${nodeSelected.id}`);
        }
      }

      // ========== NÓS N8N ==========

      if (nodeSelected.type === "n8nWebhook") {
        try {
          const { webhookUrl, authToken, sendTicketData, sendContactData, sendMessageData, customPayload } = nodeSelected.data;

          if (!webhookUrl) {
            logger.warn(`[N8N WEBHOOK NODE] URL vazia no nó ${nodeSelected.id} - pulando`);
            continue;
          }

          if (!(await ensureTicket())) continue;

          const payload: any = {
            flowNodeId: nodeSelected.id,
            timestamp: new Date().toISOString(),
          };

          if (sendTicketData && ticket) {
            payload.ticket = {
              id: ticket.id,
              status: ticket.status,
              queueId: ticket.queueId,
              userId: ticket.userId,
              whatsappId: ticket.whatsappId,
              companyId: ticket.companyId,
            };
          }

          if (sendContactData && ticket) {
            const contact = await Contact.findByPk(ticket.contactId);
            if (contact) {
              payload.contact = {
                id: contact.id,
                name: contact.name,
                number: contact.number,
                email: contact.email,
                profilePicUrl: contact.profilePicUrl,
              };
            }
          }

          if (sendMessageData) {
            payload.lastMessage = ticket?.lastMessage || "";
          }

          if (customPayload) {
            try {
              let parsedPayload = customPayload;
              // Substituir variáveis {{var}} no payload
              if (typeof parsedPayload === 'string') {
                parsedPayload = parsedPayload.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
                  return global.flowVariables?.[varName] || "";
                });
                payload.custom = JSON.parse(parsedPayload);
              }
            } catch (err) {
              logger.warn(`[N8N WEBHOOK NODE] Erro ao parsear customPayload: ${err.message}`);
              payload.custom = customPayload;
            }
          }

          const headers: any = { "Content-Type": "application/json" };
          if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

          logger.info(`[N8N WEBHOOK NODE] Enviando para ${webhookUrl}`);

          const startTime = Date.now();
          // Fire-and-forget: não espera resposta
          axios.post(webhookUrl, payload, {
            headers,
            timeout: 10000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          }).then(res => {
            logger.info(`[N8N WEBHOOK NODE] Sucesso - Status: ${res.status}`);
            logN8NExecution({ companyId, nodeType: "n8nWebhook", webhookUrl, ticketId: ticket?.id, contactId: ticket?.contactId, requestPayload: payload, responseData: res.data, status: "success", duration: Date.now() - startTime });
          }).catch(err => {
            logger.error(`[N8N WEBHOOK NODE] Erro: ${err.message}`);
            logN8NExecution({ companyId, nodeType: "n8nWebhook", webhookUrl, ticketId: ticket?.id, contactId: ticket?.contactId, requestPayload: payload, errorMessage: err.message, status: "error", duration: Date.now() - startTime });
          });

        } catch (error) {
          logger.error(`[N8N WEBHOOK NODE] Erro: ${error.message}`);
        }
      }

      // ========== N8N TRIGGER NODE (configurável: ticket/conexao/mensagem/contato + sync/async + Basic Auth) ==========
      if (nodeSelected.type === "n8nTrigger") {
        try {
          const {
            webhookUrl,
            authUser,
            authPass,
            mode,
            timeout: nodeTimeout,
            saveResponseVar,
            events,
            fieldMapping,
          } = nodeSelected.data || {};

          if (!webhookUrl) {
            logger.warn(`[N8N TRIGGER] URL vazia no nó ${nodeSelected.id} - pulando`);
            continue;
          }

          if (!(await ensureTicket())) continue;

          const selectedEvents = events || { ticket: true };
          const eventList = Object.keys(selectedEvents).filter(k => selectedEvents[k]);
          const primaryEvent = eventList[0] || "ticket";

          // Helpers de mapeamento e interpolação ---------------------------------
          const interpolate = (raw: any): any => {
            if (typeof raw !== "string") return raw;
            return raw.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
              const scoped = global.flowVariables?.[`${ticket?.id}_${key}`];
              if (scoped !== undefined && scoped !== null) return String(scoped);
              const val = global.flowVariables?.[key];
              return val === undefined || val === null ? "" : String(val);
            });
          };

          const pickFields = (source: any, evKey: string, allFields: string[]) => {
            const map = fieldMapping?.[evKey];
            const selectedFields: string[] = Array.isArray(map?.fields)
              ? map.fields
              : allFields;
            const out: any = {};
            selectedFields.forEach((f) => {
              if (source && Object.prototype.hasOwnProperty.call(source, f)) {
                out[f] = source[f];
              }
            });
            // Campos customizados (com variáveis do fluxo)
            (map?.custom || []).forEach((c: any) => {
              if (c?.key && String(c.key).trim()) {
                out[String(c.key).trim()] = interpolate(c.value);
              }
            });
            return out;
          };

          // Monta payload conforme eventos selecionados
          const payload: any = {
            flowId: idFlowDb,
            nodeId: nodeSelected.id,
            timestamp: new Date().toISOString(),
            events: eventList,
            __flowId: idFlowDb,
            __nodeId: nodeSelected.id,
            __event: primaryEvent,
            __mode: mode || "async",
          };

          if (selectedEvents.ticket && ticket) {
            const fullTicket = {
              id: ticket.id,
              uuid: ticket.uuid,
              status: ticket.status,
              queueId: ticket.queueId,
              userId: ticket.userId,
              whatsappId: ticket.whatsappId,
              companyId: ticket.companyId,
              lastMessage: ticket.lastMessage,
              isGroup: ticket.isGroup,
              unreadMessages: ticket.unreadMessages,
              channel: (ticket as any).channel,
              createdAt: ticket.createdAt,
              updatedAt: ticket.updatedAt,
            };
            payload.ticket = pickFields(fullTicket, "ticket", Object.keys(fullTicket));
          }

          if (selectedEvents.connection && ticket?.whatsappId) {
            try {
              const wpp = await Whatsapp.findByPk(ticket.whatsappId);
              if (wpp) {
                const fullConn = {
                  id: wpp.id,
                  name: wpp.name,
                  status: wpp.status,
                  number: wpp.number,
                  channel: (wpp as any).channel,
                };
                payload.connection = pickFields(fullConn, "connection", Object.keys(fullConn));
              }
            } catch (_) {}
          }

          if (selectedEvents.message) {
            const fullMsg = {
              body: numberPhrase || ticket?.lastMessage || "",
              from: ticket?.contact?.number,
              ticketId: ticket?.id,
              timestamp: new Date().toISOString(),
            };
            payload.message = pickFields(fullMsg, "message", Object.keys(fullMsg));
          }

          if (selectedEvents.contact && ticket) {
            const ct = ticket.contact || (await Contact.findByPk(ticket.contactId));
            if (ct) {
              const fullCt = {
                id: ct.id,
                name: ct.name,
                number: ct.number,
                email: ct.email,
                profilePicUrl: ct.profilePicUrl,
                isGroup: ct.isGroup,
              };
              payload.contact = pickFields(fullCt, "contact", Object.keys(fullCt));
            }
          }

          if (selectedEvents.queue && ticket?.queueId) {
            try {
              const q = await Queue.findByPk(ticket.queueId);
              if (q) {
                const fullQ = {
                  id: q.id,
                  name: q.name,
                  color: q.color,
                  greetingMessage: (q as any).greetingMessage,
                  order: (q as any).order,
                  companyId: q.companyId,
                };
                payload.queue = pickFields(fullQ, "queue", Object.keys(fullQ));
              }
            } catch (_) {}
          }

          if (selectedEvents.rating && ticket?.id) {
            try {
              const r = await UserRating.findOne({
                where: { ticketId: ticket.id },
                order: [["createdAt", "DESC"]],
              });
              if (r) {
                const fullR = {
                  id: r.id,
                  rate: (r as any).rate,
                  userId: (r as any).userId,
                  ticketId: (r as any).ticketId,
                  contactId: (r as any).contactId,
                  createdAt: r.createdAt,
                };
                payload.rating = pickFields(fullR, "rating", Object.keys(fullR));
              }
            } catch (_) {}
          }

          if (selectedEvents.schedule && ticket) {
            try {
              const sch = await Schedule.findOne({
                where: ticket.id
                  ? { ticketId: ticket.id }
                  : { contactId: ticket.contactId },
                order: [["createdAt", "DESC"]],
              });
              if (sch) {
                const fullS = {
                  id: sch.id,
                  body: (sch as any).body,
                  sendAt: (sch as any).sendAt,
                  status: (sch as any).status,
                  contactId: (sch as any).contactId,
                  ticketId: (sch as any).ticketId,
                  userId: (sch as any).userId,
                };
                payload.schedule = pickFields(fullS, "schedule", Object.keys(fullS));
              }
            } catch (_) {}
          }

          if (selectedEvents.ticketNote && ticket?.id) {
            try {
              const note = await TicketNote.findOne({
                where: { ticketId: ticket.id },
                order: [["createdAt", "DESC"]],
              });
              if (note) {
                const fullN = {
                  id: note.id,
                  note: (note as any).note,
                  userId: (note as any).userId,
                  ticketId: (note as any).ticketId,
                  contactId: (note as any).contactId,
                  createdAt: note.createdAt,
                };
                payload.ticketNote = pickFields(fullN, "ticketNote", Object.keys(fullN));
              }
            } catch (_) {}
          }


          const headers: any = { "Content-Type": "application/json" };
          if (authUser) {
            const basic = Buffer.from(`${authUser}:${authPass || ""}`).toString("base64");
            headers["Authorization"] = `Basic ${basic}`;
          }

          const reqTimeout = parseInt(nodeTimeout) || 10000;
          logger.info(`[N8N TRIGGER] Disparando ${mode || "async"} -> ${webhookUrl} eventos=[${eventList.join(",")}]`);

          const startTime = Date.now();
          const baseLog = {
            companyId,
            nodeType: "n8nTrigger",
            webhookUrl,
            ticketId: ticket?.id,
            contactId: ticket?.contactId,
            flowId: idFlowDb,
            nodeId: nodeSelected.id,
            event: primaryEvent,
            mode: mode || "async",
            requestPayload: payload,
          };

          if (mode === "sync") {
            try {
              const response = await axios.post(webhookUrl, payload, {
                headers,
                timeout: reqTimeout,
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              });

              // Salva resposta como variável do fluxo
              const varName = (saveResponseVar || "n8nResponse").trim();
              if (varName && global.flowVariables) {
                global.flowVariables[varName] = response.data;
              }

              await logN8NExecution({
                ...baseLog,
                responseData: response.data,
                status: "success",
                duration: Date.now() - startTime,
              });
              logger.info(`[N8N TRIGGER] Sucesso sync - Status: ${response.status} (${Date.now() - startTime}ms)`);
            } catch (err) {
              await logN8NExecution({
                ...baseLog,
                errorMessage: err.message,
                status: "error",
                duration: Date.now() - startTime,
              });
              logger.error(`[N8N TRIGGER] Erro sync: ${err.message}`);
            }
          } else {
            // Fire-and-forget
            axios
              .post(webhookUrl, payload, {
                headers,
                timeout: reqTimeout,
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              })
              .then(res => {
                logN8NExecution({
                  ...baseLog,
                  responseData: res.data,
                  status: "success",
                  duration: Date.now() - startTime,
                });
                logger.info(`[N8N TRIGGER] Sucesso async - Status: ${res.status}`);
              })
              .catch(err => {
                logN8NExecution({
                  ...baseLog,
                  errorMessage: err.message,
                  status: "error",
                  duration: Date.now() - startTime,
                });
                logger.error(`[N8N TRIGGER] Erro async: ${err.message}`);
              });
          }
        } catch (error) {
          logger.error(`[N8N TRIGGER] Erro: ${error.message}`);
        }
      }



      if (nodeSelected.type === "appointmentBooking") {
        if (!idTicket || !(await ensureTicket())) continue;

        const supportsWhatsAppBooking =
          ["whatsapp", "whatsapp_oficial", "wacalls"].includes(whatsapp.channel) ||
          Boolean(whatsapp.zapiInstanceId);
        if (!supportsWhatsAppBooking) {
          logger.warn(
            `[APPOINTMENTS] Nó de agendamento ignorado no canal não suportado "${whatsapp.channel}".`
          );
          await ticket.update({
            flowWebhook: false,
            lastFlowId: null,
            hashFlowId: null,
            flowStopped: null,
            dataWebhook: null
          });
          return "unsupported_appointment_channel";
        }

        const currentTicket = await Ticket.findByPk(ticket.id);
        if (currentTicket?.status === "open" && !isManualTrigger) {
          await currentTicket.update({
            flowWebhook: false,
            lastFlowId: null,
            hashFlowId: null,
            flowStopped: null,
            dataWebhook: null
          });
          return "stopped_by_open_ticket";
        }

        const sendBookingText = async (body: string) => {
          const ticketDetails = await ShowTicketService(ticket.id, companyId);
          if (whatsapp.channel === "wacalls") {
            const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
            await SendWacallsText({ ticket: ticketDetails, body });
          } else {
            await sendTextByChannel(
              detectChannel(whatsapp),
              body,
              ticketDetails,
              whatsapp
            );
          }
        };
        const configuredMessages = nodeSelected.data?.messages || {};
        const getBookingMessage = (
          key: string,
          fallback: string,
          variables: Record<string, string> = {}
        ) =>
          getAppointmentBookingMessage(configuredMessages, key, fallback, variables);
        const persistWait = async (state: any) => {
          await ticket.update({
            status: "pending",
            flowWebhook: true,
            lastFlowId: nodeSelected.id,
            flowStopped: idFlowDb.toString(),
            hashFlowId: hashWebhookId,
            dataWebhook: {
              ...(ticket.dataWebhook as any || {}),
              appointmentBooking: state,
              waitingInput: true,
              flowId: idFlowDb
            }
          });
        };
        const allServiceRows = await AppointmentService.findAll({
          where: { companyId, active: true },
          order: [["name", "ASC"]]
        });
        const serviceAssignments = allServiceRows.length
          ? await AppointmentServiceProfessional.findAll({
              where: { serviceId: allServiceRows.map(service => service.id) },
              attributes: ["serviceId", "professionalId"]
            })
          : [];
        const assignedServiceIds = new Set(
          serviceAssignments.map(assignment => assignment.serviceId)
        );
        const serviceRows = allServiceRows.filter(service =>
          assignedServiceIds.has(service.id)
        );
        const optionsText = (options: Array<{ name: string; detail?: string }>) =>
          options.map((option, index) =>
            `${index + 1}. ${option.name}${option.detail ? ` — ${option.detail}` : ""}`
          ).join("\n");
        const state = (ticket.dataWebhook as any)?.appointmentBooking || {
          step: "service"
        };
        const reply = String(pressKey || "")
          .trim()
          .replace(/[\r\n\u200e\u200f\u200b]/g, "")
          .replace(/^\*[^*]+:\*\s*/, "");

        const showStep = async (nextState: any) => {
          if (nextState.step === "service") {
            const services = serviceRows;
            if (services.length === 0) {
              await sendBookingText(
                getBookingMessage(
                  "noServices",
                  "Ainda não há serviços disponíveis para agendamento. Peça à equipe para cadastrar os serviços e associar profissionais."
                )
              );
              await ticket.update({
                flowWebhook: false,
                lastFlowId: null,
                hashFlowId: null,
                flowStopped: null,
                dataWebhook: null
              });
              return false;
            }
            nextState.options = services.map(service => ({
              id: service.id,
              name: service.name,
              detail: `${service.durationMinutes} min${service.price ? ` · R$ ${Number(service.price).toFixed(2)}` : ""}`
            }));
            await sendBookingText(
              `${getBookingMessage("servicePrompt", "Qual serviço deseja agendar?")}\n${optionsText(nextState.options)}\n\nDigite *cancelar* para sair.`
            );
          } else if (nextState.step === "professional") {
            const assignments = await AppointmentServiceProfessional.findAll({
              where: { serviceId: Number(nextState.service.id) },
              attributes: ["professionalId"]
            });
            const professionalIds = assignments.map(assignment => assignment.professionalId);
            const professionals = professionalIds.length
              ? await User.findAll({
                  where: { companyId, id: professionalIds },
                  attributes: ["id", "name"],
                  order: [["name", "ASC"]]
                })
              : [];
            nextState.options = professionals.map(person => ({
              id: person.id,
              name: person.name
            }));
            if (professionals.length === 0) {
              await sendBookingText(
                getBookingMessage(
                  "noProfessionals",
                  "Não há profissionais habilitados para este serviço."
                )
              );
              await ticket.update({
                flowWebhook: false,
                lastFlowId: null,
                hashFlowId: null,
                flowStopped: null,
                dataWebhook: null
              });
              return false;
            }
            await sendBookingText(
              `${getBookingMessage("professionalPrompt", "Com quem deseja agendar?")}\n${optionsText(nextState.options)}\n\nDigite *cancelar* para sair.`
            );
          } else if (nextState.step === "slot") {
            let slots;
            try {
              slots = await listAvailableSlots({
                companyId,
                serviceId: Number(nextState.service.id),
                professionalId: Number(nextState.professional.id),
                days: 14,
                limit: 9
              });
            } catch (error: any) {
              logger.error(`[APPOINTMENTS] Falha ao consultar horários: ${error?.message || error}`);
              await sendBookingText(
                getBookingMessage(
                  "slotLookupError",
                  "Não consegui consultar os horários agora. Tente novamente mais tarde ou fale com a equipe."
                )
              );
              await ticket.update({
                flowWebhook: false,
                lastFlowId: null,
                hashFlowId: null,
                flowStopped: null,
                dataWebhook: null
              });
              return false;
            }
            nextState.options = slots.map(slot => ({
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              name: slot.label
            }));
            if (slots.length === 0) {
              await sendBookingText(
                getBookingMessage(
                  "noSlots",
                  "Não encontrei horários disponíveis para esse profissional nas próximas duas semanas. Escolha outro profissional."
                )
              );
              nextState.step = "professional";
              return showStep(nextState);
            }
            await sendBookingText(
              `${getBookingMessage("slotPrompt", "Escolha um horário:")}\n${optionsText(nextState.options)}\n\nDigite *cancelar* para sair.`
            );
          } else if (nextState.step === "confirm") {
            await sendBookingText(
              getBookingMessage(
                "confirmationPrompt",
                "Confirme sua reserva:\n*Serviço:* {{service}}\n*Profissional:* {{professional}}\n*Horário:* {{when}}\n\nResponda *1* para confirmar ou *2* para cancelar.",
                {
                  service: nextState.service.name,
                  professional: nextState.professional.name,
                  when: nextState.slot.name
                }
              )
            );
          }

          await persistWait(nextState);
          return true;
        };

        if (reply.toLowerCase() === "cancelar") {
          await sendBookingText(
            getBookingMessage(
              "bookingCancelled",
              "Agendamento cancelado. Se precisar, é só chamar novamente."
            )
          );
          await ticket.update({
            dataWebhook: {
              ...(ticket.dataWebhook as any || {}),
              appointmentBooking: null,
              waitingInput: false
            }
          });
          const outgoing = connects.find(connection => connection.source === nodeSelected.id);
          next = outgoing?.target || "";
          pressKey = undefined;
          noAlterNext = true;
          continue;
        }

        if (!pressKey) {
          await showStep(state);
          return "waiting_input";
        }

        const selectedNumber = reply.match(/^(\d+)/)?.[1];
        const selectedOption = selectedNumber
          ? state.options?.[Number(selectedNumber) - 1]
          : state.options?.find((option: any) =>
              String(option.name).toLowerCase() === reply.toLowerCase()
            );

        if (state.step === "service" && selectedOption) {
          const service = serviceRows.find(item => item.id === Number(selectedOption.id));
          if (!service) throw new AppError("ERR_APPOINTMENT_SERVICE_NOT_FOUND", 404);
          state.service = {
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            price: service.price
          };
          state.step = "professional";
          await showStep(state);
          return "waiting_input";
        }

        if (state.step === "professional" && selectedOption) {
          state.professional = selectedOption;
          state.step = "slot";
          await showStep(state);
          return "waiting_input";
        }

        if (state.step === "slot" && selectedOption) {
          state.slot = selectedOption;
          state.step = "confirm";
          await showStep(state);
          return "waiting_input";
        }

        if (state.step === "confirm" && ["1", "sim", "confirmar"].includes(reply.toLowerCase())) {
          try {
            const result = await createBooking({
              companyId,
              serviceId: Number(state.service.id),
              professionalId: Number(state.professional.id),
              contactId: ticket.contactId,
              ticketId: ticket.id,
              startsAt: state.slot.startsAt
            });
            const booking = result.booking;
            const when = moment(booking.startsAt)
              .tz((await Company.findByPk(companyId))?.timezone || "America/Sao_Paulo")
              .format("DD/MM [às] HH:mm");
            const syncWarning = result.googleSyncError
              ? "\n\nA reserva foi salva, mas não foi possível sincronizar com o Google Agenda."
              : "";
            const confirmationMessage = getBookingMessage(
              "bookingConfirmed",
              "Agendamento confirmado! ✅\n*Serviço:* {{service}}\n*Profissional:* {{professional}}\n*Data e hora:* {{when}}",
              {
                service: state.service.name,
                professional: state.professional.name,
                when
              }
            );
            await sendBookingText(`${confirmationMessage}${syncWarning}`);
            await ticket.update({
              dataWebhook: {
                ...(ticket.dataWebhook as any || {}),
                appointmentBooking: null,
                waitingInput: false
              }
            });
            next = connects.find(connection => connection.source === nodeSelected.id)?.target || "";
            pressKey = undefined;
            noAlterNext = true;
            continue;
          } catch (error: any) {
            if (error?.message === "ERR_APPOINTMENT_SLOT_UNAVAILABLE") {
              await sendBookingText(
                getBookingMessage(
                  "slotUnavailable",
                  "Esse horário acabou de ser reservado. Vou mostrar os horários atualizados."
                )
              );
              state.step = "slot";
              await showStep(state);
              return "waiting_input";
            }

            logger.error(`[APPOINTMENTS] Falha ao confirmar a reserva: ${error?.message || error}`);
            await sendBookingText(
              getBookingMessage(
                "bookingFailure",
                "Não consegui verificar o resultado da reserva. Confirme com a equipe antes de tentar novamente."
              )
            );
            await ticket.update({
              flowWebhook: false,
              lastFlowId: null,
              hashFlowId: null,
              flowStopped: null,
              dataWebhook: null
            });
            return "appointment_booking_failed";
          }
        }

        if (state.step === "confirm" && ["2", "nao", "não"].includes(reply.toLowerCase())) {
          await sendBookingText(
            getBookingMessage("bookingNotConfirmed", "Agendamento não confirmado.")
          );
          await ticket.update({
            dataWebhook: {
              ...(ticket.dataWebhook as any || {}),
              appointmentBooking: null,
              waitingInput: false
            }
          });
          next = connects.find(connection => connection.source === nodeSelected.id)?.target || "";
          pressKey = undefined;
          noAlterNext = true;
          continue;
        }

        await sendBookingText(
          getBookingMessage("invalidReply", "Resposta inválida. Vou repetir as opções.")
        );
        await showStep(state);
        return "waiting_input";
      }

      if (nodeSelected.type === "googleCalendar") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const CreateCalendarEventService = require("../GoogleCalendarService/CreateCalendarEventService").default;
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const parseHumanDateTime = require("../GoogleCalendarService/parseHumanDateTime").default;

          const d = nodeSelected.data || {};
          const interp = (raw: any): string => {
            if (raw === null || raw === undefined) return "";
            const s = String(raw);
            return s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
              const scoped = global.flowVariables?.[`${ticket?.id}_${key}`];
              if (scoped !== undefined && scoped !== null) return String(scoped);
              const val = global.flowVariables?.[key];
              return val === undefined || val === null ? "" : String(val);
            });
          };
          // Permite usar nome de variável "puro" (sem chaves) ou "{{var}}"
          const readVar = (name: string): string => {
            if (!name) return "";
            const v = String(name).trim();
            if (v.includes("{{")) return interp(v);
            return interp(`{{${v}}}`);
          };

          const summary = interp(d.summary || "Agendamento");
          const description = interp(d.description || "");
          const dateStr = readVar(d.dateVar || "data");
          const timeStr = readVar(d.timeVar || "hora");
          const professional = readVar(d.professionalVar || "");
          const customerEmail = readVar(d.customerEmailVar || "");
          const attendees: string[] = [];
          if (customerEmail && /@/.test(customerEmail)) attendees.push(customerEmail);
          if (d.extraAttendees && Array.isArray(d.extraAttendees)) {
            d.extraAttendees.forEach((e: string) => { if (e) attendees.push(interp(e)); });
          }

          const startISO = parseHumanDateTime(dateStr, timeStr, d.timezone);
          const finalDescription = [
            description,
            professional ? `Profissional: ${professional}` : "",
            customerEmail ? `Cliente: ${customerEmail}` : ""
          ].filter(Boolean).join("\n");

          const result = await CreateCalendarEventService({
            companyId,
            summary,
            description: finalDescription,
            startISO,
            durationMinutes: d.durationMinutes ? Number(d.durationMinutes) : undefined,
            attendees,
            calendarId: d.calendarId || undefined,
            timezone: d.timezone || undefined
          });

          // Salva variáveis para próximos nodes
          const outVar = d.saveResponseVar || "googleEvent";
          global.flowVariables[`${ticket?.id}_${outVar}Id`] = result.eventId;
          global.flowVariables[`${outVar}Id`] = result.eventId;
          global.flowVariables[`${ticket?.id}_${outVar}Link`] = result.htmlLink;
          global.flowVariables[`${outVar}Link`] = result.htmlLink;

          // Disponibiliza também o link/id em variáveis "amigáveis" para nó de Mensagem subsequente
          global.flowVariables[`${ticket?.id}_googleEventLink`] = result.htmlLink;
          global.flowVariables[`googleEventLink`] = result.htmlLink;
          global.flowVariables[`${ticket?.id}_googleEventId`] = result.eventId;
          global.flowVariables[`googleEventId`] = result.eventId;

          logger.info(`[GoogleCalendar] Evento criado: ${result.eventId} para ticket ${ticket?.id}`);
        } catch (error: any) {
          logger.error(`[GoogleCalendar] Erro ao criar evento: ${error.message}`);
        }
      }


      if (nodeSelected.type === "n8nWait") {
        try {
          const { webhookUrl, authToken, timeoutMinutes, saveResponseVar, callbackMessage } = nodeSelected.data;

          if (!webhookUrl) {
            logger.warn(`[N8N WAIT NODE] URL vazia no nó ${nodeSelected.id} - pulando`);
            continue;
          }

          if (!(await ensureTicket())) continue;

          // Enviar mensagem de espera se configurada
          if (callbackMessage && ticket) {
            const waitMsg = {
              body: callbackMessage,
              number: numberClient,
              companyId: companyId,
            };
            await SendMessageFlow(ticket.whatsapp, waitMsg);
          }

          const callbackUrl = `${process.env.BACKEND_URL}/n8n-callback`;

          const payload: any = {
            flowNodeId: nodeSelected.id,
            ticketId: ticket?.id,
            companyId: companyId,
            callbackUrl: callbackUrl,
            timestamp: new Date().toISOString(),
          };

          // Adicionar dados do ticket e contato
          if (ticket) {
            payload.ticket = {
              id: ticket.id,
              status: ticket.status,
              queueId: ticket.queueId,
              contactId: ticket.contactId,
            };
            const contact = await Contact.findByPk(ticket.contactId);
            if (contact) {
              payload.contact = {
                id: contact.id,
                name: contact.name,
                number: contact.number,
                email: contact.email,
              };
            }
          }

          const headers: any = { "Content-Type": "application/json" };
          if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

          logger.info(`[N8N WAIT NODE] Enviando para ${webhookUrl} e aguardando callback`);

          const startTime = Date.now();
          try {
            const response = await axios.post(webhookUrl, payload, {
              headers,
              timeout: (timeoutMinutes || 5) * 60 * 1000,
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            });

            // Salvar resposta na variável se configurada
            if (saveResponseVar && response.data) {
              global.flowVariables = global.flowVariables || {};
              global.flowVariables[saveResponseVar] = typeof response.data === 'object'
                ? JSON.stringify(response.data)
                : response.data;
              logger.info(`[N8N WAIT NODE] Resposta salva em variável: ${saveResponseVar}`);
            }

            logger.info(`[N8N WAIT NODE] Retorno recebido - Status: ${response.status}`);
            logN8NExecution({ companyId, nodeType: "n8nWait", webhookUrl, ticketId: ticket?.id, contactId: ticket?.contactId, requestPayload: payload, responseData: response.data, status: "success", duration: Date.now() - startTime });
          } catch (err) {
            logger.error(`[N8N WAIT NODE] Timeout ou erro: ${err.message}`);
            logN8NExecution({ companyId, nodeType: "n8nWait", webhookUrl, ticketId: ticket?.id, contactId: ticket?.contactId, requestPayload: payload, errorMessage: err.message, status: "error", duration: Date.now() - startTime });
            // Em caso de timeout, seguir pelo handle "timeout" se existir
            global.flowVariables = global.flowVariables || {};
            global.flowVariables["n8n_timeout"] = "true";
            if (saveResponseVar) {
              global.flowVariables[saveResponseVar] = null;
            }

            // Buscar conexão de timeout
            const timeoutConnection = connects.filter(
              conn => conn.source === nodeSelected.id && conn.sourceHandle === "timeout"
            );
            if (timeoutConnection.length > 0) {
              next = timeoutConnection[0].target;
              noAlterNext = true;
              logger.info(`[N8N WAIT NODE] Seguindo caminho de timeout para: ${next}`);
            }
          }

        } catch (error) {
          logger.error(`[N8N WAIT NODE] Erro geral: ${error.message}`);
        }
      }

      if (nodeSelected.type === "n8nQuery") {
        try {
          const { webhookUrl, authToken, queryName, queryPayload, saveResponseVar, sendMessageOnResponse, responseTemplate } = nodeSelected.data;

          if (!webhookUrl) {
            logger.warn(`[N8N QUERY NODE] URL vazia no nó ${nodeSelected.id} - pulando`);
            continue;
          }

          if (!(await ensureTicket())) continue;

          let payload: any = {
            flowNodeId: nodeSelected.id,
            queryName: queryName || "",
            ticketId: ticket?.id,
            timestamp: new Date().toISOString(),
          };

          // Adicionar dados do contato para a consulta
          if (ticket) {
            const contact = await Contact.findByPk(ticket.contactId);
            if (contact) {
              payload.contact = {
                id: contact.id,
                name: contact.name,
                number: contact.number,
                email: contact.email,
              };
            }
          }

          // Processar payload customizado
          if (queryPayload) {
            try {
              let parsedPayload = queryPayload;
              if (typeof parsedPayload === 'string') {
                parsedPayload = parsedPayload.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
                  return global.flowVariables?.[varName] || "";
                });
                payload = { ...payload, ...JSON.parse(parsedPayload) };
              }
            } catch (err) {
              logger.warn(`[N8N QUERY NODE] Erro ao parsear queryPayload: ${err.message}`);
            }
          }

          const headers: any = { "Content-Type": "application/json" };
          if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

          logger.info(`[N8N QUERY NODE] Consultando ${webhookUrl} - Query: ${queryName}`);

          const startTime = Date.now();
          try {
            const response = await axios.post(webhookUrl, payload, {
              headers,
              timeout: 30000,
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            });

            let responseData = response.data;

            // n8n normalmente responde como array [{...}] (1 item por execução).
            // Desempacota para que os campos do CNPJ fiquem acessíveis.
            if (Array.isArray(responseData) && responseData.length === 1) {
              responseData = responseData[0];
            }
            // Alguns nós do n8n encapsulam em { json: {...} }
            if (responseData && typeof responseData === "object" && responseData.json && typeof responseData.json === "object") {
              responseData = responseData.json;
            }

            // Salvar resultado na variável
            if (saveResponseVar) {
              global.flowVariables = global.flowVariables || {};
              const storedValue = typeof responseData === "object"
                ? JSON.stringify(responseData)
                : responseData;
              global.flowVariables[saveResponseVar] = storedValue;
              if (ticket?.id) {
                global.flowVariables[`${ticket.id}_${saveResponseVar}`] = storedValue;
              }

              // Achatar campos de 1º e 2º nível em variáveis individuais.
              // Ex.: cnpj_data.razao_social -> ${cnpj_data.razao_social} e ${cnpj_data_razao_social}
              if (responseData && typeof responseData === "object" && !Array.isArray(responseData)) {
                const flatten = (obj: any, prefix: string) => {
                  Object.keys(obj).forEach(key => {
                    const val = obj[key];
                    const dotKey = `${prefix}.${key}`;
                    const underscoreKey = `${prefix}_${key}`;
                    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
                      flatten(val, dotKey);
                    } else {
                      const flatVal = typeof val === "object" ? JSON.stringify(val) : val;
                      global.flowVariables[dotKey] = flatVal;
                      global.flowVariables[underscoreKey] = flatVal;
                      if (ticket?.id) {
                        global.flowVariables[`${ticket.id}_${dotKey}`] = flatVal;
                        global.flowVariables[`${ticket.id}_${underscoreKey}`] = flatVal;
                      }
                    }
                  });
                };
                flatten(responseData, saveResponseVar);
              }
              logger.info(`[N8N QUERY NODE] Resultado salvo em variável: ${saveResponseVar}`);
            }

            // Enviar mensagem com resultado se configurado
            if (sendMessageOnResponse && ticket) {
              let messageBody = responseTemplate || JSON.stringify(responseData);
              // Suporta tanto {{campo}} quanto {{campo.sub}} e ${campo.sub}
              messageBody = messageBody.replace(/\{\{([\w.]+)\}\}/g, (_, varName) => {
                const v = resolveFlowVariable(varName, ticket?.id);
                if (v === null || v === undefined) return "";
                return typeof v === "object" ? JSON.stringify(v) : String(v);
              });
              messageBody = processVariableValue(messageBody, null, ticket?.id);

              const queryMsg = {
                body: messageBody,
                number: numberClient,
                companyId: companyId,
              };
              await SendMessageFlow(ticket.whatsapp, queryMsg);
            }


            logger.info(`[N8N QUERY NODE] Consulta concluída - Status: ${response.status}`);
            logN8NExecution({ companyId, nodeType: "n8nQuery", webhookUrl, ticketId: ticket?.id, contactId: ticket?.contactId, requestPayload: payload, responseData, status: "success", duration: Date.now() - startTime });
          } catch (err) {
            logger.error(`[N8N QUERY NODE] Erro na consulta: ${err.message}`);
            logN8NExecution({ companyId, nodeType: "n8nQuery", webhookUrl, ticketId: ticket?.id, contactId: ticket?.contactId, requestPayload: payload, errorMessage: err.message, status: "error", duration: Date.now() - startTime });
            global.flowVariables = global.flowVariables || {};
            global.flowVariables["n8n_query_error"] = err.message;
            if (saveResponseVar) {
              global.flowVariables[saveResponseVar] = null;
            }

            // Seguir pelo handle de erro se existir
            const errorConnection = connects.filter(
              conn => conn.source === nodeSelected.id && conn.sourceHandle === "error"
            );
            if (errorConnection.length > 0) {
              next = errorConnection[0].target;
              noAlterNext = true;
              logger.info(`[N8N QUERY NODE] Seguindo caminho de erro para: ${next}`);
            }
          }

        } catch (error) {
          logger.error(`[N8N QUERY NODE] Erro geral: ${error.message}`);
        }
      }

      if (nodeSelected.type === "n8nSendMessage") {
        try {
          const { webhookUrl, authToken, responseField, timeoutSeconds, saveResponseVar, fallbackMessage } = nodeSelected.data;

          if (!webhookUrl) {
            logger.warn(`[N8N SEND MSG NODE] URL vazia no nó ${nodeSelected.id} - pulando`);
            continue;
          }

          if (!(await ensureTicket())) continue;

          const payload: any = {
            flowNodeId: nodeSelected.id,
            ticketId: ticket?.id,
            companyId: companyId,
            timestamp: new Date().toISOString(),
          };

          if (ticket) {
            payload.ticket = {
              id: ticket.id,
              status: ticket.status,
              queueId: ticket.queueId,
              userId: ticket.userId,
              lastMessage: ticket.lastMessage || "",
            };
            const contact = await Contact.findByPk(ticket.contactId);
            if (contact) {
              payload.contact = {
                id: contact.id,
                name: contact.name,
                number: contact.number,
                email: contact.email,
              };
            }
          }

          if (global.flowVariables && Object.keys(global.flowVariables).length > 0) {
            payload.variables = { ...global.flowVariables };
          }

          const headers: any = { "Content-Type": "application/json" };
          if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

          logger.info(`[N8N SEND MSG NODE] Enviando para ${webhookUrl} e aguardando texto`);

          const startTime = Date.now();
          try {
            const response = await axios.post(webhookUrl, payload, {
              headers,
              timeout: (timeoutSeconds || 30) * 1000,
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            });

            const field = responseField || "message";
            let messageText = "";

            if (response.data) {
              const parts = field.split(".");
              let value = response.data;
              for (const part of parts) {
                if (value && typeof value === "object" && part in value) {
                  value = value[part];
                } else {
                  value = undefined;
                  break;
                }
              }

              if (value !== undefined && value !== null) {
                messageText = String(value);
              } else if (typeof response.data === "string") {
                messageText = response.data;
              } else {
                messageText = JSON.stringify(response.data);
              }
            }

            if (saveResponseVar && messageText) {
              global.flowVariables = global.flowVariables || {};
              global.flowVariables[saveResponseVar] = messageText;
            }

            if (messageText && ticket) {
              const n8nMsg = {
                body: messageText,
                number: numberClient,
                companyId: companyId,
              };
              await SendMessageFlow(ticket.whatsapp, n8nMsg);
              logger.info(`[N8N SEND MSG NODE] Mensagem enviada: ${messageText.substring(0, 100)}...`);
            }

            logN8NExecution({ companyId, nodeType: "n8nSendMessage", webhookUrl, ticketId: ticket?.id, contactId: ticket?.contactId, requestPayload: payload, responseData: response.data, status: "success", duration: Date.now() - startTime });

          } catch (err) {
            logger.error(`[N8N SEND MSG NODE] Erro: ${err.message}`);
            logN8NExecution({ companyId, nodeType: "n8nSendMessage", webhookUrl, ticketId: ticket?.id, contactId: ticket?.contactId, requestPayload: payload, errorMessage: err.message, status: "error", duration: Date.now() - startTime });

            if (fallbackMessage && ticket) {
              const fallbackMsg = {
                body: fallbackMessage,
                number: numberClient,
                companyId: companyId,
              };
              await SendMessageFlow(ticket.whatsapp, fallbackMsg);
              logger.info(`[N8N SEND MSG NODE] Fallback enviado`);
            }

            global.flowVariables = global.flowVariables || {};
            global.flowVariables["n8n_sendmsg_error"] = err.message;

            const errorConnection = connects.filter(
              conn => conn.source === nodeSelected.id && conn.sourceHandle === "error"
            );
            if (errorConnection.length > 0) {
              next = errorConnection[0].target;
              noAlterNext = true;
            }
          }

        } catch (error) {
          logger.error(`[N8N SEND MSG NODE] Erro geral: ${error.message}`);
        }
      }

      if (nodeSelected.type === "ticket") {
        logger.debug(`[TICKET NODE] ========== PROCESSANDO NÓ FILA ==========`);
        logger.debug(`[TICKET NODE] Nó ID: ${nodeSelected.id}, Ticket ID: ${ticket?.id || idTicket}`);
        if (!(await ensureTicket())) continue;

        const queueId = nodeSelected?.data?.queue?.id;
        const targetUserId = nodeSelected?.data?.user?.id || null;

        // ✅ Se o usuário ligou o nó "Setor" a algum próximo nó no editor
        // visual (ex.: continuar fazendo perguntas depois de definir o
        // departamento), o fluxo deve CONTINUAR em vez de encerrar aqui.
        // Antes, esse nó sempre dava `break` incondicional — mesmo com uma
        // conexão desenhada — deixando o ticket "pending" sem nunca chegar
        // nos próximos nós (relatado pelo usuário: "quando coloco o setor
        // dentro do fluxo... não faz as perguntas").
        const ticketNodeHasNext = connects.some(conn => conn.source === nodeSelected.id);

        // ✅ CORRIGIDO: Permitir transferência mesmo sem fila (apenas com usuário ou para pending sem fila)
        if (!queueId && !targetUserId) {
          logger.warn(`[TICKET NODE] Nó ${nodeSelected.id} sem fila e sem usuário configurado. Transferindo ticket para pending sem fila.`);

          // Transferir para pending sem fila. Só ENCERRA o fluxo (limpando
          // isBot/flowWebhook) se o nó não tiver uma conexão de saída — se
          // o usuário ligou o "Setor" a outro nó no editor visual, mantemos
          // o fluxo vivo pra continuar (ex.: perguntas depois).
          await ticket.update({
            status: 'pending',
            queueId: null,
            userId: null,
            companyId: companyId,
            flowWebhook: ticketNodeHasNext ? true : false,
            lastFlowId: ticketNodeHasNext ? nodeSelected.id : null,
            hashFlowId: ticketNodeHasNext ? hashWebhookId : null,
            flowStopped: null,
            dataWebhook: null,
            isBot: ticketNodeHasNext ? ticket.isBot : false,
            useIntegration: false
          });

          await UpdateTicketService({
            ticketData: {
              status: "pending",
              queueId: null,
              userId: null,
              isBot: ticketNodeHasNext ? ticket.isBot : false,
              useIntegration: false
            },
            ticketId: ticket.id,
            companyId
          });

          await CreateLogTicketService({
            ticketId: ticket.id,
            type: "queue"
          });

          if (!ticketNodeHasNext) {
            logger.debug(`[TICKET NODE] ✅ Ticket ${ticket.id} transferido para pending sem fila - fluxo encerrado`);
            break;
          }
          logger.debug(`[TICKET NODE] ✅ Ticket ${ticket.id} transferido para pending sem fila - nó conectado, continuando fluxo`);
        } else if (!queueId && targetUserId) {
          // Transferência direta para um usuário sem fila — ENCERRAR fluxo
          logger.debug(`[TICKET NODE] Nó ${nodeSelected.id} sem fila mas com usuário ${targetUserId}. Transferindo diretamente para o usuário.`);

          await ticket.update({
            status: "open",
            queueId: null,
            userId: targetUserId,
            companyId: companyId,
            flowWebhook: ticketNodeHasNext ? true : false,
            lastFlowId: ticketNodeHasNext ? nodeSelected.id : null,
            hashFlowId: ticketNodeHasNext ? hashWebhookId : null,
            flowStopped: null,
            dataWebhook: null,
            isBot: ticketNodeHasNext ? ticket.isBot : false,
            useIntegration: false
          });

          await UpdateTicketService({
            ticketData: {
              status: "open",
              queueId: null,
              userId: targetUserId,
              isBot: ticketNodeHasNext ? ticket.isBot : false,
              useIntegration: false
            },
            ticketId: ticket.id,
            companyId
          });

          try {
            const targetUser = await require("../../models/User").default.findByPk(targetUserId);
            const greetingTicket = await getTicketWithWhatsapp(ticket.id, undefined, companyId);
            if (targetUser?.acceptanceMessage?.trim() && greetingTicket?.whatsapp) {
              const body = formatBody(`\u200e${targetUser.acceptanceMessage}`, greetingTicket);
              await sendTextByChannel(detectChannel(greetingTicket.whatsapp), body, greetingTicket, greetingTicket.whatsapp);
              logger.debug(`[TICKET NODE] Saudação personalizada do atendente ${targetUserId} enviada para ticket ${ticket.id}`);
            }
          } catch (greetingErr: any) {
            logger.warn(`[TICKET NODE] Falha ao enviar saudação do atendente ${targetUserId}: ${greetingErr?.message}`);
          }

          await CreateLogTicketService({
            ticketId: ticket.id,
            type: "open",
            userId: targetUserId
          });

          if (!ticketNodeHasNext) {
            logger.debug(`[TICKET NODE] ✅ Ticket ${ticket.id} transferido para usuário ${targetUserId} - Status: open - fluxo encerrado`);
            break;
          }
          logger.debug(`[TICKET NODE] ✅ Ticket ${ticket.id} transferido para usuário ${targetUserId} - Status: open - nó conectado, continuando fluxo`);
        } else {
          // Fluxo original com fila
          logger.debug(`[TICKET NODE] Ticket=${ticket?.id}, QueueId=${queueId}, CompanyId=${companyId}, FlowId=${idFlowDb}, Hash=${hashWebhookId}`);

          const queue = await ShowQueueService(queueId, companyId);

          logger.debug(`[TICKET UPDATE] Atualizando ticket ${ticket.id} para fila ${queue.id} (${queue.name}) - Status: pending, FlowWebhook: true`);

          // Se a fila possui integração configurada, ativa no ticket para acionar nas próximas mensagens
          const queueIntegrationId = (queue as any)?.integrationId || null;
          const queuePromptId = (queue as any)?.promptId || null;

          await ticket.update({
            status: 'pending',
            queueId: queue.id,
            userId: ticket.userId,
            companyId: companyId,
            flowWebhook: true,
            lastFlowId: nodeSelected.id,
            hashFlowId: hashWebhookId,
            flowStopped: idFlowDb.toString(),
            useIntegration: !!queueIntegrationId,
            integrationId: queueIntegrationId,
            promptId: queuePromptId,
            isBot: !!queueIntegrationId ? true : ticket.isBot
          });

          // ── POSIÇÃO NA FILA ─────────────────────────────────────────────
          //
          // A configuração "Enviar posição na fila" era respeitada por TODOS
          // os caminhos que definem uma fila — Baileys (wbotMessageListener),
          // WhatsApp Plus (WacallsBotEngine), API Oficial (VerifyQueue) e
          // Z-API — MENOS por este nó de fila do FlowBuilder. Quem escolhia o
          // setor por um menu do fluxo simplesmente não recebia a mensagem,
          // mesmo com a opção ligada nas configurações da empresa.
          //
          // Mesmo critério e mesmo texto dos outros canais: conta os
          // atendimentos PENDENTES e SEM ATENDENTE dessa fila (fora grupos) e
          // manda "<mensagem configurada> *N*". Quando a fila tem submenu de
          // chatbot não faz sentido — o próximo passo é escolher uma opção,
          // não esperar na fila.
          try {
            const configuracoesDaEmpresa = await CompaniesSettings.findOne({
              where: { companyId }
            });
            const temSubmenu =
              Array.isArray((queue as any).chatbots) && (queue as any).chatbots.length > 0;

            if ((configuracoesDaEmpresa as any)?.sendQueuePosition === "enabled" && !temSubmenu) {
              const contagem = await Ticket.count({
                where: {
                  userId: null,
                  status: "pending",
                  companyId,
                  queueId: queue.id,
                  isGroup: false
                }
              });
              const posicao = contagem === 0 ? 1 : contagem;
              const textoConfigurado =
                (configuracoesDaEmpresa as any)?.sendQueuePositionMessage || "Sua posição na fila:";
              const ticketParaVariaveis = await ShowTicketService(ticket.id, companyId);
              const corpoDaPosicao = formatBody(`${textoConfigurado} *${posicao}*`, ticketParaVariaveis);

              if (whatsapp?.channel === "whatsapp_oficial") {
                await SendWhatsAppOficialMessage({
                  body: corpoDaPosicao, ticket, quotedMsg: null,
                  type: "text", media: null, vCard: null
                });
              } else if (whatsapp?.channel === "whatsapp") {
                await SendWhatsAppMessage({ body: corpoDaPosicao, ticket, quotedMsg: null });
              } else {
                await SendMessage(whatsapp, { number: numberClient, body: corpoDaPosicao });
              }
              logger.debug(`[TICKET NODE] Posição na fila enviada para o ticket ${ticket.id}: ${posicao}`);
            }
          } catch (erroPosicao: any) {
            // Nunca derruba o fluxo: a fila já foi definida, que é o essencial.
            logger.warn(
              `[TICKET NODE] Falha ao enviar a posição na fila do ticket ${ticket.id}: ${erroPosicao?.message}`
            );
          }

          if (queueIntegrationId) {
            logger.debug(`[TICKET NODE] Fila ${queue.id} possui integração ${queueIntegrationId} - useIntegration ativado no ticket ${ticket.id}`);
            try {
              const integration = await ShowQueueIntegrationService(Number(queueIntegrationId), companyId);
              if (integration && (integration.type === "n8n" || integration.type === "webhook") && integration.urlN8N) {
                // Carrega contato se necessário
                let contactObj: any = (ticket as any).contact || null;
                if (!contactObj && ticket.contactId) {
                  try { contactObj = await Contact.findByPk(ticket.contactId); } catch {}
                }

                // Busca última mensagem do contato pra enriquecer o payload
                let lastMessage: any = null;
                try {
                  lastMessage = await Message.findOne({
                    where: { ticketId: ticket.id, fromMe: false },
                    order: [["createdAt", "DESC"]]
                  });
                } catch (e: any) {
                  logger.warn(`[TICKET NODE] Falha ao buscar última mensagem p/ n8n: ${e?.message}`);
                }

                const messageText = lastMessage?.body || "";
                const messageType = lastMessage?.mediaType || "text";

                const payloadN8N = {
                  triggeredFrom: "flowbuilder-queue",
                  ticketId: ticket.id,
                  companyId,
                  queueId: queue.id,
                  whatsappId: ticket.whatsappId,
                  contactNumber: contactObj?.number || null,
                  contactName: contactObj?.name || null,
                  fromMe: false,
                  messageText,
                  messageType,
                  contact: contactObj ? {
                    id: contactObj.id,
                    name: contactObj.name,
                    number: contactObj.number,
                    email: contactObj.email
                  } : null,
                  message: lastMessage ? {
                    id: lastMessage.id,
                    body: lastMessage.body,
                    mediaType: lastMessage.mediaType,
                    mediaUrl: lastMessage.mediaUrl,
                    createdAt: lastMessage.createdAt
                  } : null,
                  integration: {
                    id: integration.id,
                    name: integration.name,
                    type: integration.type,
                    webhookUrl: integration.urlN8N
                  },
                  _integrationConfig: {
                    enableTransfer: (integration as any).enableTransfer,
                    transferQueueId: (integration as any).transferQueueId,
                    transferUserId: (integration as any).transferUserId,
                    queueIdAssign: (integration as any).queueIdAssign,
                    whatsappId: (integration as any).whatsappId ?? ticket.whatsappId ?? null,
                    userIdAssign: (integration as any).userIdAssign,
                    enableCloseTicket: (integration as any).enableCloseTicket,
                    closeTicketMessage: (integration as any).closeTicketMessage,
                    enableOpenTicket: (integration as any).enableOpenTicket,
                    openTicketQueueId: (integration as any).openTicketQueueId,
                    openTicketUserId: (integration as any).openTicketUserId,
                    openTicketMessage: (integration as any).openTicketMessage,
                    ticketId: ticket.id,
                    companyId: ticket.companyId,
                  }
                };

                logger.debug(`[TICKET NODE] [N8N] payload ticket=${ticket.id} number=${payloadN8N.contactNumber} type=${messageType} textLen=${(messageText || "").length}`);

                const n8nResp = await axios.post(integration.urlN8N, payloadN8N, {
                  headers: { "Content-Type": "application/json" },
                  timeout: 30000,
                  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                  validateStatus: () => true
                });
                logger.debug(`[TICKET NODE] Integração ${integration.id} disparada via webhook -> status ${n8nResp.status}`);
                if (n8nResp.status >= 400) {
                  logger.error(`[TICKET NODE] [N8N] erro ${n8nResp.status}: ${JSON.stringify(n8nResp.data).slice(0, 500)}`);
                }
              }
            } catch (e: any) {
              logger.error(`[TICKET NODE] Falha ao disparar integração da fila: ${e?.message}`);
            }
          }

          logger.debug(`[TICKET UPDATE] Ticket ${ticket.id} atualizado para fila ${queue.name} - LastFlowId: ${nodeSelected.id}, HashFlowId: ${hashWebhookId}`);

          await FindOrCreateATicketTrakingService({
            ticketId: ticket.id,
            companyId,
            whatsappId: ticket.whatsappId,
            userId: ticket.userId
          });

          await UpdateTicketService({
            ticketData: {
              status: "pending",
              queueId: queue.id
            },
            ticketId: ticket.id,
            companyId
          });

          try {
            const greetingTicket = await getTicketWithWhatsapp(ticket.id, undefined, companyId);
            if (greetingTicket?.whatsapp) {
              await sendQueueGreeting(greetingTicket, greetingTicket.whatsapp, queue.id);
              logger.debug(`[TICKET NODE] Saudação da fila ${queue.id} enviada para ticket ${ticket.id}`);
            }
          } catch (greetingErr: any) {
            logger.warn(`[TICKET NODE] Falha ao enviar saudação da fila ${queue.id}: ${greetingErr?.message}`);
          }

          logger.debug(`[TICKET UPDATE] UpdateTicketService chamado para ticket ${ticket.id} - QueueId: ${queue.id}`);

          await CreateLogTicketService({
            ticketId: ticket.id,
            type: "queue",
            queueId: queue.id
          });

          logger.info(`[TICKET LOG] Log de fila criado para ticket ${ticket.id} - QueueId: ${queue.id}`);

          // Mensagem interna visível no atendimento mostrando a fila escolhida
          try {
            await CreateMessageService({
              messageData: {
                wid: randomString(50),
                ticketId: ticket.id,
                body: `🔀 *Cliente transferido para a fila:* ${queue.name}`,
                fromMe: true,
                read: true,
                ack: 2,
              },
              companyId
            });
          } catch (e) {
            logger.warn(`[TICKET NODE] Falha ao registrar msg de transferência: ${(e as any)?.message}`);
          }
        }

        let settings = await CompaniesSettings.findOne({
          where: {
            companyId: companyId
          }
        })

        // const { queues, greetingMessage, maxUseBotQueues, timeUseBotQueues } = await ShowWhatsAppService(whatsappId, companyId);

        // if (greetingMessage.length > 1) {
        //   const body = formatBody(`${greetingMessage}`, ticket);

        //   const ticketDetails = await ShowTicketService(ticket.id, companyId);

        //   logger.debug(`[TICKET UPDATE] Atualizando lastMessage do ticket ${ticket.id} com mensagem de saudação da fila`);

        //   await ticketDetails.update({
        //     lastMessage: formatBody(queue.greetingMessage, ticket.contact)
        //   });

        //   logger.debug(`[TICKET UPDATE] LastMessage atualizada para ticket ${ticket.id}`);

        //   if (whatsapp.channel === "whatsapp") {
        //     await SendWhatsAppMessage({
        //       body,
        //       ticket: ticketDetails,
        //       quotedMsg: null
        //     });
        //   }

        //   if (whatsapp.channel === "whatsapp_oficial") {
        //     await SendWhatsAppOficialMessage({
        //       body: body,
        //       ticket: ticketDetails,
        //       quotedMsg: null,
        //       type: 'text',
        //       media: null,
        //       vCard: null
        //     });
        //   }

        //   SetTicketMessagesAsRead(ticketDetails);
        // }

        // ✅ Limpar estado de fluxo após transferir para fila — exceto se a
        // fila tem integração N8N ativa (ela cuida da continuação sozinha)
        // OU se o usuário desenhou uma conexão de saída a partir do nó
        // "Setor" no editor visual (quer que o fluxo continue, ex.: fazer
        // mais perguntas depois de definir o departamento).
        try {
          const currentTicket = await Ticket.findByPk(ticket.id);
          const hasIntegration = !!currentTicket?.useIntegration;
          if (!hasIntegration && !ticketNodeHasNext) {
            await currentTicket.update({
              flowWebhook: false,
              lastFlowId: null,
              hashFlowId: null,
              flowStopped: null,
              dataWebhook: null,
              isBot: false
            });
            logger.debug(`[TICKET NODE] Estado de fluxo do ticket ${ticket.id} limpo após transferência para fila`);
          } else if (hasIntegration) {
            logger.debug(`[TICKET NODE] Ticket ${ticket.id} mantém integração ativa - estado de fluxo preservado`);
          } else {
            logger.debug(`[TICKET NODE] Ticket ${ticket.id} tem nó conectado após "Setor" - mantendo fluxo ativo para continuar`);
          }
        } catch (clearErr: any) {
          logger.warn(`[TICKET NODE] Falha ao limpar estado de fluxo: ${clearErr?.message}`);
        }

        if (!ticketNodeHasNext) {
          // Encerrar processamento do fluxo — ticket já está na fila aguardando atendimento
          break;
        }
        // Há conexão de saída desenhada a partir do nó "Setor" — não damos
        // break aqui. A execução cai pro trecho comum de "determinar
        // próximo nó" (mais abaixo no loop), que respeita essa conexão do
        // mesmo jeito que qualquer outro nó do fluxo.
      }

      if (nodeSelected.type === "singleBlock") {
        logger.debug(`[SINGLE BLOCK] ========== PROCESSANDO NÓ SINGLEBLOCK ==========`);
        logger.debug(`[SINGLE BLOCK] Node ID: ${nodeSelected.id}`);
        logger.debug(`[SINGLE BLOCK] Ticket ID: ${ticket?.id}`);

        if (!(await ensureTicket())) {
          logger.warn(`[SINGLE BLOCK] ❌ Ticket não disponível, pulando bloco`);
          continue;
        }

        const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
        logger.debug(`[SINGLE BLOCK] Public Folder: ${publicFolder}`);

        const sequence = nodeSelected.data.seq;
        logger.debug(`[SINGLE BLOCK] Sequência de elementos: ${JSON.stringify(sequence)}`);
        logger.debug(`[SINGLE BLOCK] Total de elementos: ${sequence?.length || 0}`);

        if (!sequence || sequence.length === 0) {
          logger.warn(`[SINGLE BLOCK] ⚠️ Nenhum elemento na sequência, pulando bloco`);
          continue;
        }

        for (var iLoc = 0; iLoc < sequence.length; iLoc++) {
          let elementNowSelected;
          try {
            elementNowSelected = sequence[iLoc];
            
            // ✅ CRÍTICO: Verificar status do ticket antes de processar cada elemento
            // Se o ticket foi aceito (status = "open"), parar imediatamente a execução
            // EXCEÇÃO: Se o fluxo foi disparado manualmente (isManualTrigger=true), permitir execução mesmo com status "open"
            const currentTicket = await Ticket.findByPk(ticket.id);
            if (currentTicket && currentTicket.status === "open" && !isManualTrigger) {
              logger.warn(`[SINGLE BLOCK] ⚠️ Ticket ${ticket.id} foi aceito (status=open) - PARANDO execução imediatamente`);
              logger.warn(`[SINGLE BLOCK] Elemento ${iLoc + 1}/${sequence.length} (${elementNowSelected || 'N/A'}) não será processado`);
              
              // Limpar estado do fluxo
              await currentTicket.update({
                flowWebhook: false,
                lastFlowId: null,
                hashFlowId: null,
                flowStopped: null,
                dataWebhook: null,
                isBot: false
              });
              
              // Sair do loop e continuar para o próximo nó (ou finalizar)
              break;
            }
            
            // ✅ Se o fluxo foi disparado manualmente e o ticket está "open", permitir execução
            if (currentTicket && currentTicket.status === "open" && isManualTrigger) {
              logger.debug(`[SINGLE BLOCK] ✅ Fluxo disparado manualmente - permitindo execução mesmo com ticket em status "open"`);
            }
            
            logger.debug(`[SINGLE BLOCK] ========== Processando elemento ${iLoc + 1}/${sequence.length}: ${elementNowSelected} ==========`);

            if (elementNowSelected.includes("message")) {
              logger.debug(`[SINGLE BLOCK - MESSAGE] Processando mensagem de texto`);

              try {
                const bodyFor = nodeSelected.data.elements.filter(
                  item => item.number === elementNowSelected
                )[0].value;

                logger.debug(`[SINGLE BLOCK - MESSAGE] Corpo da mensagem: ${bodyFor?.substring(0, 100)}...`);

                const ticketDetails = await ShowTicketService(ticket.id, companyId);
                logger.debug(`[SINGLE BLOCK - MESSAGE] Ticket Details obtido: ${ticketDetails.id}`);

                if (dataWebhook === "") {
                  msg = formatBody(bodyFor, ticketDetails);
                } else {
                  const dataLocal = {
                    nome: createFieldJsonName,
                    numero: numberClient,
                    email: createFieldJsonEmail
                  };
                  msg = formatBody(replaceMessages(bodyFor, details, dataWebhook, dataLocal, idTicket), ticketDetails);
                }

                logger.debug(`[SINGLE BLOCK - MESSAGE] Mensagem processada (${msg?.length || 0} caracteres)`);
                logger.debug(`[SINGLE BLOCK - MESSAGE] Canal: ${whatsapp.channel}`);

                if (whatsapp.channel === "whatsapp" || whatsapp.channel === "wacalls") {
                  logger.debug(`[SINGLE BLOCK - MESSAGE] Enviando via Baileys/WhatsApp Plus`);
                  await SendMessage(whatsapp, {
                    number: numberClient,
                    body: msg,
                    mediaPath: null
                  });
                  logger.debug(`[SINGLE BLOCK - MESSAGE] ✅ Enviado via Baileys`);
                }

                if (whatsapp.channel === "whatsapp_oficial") {
                  logger.debug(`[SINGLE BLOCK - MESSAGE] Enviando via API Oficial`);
                  await SendWhatsAppOficialMessage({
                    body: msg,
                    ticket: ticketDetails,
                    quotedMsg: null,
                    type: 'text',
                    media: null,
                    vCard: null
                  });
                  logger.debug(`[SINGLE BLOCK - MESSAGE] ✅ Enviado via API Oficial`);
                }

                SetTicketMessagesAsRead(ticketDetails);

                logger.debug(`[SINGLE BLOCK - MESSAGE] Atualizando lastMessage do ticket ${ticket.id}`);

                await ticketDetails.update({
                  lastMessage: formatBody(bodyFor, ticketDetails)
                });

                logger.debug(`[SINGLE BLOCK - MESSAGE] ✅ LastMessage atualizada`);

                await intervalWhats("1");
              } catch (error) {
                logger.error(`[SINGLE BLOCK - MESSAGE] ❌ Erro ao processar mensagem: ${error?.message || error}`);
                logger.error(`[SINGLE BLOCK - MESSAGE] Stack: ${error?.stack || 'N/A'}`);
                throw error; // Re-lançar para ser capturado pelo catch principal
              }
            }

            if (elementNowSelected.includes("interval")) {
              try {
                const intervalValue = nodeSelected.data.elements.filter(
                  item => item.number === elementNowSelected
                )[0].value;

                logger.info(`[SINGLE BLOCK - INTERVAL] Aguardando ${intervalValue} segundos`);
                
                // ✅ CRÍTICO: Durante o intervalo, verificar periodicamente se o ticket foi aceito
                const intervalSeconds = parseInt(intervalValue) || 0;
                const checkInterval = 1; // Verificar a cada 1 segundo
                let elapsed = 0;
                
                while (elapsed < intervalSeconds) {
                  await intervalWhats(checkInterval.toString());
                  elapsed += checkInterval;
                  
                  // Verificar status do ticket durante o intervalo
                  // EXCEÇÃO: Se o fluxo foi disparado manualmente (isManualTrigger=true), permitir execução mesmo com status "open"
                  const ticketDuringInterval = await Ticket.findByPk(ticket.id);
                  if (ticketDuringInterval && ticketDuringInterval.status === "open" && !isManualTrigger) {
                    logger.warn(`[SINGLE BLOCK - INTERVAL] ⚠️ Ticket ${ticket.id} foi aceito durante intervalo - PARANDO imediatamente`);
                    throw new Error("FLOW_STOPPED_TICKET_OPEN");
                  }
                }
                
                logger.info(`[SINGLE BLOCK - INTERVAL] ✅ Intervalo concluído`);
              } catch (error: any) {
                // Se o erro foi por ticket aberto, propagar para parar o fluxo
                if (error?.message === "FLOW_STOPPED_TICKET_OPEN") {
                  // Limpar estado do fluxo
                  const ticketToUpdate = await Ticket.findByPk(ticket.id);
                  if (ticketToUpdate) {
                    await ticketToUpdate.update({
                      flowWebhook: false,
                      lastFlowId: null,
                      hashFlowId: null,
                      flowStopped: null,
                      dataWebhook: null,
                      isBot: false
                    });
                  }
                  // Sair do loop
                  break;
                }
                logger.error(`[SINGLE BLOCK - INTERVAL] ❌ Erro no intervalo: ${error?.message || error}`);
                throw error;
              }
            }

            if (elementNowSelected.includes("img")) {
              logger.debug(`[FLOW MEDIA - IMG] ========== PROCESSANDO ENVIO DE IMAGEM ==========`);

              const currentElement = nodeSelected.data.elements.filter(item => item.number === elementNowSelected)[0];
              const filePath = path.join(publicFolder, `company${companyId}/flow`, currentElement.value);
              const captionRaw = currentElement.caption || "";
              const ticketInt = await ShowTicketService(ticket.id, companyId);
              const caption = captionRaw ? formatBody(captionRaw, ticketInt) : "";
              logger.debug(`[FLOW MEDIA - IMG] FilePath: ${filePath}`);
              logger.debug(`[FLOW MEDIA - IMG] Caption: ${caption}`);
              logger.debug(`[FLOW MEDIA - IMG] Company ID: ${companyId}`);
              logger.debug(`[FLOW MEDIA - IMG] WhatsApp Channel: ${whatsapp.channel}`);

              // ticketInt já carregado acima
              logger.debug(`[FLOW MEDIA - IMG] Ticket ID: ${ticketInt?.id}`);

              if (whatsapp.channel === "whatsapp") {
                logger.debug(`[FLOW MEDIA - IMG] Enviando via Baileys (WhatsApp Web)`);
                await SendWhatsAppMediaFlow({
                  media: filePath,
                  ticket: ticketInt,
                  whatsappId: whatsapp.id,
                  body: caption,
                  isRecord: currentElement.record
                });
                logger.debug(`[FLOW MEDIA - IMG] ✅ Imagem enviada com sucesso via Baileys`);
              }

              if (whatsapp.channel === "wacalls") {
                logger.debug(`[FLOW MEDIA - IMG] Enviando via WhatsApp Plus (wacalls)`);
                await sendWacallsFlowMedia(ticketInt, filePath, caption);
                logger.debug(`[FLOW MEDIA - IMG] ✅ Imagem enviada com sucesso via WhatsApp Plus`);
              }

              if (whatsapp.channel === "whatsapp_oficial") {
                logger.debug(`[FLOW MEDIA - IMG] Enviando via API Oficial`);

                const fileName = obterNomeEExtensaoDoArquivo(filePath);
                logger.debug(`[FLOW MEDIA - IMG] FileName: ${fileName}`);

                // Determinar mimetype pela extensão
                const lower = (fileName || "").toLowerCase();
                let mime = "image/jpeg";
                if (lower.endsWith(".png")) mime = "image/png";
                else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mime = "image/jpeg";
                else if (lower.endsWith(".gif")) mime = "image/gif";
                else if (lower.endsWith(".webp")) mime = "image/webp";

                logger.debug(`[FLOW MEDIA - IMG] MimeType detectado: ${mime}`);

                // Verificar se arquivo existe antes de enviar
                try {
                  const fs = await import("fs");
                  if (!fs.existsSync(filePath)) {
                    logger.error(`[FLOW MEDIA - IMG] ❌ Arquivo de imagem não encontrado: ${filePath}`);
                  } else {
                    logger.debug(`[FLOW MEDIA - IMG] ✅ Arquivo existe, preparando envio...`);

                    const mediaSrc = {
                      fieldname: 'medias',
                      originalname: fileName,
                      encoding: '7bit',
                      mimetype: mime,
                      filename: fileName,
                      path: filePath
                    } as Express.Multer.File

                    logger.debug(`[FLOW MEDIA - IMG] MediaSrc: ${JSON.stringify(mediaSrc)}`);

                    await SendWhatsAppOficialMessage({
                      body: caption,
                      ticket: ticketInt,
                      quotedMsg: null,
                      type: 'image',
                      media: mediaSrc,
                      vCard: null
                    });

                    logger.debug(`[FLOW MEDIA - IMG] ✅ Imagem enviada com sucesso via API Oficial`);
                  }
                } catch (e) {
                  logger.error(`[FLOW MEDIA - IMG] ❌ Erro ao validar/enviar imagem ${filePath}: ${e?.message || e}`);
                  logger.error(`[FLOW MEDIA - IMG] Stack: ${e?.stack || 'N/A'}`);
                }
              }

              await intervalWhats("1");
            }

            if (elementNowSelected.includes("audio")) {
              logger.debug(`[FLOW MEDIA - AUDIO] ========== PROCESSANDO ENVIO DE ÁUDIO ==========`);

              const currentElement = nodeSelected.data.elements.filter(item => item.number === elementNowSelected)[0];
              const filePath = path.join(publicFolder, `company${companyId}/flow`, currentElement.value);
              const captionRaw = currentElement.caption || "";
              const ticketInt = await ShowTicketService(ticket.id, companyId);
              const caption = captionRaw ? formatBody(captionRaw, ticketInt) : "";
              logger.debug(`[FLOW MEDIA - AUDIO] FilePath: ${filePath}`);
              logger.debug(`[FLOW MEDIA - AUDIO] Caption: ${caption}`);
              logger.debug(`[FLOW MEDIA - AUDIO] Company ID: ${companyId}`);
              logger.debug(`[FLOW MEDIA - AUDIO] WhatsApp Channel: ${whatsapp.channel}`);

              // ticketInt já carregado acima
              logger.debug(`[FLOW MEDIA - AUDIO] Ticket ID: ${ticketInt?.id}`);

              if (whatsapp.channel === "whatsapp") {
                logger.debug(`[FLOW MEDIA - AUDIO] Enviando via Baileys (WhatsApp Web)`);
                await SendWhatsAppMediaFlow({
                  media: filePath,
                  ticket: ticketInt,
                  whatsappId: whatsapp.id,
                  body: caption,
                  isRecord: currentElement.record
                });
                logger.debug(`[FLOW MEDIA - AUDIO] ✅ Áudio enviado com sucesso via Baileys`);
              }

              if (whatsapp.channel === "wacalls") {
                logger.debug(`[FLOW MEDIA - AUDIO] Enviando via WhatsApp Plus (wacalls)`);
                await sendWacallsFlowMedia(ticketInt, filePath, caption);
                logger.debug(`[FLOW MEDIA - AUDIO] ✅ Áudio enviado com sucesso via WhatsApp Plus`);
              }

              if (whatsapp.channel === "whatsapp_oficial") {
                logger.debug(`[FLOW MEDIA - AUDIO] Enviando via API Oficial`);

                const fileName = obterNomeEExtensaoDoArquivo(filePath);
                logger.debug(`[FLOW MEDIA - AUDIO] FileName: ${fileName}`);

                try {
                  const fs = await import("fs");
                  if (!fs.existsSync(filePath)) {
                    logger.error(`[FLOW MEDIA - AUDIO] ❌ Arquivo de áudio não encontrado: ${filePath}`);
                  } else {
                    logger.debug(`[FLOW MEDIA - AUDIO] ✅ Arquivo existe, preparando envio...`);

                    const mediaSrc = {
                      fieldname: 'medias',
                      originalname: fileName,
                      encoding: '7bit',
                      mimetype: 'audio/mpeg',
                      filename: fileName,
                      path: filePath
                    } as Express.Multer.File

                    logger.debug(`[FLOW MEDIA - AUDIO] MediaSrc: ${JSON.stringify(mediaSrc)}`);

                    await SendWhatsAppOficialMessage({
                      body: caption,
                      ticket: ticketInt,
                      quotedMsg: null,
                      vCard: null,
                      type: 'audio',
                      media: mediaSrc
                    });

                    logger.debug(`[FLOW MEDIA - AUDIO] ✅ Áudio enviado com sucesso via API Oficial`);
                  }
                } catch (e) {
                  logger.error(`[FLOW MEDIA - AUDIO] ❌ Erro ao validar/enviar áudio ${filePath}: ${e?.message || e}`);
                  logger.error(`[FLOW MEDIA - AUDIO] Stack: ${e?.stack || 'N/A'}`);
                }
              }

              await intervalWhats("1");
            }

            if (elementNowSelected.includes("video")) {
              logger.debug(`[FLOW MEDIA - VIDEO] ========== PROCESSANDO ENVIO DE VÍDEO ==========`);

              const currentElement = nodeSelected.data.elements.filter(item => item.number === elementNowSelected)[0];
              const filePath = path.join(publicFolder, `company${companyId}/flow`, currentElement.value);
              const captionRaw = currentElement.caption || "";
              const ticketInt = await ShowTicketService(ticket.id, companyId);
              const caption = captionRaw ? formatBody(captionRaw, ticketInt) : "";
              logger.debug(`[FLOW MEDIA - VIDEO] FilePath: ${filePath}`);
              logger.debug(`[FLOW MEDIA - VIDEO] Caption: ${caption}`);
              logger.debug(`[FLOW MEDIA - VIDEO] Company ID: ${companyId}`);
              logger.debug(`[FLOW MEDIA - VIDEO] WhatsApp Channel: ${whatsapp.channel}`);

              // ticketInt já carregado acima
              logger.debug(`[FLOW MEDIA - VIDEO] Ticket ID: ${ticketInt?.id}`);

              if (whatsapp.channel === "whatsapp") {
                logger.debug(`[FLOW MEDIA - VIDEO] Enviando via Baileys (WhatsApp Web)`);
                await SendWhatsAppMediaFlow({
                  media: filePath,
                  ticket: ticketInt,
                  whatsappId: whatsapp.id,
                  body: caption,
                });
                logger.debug(`[FLOW MEDIA - VIDEO] ✅ Vídeo enviado com sucesso via Baileys`);
              }

              if (whatsapp.channel === "wacalls") {
                logger.debug(`[FLOW MEDIA - VIDEO] Enviando via WhatsApp Plus (wacalls)`);
                await sendWacallsFlowMedia(ticketInt, filePath, caption);
                logger.debug(`[FLOW MEDIA - VIDEO] ✅ Vídeo enviado com sucesso via WhatsApp Plus`);
              }

              if (whatsapp.channel === "whatsapp_oficial") {
                logger.debug(`[FLOW MEDIA - VIDEO] Enviando via API Oficial`);

                const fileName = obterNomeEExtensaoDoArquivo(filePath);
                logger.debug(`[FLOW MEDIA - VIDEO] FileName: ${fileName}`);

                try {
                  const fs = await import("fs");
                  if (!fs.existsSync(filePath)) {
                    logger.error(`[FLOW MEDIA - VIDEO] ❌ Arquivo de vídeo não encontrado: ${filePath}`);
                  } else {
                    logger.debug(`[FLOW MEDIA - VIDEO] ✅ Arquivo existe, preparando envio...`);

                    const mediaSrc = {
                      fieldname: 'medias',
                      originalname: fileName,
                      encoding: '7bit',
                      mimetype: 'video/mp4',
                      filename: fileName,
                      path: filePath
                    } as Express.Multer.File

                    logger.debug(`[FLOW MEDIA - VIDEO] MediaSrc: ${JSON.stringify(mediaSrc)}`);

                    await SendWhatsAppOficialMessage({
                      body: caption,
                      ticket: ticketInt,
                      quotedMsg: null,
                      vCard: null,
                      type: 'video',
                      media: mediaSrc
                    });

                    logger.debug(`[FLOW MEDIA - VIDEO] ✅ Vídeo enviado com sucesso via API Oficial`);
                  }
                } catch (e) {
                  logger.error(`[FLOW MEDIA - VIDEO] ❌ Erro ao validar/enviar vídeo ${filePath}: ${e?.message || e}`);
                  logger.error(`[FLOW MEDIA - VIDEO] Stack: ${e?.stack || 'N/A'}`);
                }
              }

              await intervalWhats("1");
            }

            if (elementNowSelected.includes("document")) {
              logger.debug(`[FLOW MEDIA - DOCUMENT] ========== PROCESSANDO ENVIO DE DOCUMENTO ==========`);

              const filePath = path.join(publicFolder, `company${companyId}/flow`, nodeSelected.data.elements.filter(item => item.number === elementNowSelected)[0].value);
              logger.debug(`[FLOW MEDIA - DOCUMENT] FilePath: ${filePath}`);
              logger.debug(`[FLOW MEDIA - DOCUMENT] Company ID: ${companyId}`);
              logger.debug(`[FLOW MEDIA - DOCUMENT] WhatsApp Channel: ${whatsapp.channel}`);

              const ticketInt = await ShowTicketService(ticket.id, companyId);
              logger.debug(`[FLOW MEDIA - DOCUMENT] Ticket ID: ${ticketInt?.id}`);

              if (whatsapp.channel === "whatsapp") {
                logger.debug(`[FLOW MEDIA - DOCUMENT] Enviando via Baileys (WhatsApp Web)`);
                await SendWhatsAppMediaFlow({
                  media: filePath,
                  ticket: ticketInt,
                  whatsappId: whatsapp.id,
                });
                logger.debug(`[FLOW MEDIA - DOCUMENT] ✅ Documento enviado com sucesso via Baileys`);
              }

              if (whatsapp.channel === "wacalls") {
                logger.debug(`[FLOW MEDIA - DOCUMENT] Enviando via WhatsApp Plus (wacalls)`);
                await sendWacallsFlowMedia(ticketInt, filePath);
                logger.debug(`[FLOW MEDIA - DOCUMENT] ✅ Documento enviado com sucesso via WhatsApp Plus`);
              }

              if (whatsapp.channel === "whatsapp_oficial") {
                logger.debug(`[FLOW MEDIA - DOCUMENT] Enviando via API Oficial`);

                const fileName = obterNomeEExtensaoDoArquivo(filePath);
                logger.debug(`[FLOW MEDIA - DOCUMENT] FileName: ${fileName}`);

                try {
                  const fs = await import("fs");
                  if (!fs.existsSync(filePath)) {
                    logger.error(`[FLOW MEDIA - DOCUMENT] ❌ Arquivo de documento não encontrado: ${filePath}`);
                  } else {
                    logger.debug(`[FLOW MEDIA - DOCUMENT] ✅ Arquivo existe, preparando envio...`);

                    const mediaSrc = {
                      fieldname: 'medias',
                      originalname: fileName,
                      encoding: '7bit',
                      mimetype: 'application/pdf',
                      filename: fileName,
                      path: filePath
                    } as Express.Multer.File

                    logger.debug(`[FLOW MEDIA - DOCUMENT] MediaSrc: ${JSON.stringify(mediaSrc)}`);

                    await SendWhatsAppOficialMessage({
                      body: "",
                      ticket: ticketInt,
                      quotedMsg: null,
                      vCard: null,
                      type: 'document',
                      media: mediaSrc
                    });

                    logger.debug(`[FLOW MEDIA - DOCUMENT] ✅ Documento enviado com sucesso via API Oficial`);
                  }
                } catch (e) {
                  logger.error(`[FLOW MEDIA - DOCUMENT] ❌ Erro ao validar/enviar documento ${filePath}: ${e?.message || e}`);
                  logger.error(`[FLOW MEDIA - DOCUMENT] Stack: ${e?.stack || 'N/A'}`);
                }
              }

              await intervalWhats("1");
            }

            if (elementNowSelected.includes("application")) {
              logger.debug(`[FLOW MEDIA - APPLICATION] ========== PROCESSANDO ENVIO DE APLICAÇÃO/PDF ==========`);

              const filePath = path.join(publicFolder, `company${companyId}/flow`, nodeSelected.data.elements.filter(item => item.number === elementNowSelected)[0].value);
              logger.debug(`[FLOW MEDIA - APPLICATION] FilePath: ${filePath}`);
              logger.debug(`[FLOW MEDIA - APPLICATION] Company ID: ${companyId}`);
              logger.debug(`[FLOW MEDIA - APPLICATION] WhatsApp Channel: ${whatsapp.channel}`);

              const ticketInt = await ShowTicketService(ticket.id, companyId);
              logger.debug(`[FLOW MEDIA - APPLICATION] Ticket ID: ${ticketInt?.id}`);

              if (whatsapp.channel === "whatsapp") {
                logger.debug(`[FLOW MEDIA - APPLICATION] Enviando via Baileys (WhatsApp Web)`);
                await SendWhatsAppMediaFlow({
                  media: filePath,
                  ticket: ticketInt,
                  whatsappId: whatsapp.id,
                });
                logger.debug(`[FLOW MEDIA - APPLICATION] ✅ Application enviado com sucesso via Baileys`);
              }

              if (whatsapp.channel === "wacalls") {
                logger.debug(`[FLOW MEDIA - APPLICATION] Enviando via WhatsApp Plus (wacalls)`);
                await sendWacallsFlowMedia(ticketInt, filePath);
                logger.debug(`[FLOW MEDIA - APPLICATION] ✅ Application enviado com sucesso via WhatsApp Plus`);
              }

              if (whatsapp.channel === "whatsapp_oficial") {
                logger.debug(`[FLOW MEDIA - APPLICATION] Enviando via API Oficial`);

                const fileName = obterNomeEExtensaoDoArquivo(filePath);
                logger.debug(`[FLOW MEDIA - APPLICATION] FileName: ${fileName}`);

                try {
                  const fs = await import("fs");
                  if (!fs.existsSync(filePath)) {
                    logger.error(`[FLOW MEDIA - APPLICATION] ❌ Arquivo não encontrado: ${filePath}`);
                  } else {
                    logger.debug(`[FLOW MEDIA - APPLICATION] ✅ Arquivo existe, preparando envio...`);

                    const mediaSrc = {
                      fieldname: 'medias',
                      originalname: fileName,
                      encoding: '7bit',
                      mimetype: 'application/pdf',
                      filename: fileName,
                      path: filePath
                    } as Express.Multer.File

                    logger.debug(`[FLOW MEDIA - APPLICATION] MediaSrc: ${JSON.stringify(mediaSrc)}`);

                    await SendWhatsAppOficialMessage({
                      body: "",
                      ticket: ticketInt,
                      quotedMsg: null,
                      vCard: null,
                      type: 'document',
                      media: mediaSrc
                    });

                    logger.debug(`[FLOW MEDIA - APPLICATION] ✅ Application enviado com sucesso via API Oficial`);
                  }
                } catch (e) {
                  logger.error(`[FLOW MEDIA - APPLICATION] ❌ Erro ao validar/enviar application ${filePath}: ${e?.message || e}`);
                  logger.error(`[FLOW MEDIA - APPLICATION] Stack: ${e?.stack || 'N/A'}`);
                }
              }

              await intervalWhats("1");
            }
          } catch (elementError) {
            logger.error(`[SINGLE BLOCK] ❌ Erro ao processar elemento ${iLoc + 1}: ${elementNowSelected}`);
            logger.error(`[SINGLE BLOCK] Erro: ${elementError?.message || elementError}`);
            logger.error(`[SINGLE BLOCK] Stack: ${elementError?.stack || 'N/A'}`);
            // Re-lançar para ser capturado pelo catch principal
            throw elementError;
          }
        }

        logger.debug(`[SINGLE BLOCK] ✅ SingleBlock processado com sucesso - ${sequence.length} elementos`);
      }

      let isRandomizer: boolean;
      if (nodeSelected.type === "randomizer") {
        const selectedRandom = randomizarCaminho(nodeSelected.data.percent / 100);

        const resultConnect = connects.filter(
          connect => connect.source === nodeSelected.id
        );
        if (selectedRandom === "A") {
          next = resultConnect.filter(item => item.sourceHandle === "a")[0]
            .target;
          noAlterNext = true;
        } else {
          next = resultConnect.filter(item => item.sourceHandle === "b")[0]
            .target;
          noAlterNext = true;
        }
        isRandomizer = true;
      }

      // ✅ NÓ CONDITIONCOMPARE — Se/Senão com suporte a múltiplas condições (AND/OR)
      let isConditionCompare: boolean = false;
      if (nodeSelected.type === "conditionCompare") {
        logger.debug(`[CONDITION COMPARE] ========== PROCESSANDO NÓ SE/SENÃO ==========`);
        logger.debug(`[CONDITION COMPARE] ID do nó: ${nodeSelected.id}`);

        // ✅ Garantir que as auto-variáveis do ticket (ticketTags, ticketQueue, etc.)
        // estejam populadas antes da avaliação. Sem isso, ${ticketTags} chega vazio.
        await populateTicketAutoVariables(idTicket);

        const nodeData = nodeSelected.data || {};
        const logicOperator: "AND" | "OR" = nodeData.logicOperator || "AND";

        // Suporte a múltiplas condições (novo formato) e condição única (legado)
        let conditions: Array<{ leftValue: string; operator: string; rightValue: string }>;

        if (nodeData.conditions && Array.isArray(nodeData.conditions) && nodeData.conditions.length > 0) {
          conditions = nodeData.conditions;
        } else {
          // Formato legado (única condição)
          conditions = [{
            leftValue: nodeData.leftValue || "",
            operator: nodeData.operator || "equals",
            rightValue: nodeData.rightValue || "",
          }];
        }

        logger.debug(`[CONDITION COMPARE] Lógica: ${logicOperator}, Condições: ${conditions.length}`);

        // Avaliar cada condição
        const results = conditions.map((cond, idx) => {
          const resolvedLeft = processVariableValue(cond.leftValue, dataWebhook, idTicket);
          const resolvedRight = processVariableValue(cond.rightValue, dataWebhook, idTicket);
          const result = compareValues(resolvedLeft, resolvedRight, cond.operator);
          logger.debug(`[CONDITION COMPARE] Condição ${idx + 1}: "${resolvedLeft}" ${cond.operator} "${resolvedRight}" => ${result}`);
          return result;
        });

        // Aplicar operador lógico
        let conditionResult: boolean;
        if (logicOperator === "OR") {
          conditionResult = results.some(r => r === true);
        } else {
          // AND (padrão)
          conditionResult = results.every(r => r === true);
        }

        logger.debug(`[CONDITION COMPARE] Resultado final (${logicOperator}): ${conditionResult}`);

        // Selecionar saída: "true" ou "false"
        const resultConnects = connects.filter(c => c.source === nodeSelected.id);
        const trueConnect = resultConnects.find(c => c.sourceHandle === "true");
        const falseConnect = resultConnects.find(c => c.sourceHandle === "false");

        if (conditionResult && trueConnect) {
          next = trueConnect.target;
          logger.debug(`[CONDITION COMPARE] ✅ Verdadeiro → próximo nó: ${next}`);
        } else if (!conditionResult && falseConnect) {
          next = falseConnect.target;
          logger.debug(`[CONDITION COMPARE] ❌ Falso → próximo nó: ${next}`);
        } else {
          logger.warn(`[CONDITION COMPARE] Nenhuma conexão encontrada para resultado ${conditionResult}`);
          next = "";
        }

        noAlterNext = true;
        isConditionCompare = true;
      }

      // ========== NÓ INTERATIVO (Botões/Lista nativos) ==========
      if (nodeSelected.type === "interactiveMenu") {
        logger.debug(`[INTERACTIVE MENU] ========== PROCESSANDO NÓ INTERATIVO ==========`);
        logger.debug(`[INTERACTIVE MENU] ID: ${nodeSelected.id}, Tipo: ${nodeSelected.data.interactiveType}`);

        // ===== NOVOS TIPOS (CTA URL, CTA Call, Flow, Catálogo, Carrossel) =====
        // Enviam a mensagem e seguem fluxo via handle "a1" (sem aguardar input)
        const extendedTypes = ["cta_url", "cta_call", "flow", "catalog", "carousel", "pix"];
        if (extendedTypes.includes(nodeSelected.data.interactiveType)) {
          if (!(await ensureTicket())) continue;
          const ticketDetails = await ShowTicketService(ticket.id, companyId);
          // Resolve placeholders de fluxo (${variavel}) e de ticket ({{name}}, {{protocol}}...)
          const resolveTpl = (t: any): string =>
            t ? formatBody(processVariableValue(String(t), dataWebhook, ticket.id), ticketDetails) : t;
          const bodyMsg = resolveTpl(nodeSelected.data.message || "");
          const footerMsg = resolveTpl(nodeSelected.data.footer || "");
          const itype = nodeSelected.data.interactiveType;

          try {
            if (whatsapp.channel === "whatsapp") {
              const SendWhatsAppInteractive = (await import("../WbotServices/SendWhatsAppInteractive")).default;
              // Tradução do tipo escolhido na tela para o tipo que o
              // SendWhatsAppInteractive entende.
              //
              // FALTAVAM JUSTAMENTE OS DOIS MAIS USADOS. A tela oferece
              // "button" (Botões rápidos) e "list" (Lista) — ver
              // FlowBuilderInteractiveModal — mas o mapa só tinha cta_url,
              // cta_call, catalog, carousel e pix. Para botão e lista o
              // resultado era `baileysMap["button"] === undefined`, ou seja, o
              // envio saía com interactiveType indefinido e caía no caminho
              // padrão (texto). É por isso que menu com botões montado no
              // fluxo nunca virava botão de verdade.
              //
              // Para esses dois o nome já é o mesmo dos dois lados, então a
              // tradução é a identidade — mas precisa estar no mapa.
              const baileysMap: any = {
                button: "button",
                list: "list",
                cta_url: "url",
                cta_call: "call",
                catalog: "catalog",
                carousel: "carousel",
                pix: "pix",
              };
              if (itype === "flow") {
                // Flow não suportado no Baileys — fallback CTA URL se houver
                logger.warn(`[INTERACTIVE MENU] Flow não suportado no Baileys — enviando como texto`);
                const wbot = getWbot(whatsapp.id);
                const contact = await Contact.findOne({ where: { id: ticket.contactId } });
                if (contact) {
                  const jid = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
                  await wbot.sendMessage(jid, { text: bodyMsg });
                }
              } else {
                // As opções do menu ficam em `arrayOption` ([{number, value}],
                // ver FlowBuilderInteractiveModal) e NUNCA eram repassadas
                // aqui: a chamada só levava os campos de URL, chamada, PIX e
                // carrossel. Ou seja, mesmo com o tipo certo, botão e lista
                // saíam sem nenhuma opção — a mensagem virava texto solto.
                const opcoesDoNo: any[] = Array.isArray(nodeSelected.data.arrayOption)
                  ? nodeSelected.data.arrayOption
                  : [];

                const botoesDoNo = opcoesDoNo
                  .map((o: any, i: number) => ({
                    displayText: resolveTpl(o?.value) || `Opção ${i + 1}`,
                    id: String(o?.number ?? i + 1)
                  }))
                  .slice(0, 3);

                const secoesDoNo = opcoesDoNo.length
                  ? [{
                      title: "",
                      rows: opcoesDoNo.map((o: any, i: number) => ({
                        title: resolveTpl(o?.value) || `Opção ${i + 1}`,
                        id: String(o?.number ?? i + 1)
                      }))
                    }]
                  : [];

                await SendWhatsAppInteractive({
                  ticket: ticketDetails,
                  interactiveType: baileysMap[itype],
                  bodyText: bodyMsg,
                  footerText: footerMsg || undefined,
                  buttons: botoesDoNo,
                  sections: secoesDoNo,
                  listButtonText: nodeSelected.data.listButtonText || "Selecionar",
                  urlText: nodeSelected.data.ctaText,
                  url: nodeSelected.data.ctaUrl,
                  callText: nodeSelected.data.ctaText,
                  callNumber: nodeSelected.data.ctaPhone,
                  pixCopyPaste: resolveTpl(nodeSelected.data.pixCopyPaste),
                  pixButtonText: resolveTpl(nodeSelected.data.pixButtonText),
                  pixIncludeQrCode: nodeSelected.data.pixIncludeQrCode,
                  pixDocumentUrl: resolveTpl(nodeSelected.data.pixDocumentUrl),
                  pixDocumentName: resolveTpl(nodeSelected.data.pixDocumentName),
                  pixTotal: resolveTpl(nodeSelected.data.pixTotal),
                  pixName: resolveTpl(nodeSelected.data.pixName),
                  pixAmount: nodeSelected.data.pixAmount
                    ? Number(resolveTpl(String(nodeSelected.data.pixAmount)))
                    : undefined,
                  carouselCards: (nodeSelected.data.carouselCards || []).map((c: any) => ({
                    title: c.title || "",
                    body: c.body || "",
                    imageUrl: c.imageUrl || undefined,
                    buttons: c.buttonText
                      ? [{ displayText: c.buttonText, id: c.buttonId || "1" }]
                      : [],
                  })),
                });
              }
            } else if (whatsapp.channel === "whatsapp_oficial") {
              let interative: any = null;
              if (itype === "cta_url") {
                interative = {
                  type: "cta_url",
                  body: { text: bodyMsg },
                  footer: footerMsg ? { text: footerMsg } : undefined,
                  action: {
                    name: "cta_url",
                    parameters: {
                      display_text: nodeSelected.data.ctaText || "Abrir",
                      url: nodeSelected.data.ctaUrl || "",
                    },
                  },
                };
              } else if (itype === "flow") {
                interative = {
                  type: "flow",
                  body: { text: bodyMsg },
                  footer: footerMsg ? { text: footerMsg } : undefined,
                  action: {
                    name: "flow",
                    parameters: {
                      flow_message_version: "3",
                      flow_token: nodeSelected.data.flowToken || `tok_${Date.now()}`,
                      flow_id: nodeSelected.data.flowId,
                      flow_cta: nodeSelected.data.flowCta || "Abrir",
                      flow_action: "navigate",
                      flow_action_payload: { screen: nodeSelected.data.flowScreen || "WELCOME" },
                    },
                  },
                };
              } else if (itype === "catalog") {
                interative = {
                  type: "catalog_message",
                  body: { text: bodyMsg || "Confira nosso catálogo" },
                  footer: footerMsg ? { text: footerMsg } : undefined,
                  action: {
                    name: "catalogue_message",
                    parameters: nodeSelected.data.catalogProductId
                      ? { thumbnail_product_retailer_id: nodeSelected.data.catalogProductId }
                      : {},
                  },
                };
              } else if (itype === "carousel") {
                const cards = nodeSelected.data.carouselCards || [];
                interative = {
                  type: "product_list",
                  header: { type: "text", text: nodeSelected.data.message || "Produtos" },
                  body: { text: bodyMsg || " " },
                  footer: footerMsg ? { text: footerMsg } : undefined,
                  action: {
                    catalog_id: nodeSelected.data.catalogId || "",
                    sections: [{
                      title: "Produtos",
                      product_items: cards.map((c: any) => ({ product_retailer_id: c.buttonId || c.title })),
                    }],
                  },
                };
              } else if (itype === "cta_call") {
                // CTA call não existe nativo na Cloud API — usar template ou cta_url tel:
                interative = {
                  type: "cta_url",
                  body: { text: bodyMsg },
                  footer: footerMsg ? { text: footerMsg } : undefined,
                  action: {
                    name: "cta_url",
                    parameters: {
                      display_text: nodeSelected.data.ctaText || "Ligar",
                      url: `tel:${nodeSelected.data.ctaPhone || ""}`,
                    },
                  },
                };
              }
              if (interative) {
                await SendWhatsAppOficialMessage({
                  body: bodyMsg, ticket: ticketDetails, type: "interactive",
                  media: null, vCard: null, interative,
                });
              }
            } else if (whatsapp.channel === "wacalls") {
              // WhatsApp Plus (wacalls/whatsmeow) roda em conta pessoal/dispositivo
              // vinculado — botões nativos, CTA, catálogo e carrossel só existem na
              // Cloud API (whatsapp_oficial). Degrada pra texto simples com a mesma
              // informação, em vez de simplesmente não enviar nada.
              const lines = [bodyMsg];
              if (itype === "cta_url" && nodeSelected.data.ctaUrl) {
                lines.push(`${nodeSelected.data.ctaText || "Abrir link"}: ${nodeSelected.data.ctaUrl}`);
              } else if (itype === "cta_call" && nodeSelected.data.ctaPhone) {
                lines.push(`${nodeSelected.data.ctaText || "Ligar para"}: ${nodeSelected.data.ctaPhone}`);
              } else if (itype === "pix") {
                const pixCP = resolveTpl(nodeSelected.data.pixCopyPaste);
                if (pixCP) lines.push(`Pix Copia e Cola:\n${pixCP}`);
              } else if (itype === "catalog" || itype === "carousel") {
                (nodeSelected.data.carouselCards || []).forEach((c: any) => {
                  if (c.title) lines.push(`• ${c.title}${c.body ? ` - ${c.body}` : ""}`);
                });
              } else if (itype === "flow") {
                lines.push(nodeSelected.data.flowCta || "");
              }
              if (footerMsg) lines.push(footerMsg);
              const degradedBody = lines.filter(Boolean).join("\n\n");
              try {
                const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
                await SendWacallsText({ ticket: ticketDetails, body: degradedBody });
              } catch (e: any) {
                logger.error(`[INTERACTIVE MENU] Falha ao enviar (wacalls, degradado) '${itype}': ${e?.message}`);
              }
            }

            logger.debug(`[INTERACTIVE MENU] ✅ Tipo estendido '${itype}' enviado, avançando fluxo`);
          } catch (sendErr: any) {
            const detail = sendErr?.response?.data
              ? JSON.stringify(sendErr.response.data)
              : sendErr?.message;
            logger.error(`[INTERACTIVE MENU] ❌ Erro ao enviar ${itype}: ${detail}`);
            if (itype === "catalog" || itype === "carousel") {
              logger.error(
                `[INTERACTIVE MENU] ⚠️ Verifique: (1) Catálogo de Comércio vinculado à WABA, ` +
                `(2) Catalog feature aprovada para o número, ` +
                `(3) catalogId="${nodeSelected.data.catalogId || "VAZIO"}" e ` +
                `catalogProductId="${nodeSelected.data.catalogProductId || "VAZIO"}" existem no catálogo.`
              );
            }
          }

          // Avançar via handle "a1"
          const conn = connectStatic.find(
            c => (c.source === nodeSelected.id || c.source === next) &&
                 (c.sourceHandle === "a1" || !c.sourceHandle)
          );
          if (conn) {
            execFn = conn.target;
            next = conn.target;
            const nextNode = nodes.find(n => n.id === execFn);
            isMenu = !!nextNode && (nextNode.type === "menu" || nextNode.type === "interactiveMenu");
            noAlterNext = true;
            logger.debug(`[INTERACTIVE MENU] → Próximo nó: ${execFn}`);
            continue;
          } else {
            logger.debug(`[INTERACTIVE MENU] Nenhuma conexão a1 — fim do fluxo, finalizando ticket`);
            if (ticket) {
              try {
                await ticket.update({
                  lastFlowId: null,
                  dataWebhook: null,
                  hashFlowId: null,
                  flowWebhook: false,
                  flowStopped: null,
                  useIntegration: null,
                  integrationId: null,
                  isBot: false,
                });
              } catch (e) {
                logger.error(`[INTERACTIVE MENU] Erro ao finalizar fluxo: ${(e as any)?.message}`);
              }
            }
            break;
          }
        }

        if (pressKey) {
          // Usuário respondeu ao menu interativo
          const rawPressKey = pressKey;
          pressKey = pressKey.trim().replace(/[\r\n\u200e\u200f\u200b]/g, "");
          const groupQuoteMatch = pressKey.match(/^\*[^*]+:\*\s*/);
          if (groupQuoteMatch) {
            pressKey = pressKey.slice(groupQuoteMatch[0].length).trim();
          }

          logger.debug(`[INTERACTIVE MENU] Resposta: "${rawPressKey}" → "${pressKey}"`);

          const sanitize = (s: string) =>
            (s || "")
              .toString()
              .trim()
              .replace(/[\r\u200e\u200f\u200b]/g, "")
              .toLowerCase();

          let matchedOption = null;

          // Alguns clientes enviam resposta com quote + texto do botão em outra linha.
          // Vamos testar múltiplos candidatos e priorizar a última linha não vazia.
          const candidates = Array.from(
            new Set([
              pressKey,
              ...pressKey
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
              pressKey
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(-1)[0] || "",
            ].filter(Boolean))
          );

          // 1) match por número/ID
          for (const candidate of candidates) {
            const numericMatch = candidate.match(/(\d+)/);
            if (numericMatch) {
              matchedOption = nodeSelected.data.arrayOption?.find(
                o => String(o.number) === String(numericMatch[1])
              );
              if (matchedOption) break;
            }
          }

          // 2) match por texto (exato ou contido)
          if (!matchedOption) {
            for (const candidate of candidates) {
              const pk = sanitize(candidate);
              matchedOption = nodeSelected.data.arrayOption?.find(o => {
                const ov = sanitize(o.value);
                const on = sanitize(String(o.number));
                return pk === ov || pk === on || pk.endsWith(ov) || pk.includes(ov);
              });
              if (matchedOption) break;
            }
          }

          if (matchedOption) {
            // Alguns fluxos usam source = next, outros source = nodeSelected.id
            const filterOne = connectStatic.filter(
              c => c.source === next || c.source === nodeSelected.id
            );

            const normalizedValue = sanitize(matchedOption.value || "");
            const candidateHandles = new Set([
              `a${matchedOption.number}`,
              `${matchedOption.number}`,
              `option-${matchedOption.number}`,
              normalizedValue,
              `a${normalizedValue}`,
            ]);

            const filterTwo = filterOne.filter(c =>
              c.sourceHandle && candidateHandles.has(sanitize(c.sourceHandle))
            );

            logger.info(
              `[INTERACTIVE MENU] Handles disponíveis: ${JSON.stringify(
                filterOne.map(c => c.sourceHandle)
              )}`
            );
            logger.info(
              `[INTERACTIVE MENU] Handles candidatos para opção ${matchedOption.number}: ${JSON.stringify(
                Array.from(candidateHandles)
              )}`
            );

            if (filterTwo.length > 0) {
              execFn = filterTwo[0].target;
              next = execFn; // ✅ CRÍTICO: avançar para o nó final da opção

              global.flowVariables = global.flowVariables || {};
              global.flowVariables["menuOption"] = String(matchedOption.number);
              if (idTicket) {
                global.flowVariables[`${idTicket}_menuOption`] = String(matchedOption.number);
              }

              logger.debug(`[INTERACTIVE MENU] ✅ Opção ${matchedOption.number} → próximo: ${execFn}`);

              // Registrar no atendimento qual opção o cliente escolheu
              try {
                if (await ensureTicket()) {
                  await CreateMessageService({
                    messageData: {
                      wid: randomString(50),
                      ticketId: ticket.id,
                      body: `✅ *Opção selecionada:* ${matchedOption.number}. ${matchedOption.value}`,
                      fromMe: true,
                      read: true,
                      ack: 2,
                    },
                    companyId
                  });
                }
              } catch (e) {
                logger.warn(`[INTERACTIVE MENU] Falha ao registrar msg de seleção: ${(e as any)?.message}`);
              }
            } else {
              logger.warn(
                `[INTERACTIVE MENU] ❌ Nenhuma conexão encontrada para opção ${matchedOption.number} (${matchedOption.value})`
              );
            }
          }

          if (!matchedOption || !execFn) {
            // Se a opção é VÁLIDA mas não há conexão de saída → fim do fluxo (não repetir menu)
            if (matchedOption && !execFn) {
              logger.debug(`[INTERACTIVE MENU] ✅ Opção ${matchedOption.number} sem conexão de saída — fim do fluxo, finalizando.`);
              if (await ensureTicket()) {
                await ticket.update({
                  lastFlowId: null,
                  flowWebhook: false,
                  flowStopped: null,
                  hashFlowId: null,
                  useIntegration: false,
                  integrationId: null,
                  isBot: false,
                });
              }
              break;
            }
            // Opção inválida - reenviar menu
            logger.warn(`[INTERACTIVE MENU] ❌ Opção inválida: "${pressKey}"`);
            if (!(await ensureTicket())) continue;
            const ticketDetails = await ShowTicketService(ticket.id, companyId);
            const bodyMsg = formatBody(nodeSelected.data.message || "", ticketDetails);
            const footerMsg = formatBody(nodeSelected.data.footer || "", ticketDetails);

            if (whatsapp.channel === "whatsapp") {
              const wbot = getWbot(whatsapp.id);
              const contact = await Contact.findOne({ where: { id: ticket.contactId } });
              if (!contact) {
                logger.error(`[ActionsWebhook] Contato ${ticket.contactId} não encontrado para ticket ${ticket.id}`);
                break;
              }
              const jid = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;

              if (nodeSelected.data.interactiveType === "button") {
                const { sendInteractiveButtons } = await import("../../helpers/SendInteractiveMsg");
                await sendInteractiveButtons({
                  wbot,
                  jid,
                  bodyText: bodyMsg,
                  footerText: footerMsg || undefined,
                  buttons: nodeSelected.data.arrayOption.map((opt) => ({
                    displayText: opt.value,
                    id: `${opt.number}`,
                  })),
                  headerImageFullPath: nodeSelected.data.headerImage ? path.join(publicFolder, nodeSelected.data.headerImage) : undefined,
                });
              } else {
                // Lista interativa nativa (single_select) — renderiza no Baileys via fork
                const { sendInteractiveList } = await import("../../helpers/SendInteractiveMsg");
                const listBodyText = bodyMsg || "Selecione uma opção:";
                logger.debug(`[INTERACTIVE MENU] Reenviando LISTA para ${jid} (opção inválida)`);
                try {
                  await sendInteractiveList({
                    wbot,
                    jid,
                    bodyText: listBodyText,
                    footerText: footerMsg || undefined,
                    buttonText: nodeSelected.data.listButtonText || "Selecionar",
                    sections: [{
                      title: "Opções",
                      rows: nodeSelected.data.arrayOption.map((opt) => ({
                        title: opt.value || `Opção ${opt.number}`,
                        description: "",
                        id: `${opt.number}`,
                      })),
                    }],
                  });
                } catch (listErr: any) {
                  logger.error(`[INTERACTIVE MENU] ❌ Erro ao reenviar lista: ${listErr?.message}`);
                  let fallbackText = listBodyText + "\n\n";
                  nodeSelected.data.arrayOption.forEach(opt => {
                    fallbackText += `[${opt.number}] ${opt.value}\n`;
                  });
                  await wbot.sendMessage(jid, { text: fallbackText });
                }
              }
            } else if (whatsapp.channel === "whatsapp_oficial") {
              if (nodeSelected.data.interactiveType === "button") {
                const bodyToSave = `[BUTTON]\n\n*${bodyMsg}*\n\n${(nodeSelected.data.arrayOption || [])
                  .map((opt: any) => `*${opt.number}* - ${opt.value}`)
                  .join("\n")}`;
                const interative = {
                  type: 'button' as const,
                  body: { text: bodyMsg },
                  footer: footerMsg ? { text: footerMsg } : undefined,
                  action: {
                    buttons: nodeSelected.data.arrayOption.map(opt => ({
                      type: 'reply' as const,
                      reply: { id: `${opt.number}`, title: opt.value }
                    }))
                  }
                };
                await SendWhatsAppOficialMessage({
                  body: bodyMsg, ticket: ticketDetails, type: 'interactive',
                  media: null, vCard: null, interative: interative as any, bodyToSave
                });
              } else {
                const bodyToSave = `[LIST]\n\n*${bodyMsg}*\n\n${(nodeSelected.data.arrayOption || [])
                  .map((opt: any) => opt.value)
                  .join("\n")}`;
                const interative = {
                  type: 'list' as const,
                  body: { text: bodyMsg },
                  footer: footerMsg ? { text: footerMsg } : undefined,
                  action: {
                    button: nodeSelected.data.listButtonText || "Selecionar",
                    sections: [{ title: "Opções", rows: nodeSelected.data.arrayOption.map(opt => ({
                      id: `${opt.number}`, title: opt.value
                    }))}]
                  }
                };
                await SendWhatsAppOficialMessage({
                  body: bodyMsg, ticket: ticketDetails, type: 'interactive',
                  media: null, vCard: null, interative: interative as any, bodyToSave
                });
              }
            } else if (whatsapp.channel === "wacalls") {
              // Mesma correção do "primeiro acesso" abaixo: botões/lista
              // nativos funcionam em wacalls via SendWhatsAppInteractive, não
              // precisa degradar pra texto de cara.
              const opcoesDoNo: any[] = Array.isArray(nodeSelected.data.arrayOption)
                ? nodeSelected.data.arrayOption
                : [];
              const botoesDoNo = opcoesDoNo
                .map((o: any, i: number) => ({
                  displayText: o?.value || `Opção ${i + 1}`,
                  id: String(o?.number ?? i + 1),
                }))
                .slice(0, 3);
              const secoesDoNo = opcoesDoNo.length
                ? [{
                    title: "",
                    rows: opcoesDoNo.map((o: any, i: number) => ({
                      title: o?.value || `Opção ${i + 1}`,
                      id: String(o?.number ?? i + 1),
                    })),
                  }]
                : [];
              try {
                const SendWhatsAppInteractiveFn = (await import("../WbotServices/SendWhatsAppInteractive")).default;
                await SendWhatsAppInteractiveFn({
                  ticket: ticketDetails,
                  interactiveType: nodeSelected.data.interactiveType === "list" ? "list" : "button",
                  bodyText: bodyMsg,
                  footerText: footerMsg || undefined,
                  buttons: botoesDoNo,
                  sections: secoesDoNo,
                  listButtonText: nodeSelected.data.listButtonText || "Selecionar",
                });
              } catch (e: any) {
                logger.error(`[INTERACTIVE MENU] Falha ao reenviar menu interativo nativo (wacalls), caindo para texto: ${e?.message}`);
                const degradedBody = `${bodyMsg}\n\n${opcoesDoNo
                  .map((opt: any) => `[${opt.number}] ${opt.value}`)
                  .join("\n")}${footerMsg ? `\n\n${footerMsg}` : ""}`;
                try {
                  const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
                  await SendWacallsText({ ticket: ticketDetails, body: degradedBody });
                } catch (e2: any) {
                  logger.error(`[INTERACTIVE MENU] Falha também no fallback de texto (wacalls): ${e2?.message}`);
                }
              }
            }

            await ticket.update({
              flowWebhook: true,
              flowStopped: idFlowDb.toString(),
              lastFlowId: nodeSelected.id,
              hashFlowId: hashWebhookId,
            });
            return "waiting_input";
          }

          // ✅ CORRIGIDO: avançar fluxo imediatamente após seleção válida
          pressKey = undefined;

          // Verificar se o próximo nó também é menu/interactiveMenu
          const isNodeExist = nodes.filter(item => item.id === execFn);
          if (isNodeExist.length > 0) {
            isMenu = isNodeExist[0].type === "menu" || isNodeExist[0].type === "interactiveMenu";
            logger.debug(`[INTERACTIVE MENU] Próximo nó ${execFn} é do tipo ${isNodeExist[0].type}, isMenu=${isMenu}`);
          } else {
            isMenu = false;
            logger.warn(`[INTERACTIVE MENU] Próximo nó ${execFn} NÃO encontrado nos nodes!`);
          }

          noAlterNext = true;
          logger.debug(`[INTERACTIVE MENU] ✅ Avançando para próximo nó: next=${next}, execFn=${execFn}, noAlterNext=${noAlterNext}, isMenu=${isMenu}`);
        } else {
          // Primeiro acesso — enviar mensagem interativa
          if (!(await ensureTicket())) continue;
          const ticketDetails = await ShowTicketService(ticket.id, companyId);
          const bodyMsg = formatBody(nodeSelected.data.message || "", ticketDetails);
          const footerMsg = formatBody(nodeSelected.data.footer || "", ticketDetails);

          if (whatsapp.channel === "whatsapp") {
            const wbot = getWbot(whatsapp.id);
            const contact = await Contact.findOne({ where: { id: ticket.contactId } });
            if (!contact) {
              logger.error(`[ActionsWebhook] Contato ${ticket.contactId} não encontrado para ticket ${ticket.id}`);
              break;
            }
            const jid = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;

            if (nodeSelected.data.interactiveType === "button") {
                const { sendInteractiveButtons } = await import("../../helpers/SendInteractiveMsg");
                await sendInteractiveButtons({
                  wbot,
                  jid,
                  bodyText: bodyMsg,
                  footerText: footerMsg || undefined,
                  buttons: nodeSelected.data.arrayOption.map((opt) => ({
                    displayText: opt.value,
                    id: `${opt.number}`,
                  })),
                  headerImageFullPath: nodeSelected.data.headerImage ? path.join(publicFolder, nodeSelected.data.headerImage) : undefined,
                });
            } else {
                // Lista interativa nativa (single_select) — renderiza no Baileys via fork
                const { sendInteractiveList } = await import("../../helpers/SendInteractiveMsg");
                const listBodyText = bodyMsg || "Selecione uma opção:";
                logger.debug(`[INTERACTIVE MENU] Enviando LISTA para ${jid} - Body: "${listBodyText}", Opções: ${nodeSelected.data.arrayOption?.length || 0}`);
                try {
                  await sendInteractiveList({
                    wbot,
                    jid,
                    bodyText: listBodyText,
                    footerText: footerMsg || undefined,
                    buttonText: nodeSelected.data.listButtonText || "Selecionar",
                    sections: [{
                      title: "Opções",
                      rows: nodeSelected.data.arrayOption.map((opt) => ({
                        title: opt.value || `Opção ${opt.number}`,
                        description: "",
                        id: `${opt.number}`,
                      })),
                    }],
                  });
                  logger.debug(`[INTERACTIVE MENU] ✅ Lista enviada com sucesso para ${jid}`);
                } catch (listErr: any) {
                  logger.error(`[INTERACTIVE MENU] ❌ Erro ao enviar lista para ${jid}: ${listErr?.message}`);
                  let fallbackText = listBodyText + "\n\n";
                  nodeSelected.data.arrayOption.forEach(opt => {
                    fallbackText += `[${opt.number}] ${opt.value}\n`;
                  });
                  await wbot.sendMessage(jid, { text: fallbackText });
                  logger.debug(`[INTERACTIVE MENU] ⚠️ Enviado como texto fallback para ${jid}`);
                }
            }
          } else if (whatsapp.channel === "whatsapp_oficial") {
            if (nodeSelected.data.interactiveType === "button") {
              const bodyToSave = `[BUTTON]\n\n*${bodyMsg}*\n\n${(nodeSelected.data.arrayOption || [])
                .map((opt: any) => `*${opt.number}* - ${opt.value}`)
                .join("\n")}`;
              const interative = {
                type: 'button' as const,
                body: { text: bodyMsg },
                footer: footerMsg ? { text: footerMsg } : undefined,
                action: {
                  buttons: nodeSelected.data.arrayOption.map(opt => ({
                    type: 'reply' as const,
                    reply: { id: `${opt.number}`, title: opt.value }
                  }))
                }
              };
              await SendWhatsAppOficialMessage({
                body: bodyMsg, ticket: ticketDetails, type: 'interactive',
                media: null, vCard: null, interative: interative as any, bodyToSave
              });
            } else {
              const bodyToSave = `[LIST]\n\n*${bodyMsg}*\n\n${(nodeSelected.data.arrayOption || [])
                .map((opt: any) => opt.value)
                .join("\n")}`;
              const interative = {
                type: 'list' as const,
                body: { text: bodyMsg },
                footer: footerMsg ? { text: footerMsg } : undefined,
                action: {
                  button: nodeSelected.data.listButtonText || "Selecionar",
                  sections: [{ title: "Opções", rows: nodeSelected.data.arrayOption.map(opt => ({
                    id: `${opt.number}`, title: opt.value
                  }))}]
                }
              };
              await SendWhatsAppOficialMessage({
                body: bodyMsg, ticket: ticketDetails, type: 'interactive',
                media: null, vCard: null, interative: interative as any, bodyToSave
              });
            }
          } else if (whatsapp.channel === "wacalls") {
            // Botões/lista nativos SIM funcionam em wacalls (WhatsApp Plus) —
            // a ponte com o wacalls-chat (SendWhatsAppInteractive →
            // WacallsChatMessageService.sendChatButtons/sendChatList →
            // flowbridge.go) já sabe montar InteractiveMessage/NativeFlowMessage
            // corretamente. O comentário antigo aqui ("sem botões nativos em
            // conta pessoal") não é mais verdade — na real nunca chegou a ser
            // conectado: ESTE branch específico (primeiro acesso ao nó, o que
            // de fato dispara quando o fluxo é acionado) sempre mandou direto
            // como texto numerado via SendWacallsText, ignorando por completo
            // a capacidade nativa que já existe pra esse canal. É por isso que
            // nenhum ajuste no lado Go/bridge surtia efeito: esse caminho nem
            // chegava a chamá-los.
            const opcoesDoNo: any[] = Array.isArray(nodeSelected.data.arrayOption)
              ? nodeSelected.data.arrayOption
              : [];
            const botoesDoNo = opcoesDoNo
              .map((o: any, i: number) => ({
                displayText: o?.value || `Opção ${i + 1}`,
                id: String(o?.number ?? i + 1),
              }))
              .slice(0, 3);
            const secoesDoNo = opcoesDoNo.length
              ? [{
                  title: "",
                  rows: opcoesDoNo.map((o: any, i: number) => ({
                    title: o?.value || `Opção ${i + 1}`,
                    id: String(o?.number ?? i + 1),
                  })),
                }]
              : [];
            try {
              const SendWhatsAppInteractiveFn = (await import("../WbotServices/SendWhatsAppInteractive")).default;
              await SendWhatsAppInteractiveFn({
                ticket: ticketDetails,
                interactiveType: nodeSelected.data.interactiveType === "list" ? "list" : "button",
                bodyText: bodyMsg,
                footerText: footerMsg || undefined,
                buttons: botoesDoNo,
                sections: secoesDoNo,
                listButtonText: nodeSelected.data.listButtonText || "Selecionar",
              });
            } catch (e: any) {
              logger.error(`[INTERACTIVE MENU] Falha ao enviar menu interativo nativo (wacalls), caindo para texto: ${e?.message}`);
              const degradedBody = `${bodyMsg}\n\n${opcoesDoNo
                .map((opt: any) => `[${opt.number}] ${opt.value}`)
                .join("\n")}${footerMsg ? `\n\n${footerMsg}` : ""}`;
              try {
                const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
                await SendWacallsText({ ticket: ticketDetails, body: degradedBody });
              } catch (e2: any) {
                logger.error(`[INTERACTIVE MENU] Falha também no fallback de texto (wacalls): ${e2?.message}`);
              }
            }
          }

          if (whatsapp.channel === "whatsapp") {
            // Nota: pro canal wacalls a persistência já acontece dentro do
            // SendMessage → SendWacallsText (CreateMessageService interno) —
            // gravar aqui de novo duplicaria a mensagem no atendimento.
            const messageData: MessageData = {
              wid: randomString(50),
              ticketId: ticket.id,
              body: (() => {
                const opts = (nodeSelected.data.arrayOption || [])
                  .map((o: any) => `▫️ *${o.number}.* ${o.value}`)
                  .join("\n");
                return opts ? `${bodyMsg}\n\n${opts}` : bodyMsg;
              })(),
              fromMe: true,
              read: true,
              ack: 2,
            };
            await CreateMessageService({ messageData, companyId });
          }

          await ticket.update({
            flowWebhook: true,
            flowStopped: idFlowDb.toString(),
            lastFlowId: nodeSelected.id,
            hashFlowId: hashWebhookId,
          });

          logger.debug(`[INTERACTIVE MENU] ✅ Mensagem interativa enviada, aguardando resposta`);
          return "waiting_input";
        }
      }

      // isMenu declared at top of function scope
      if (nodeSelected.type === "menu") {
        logger.debug(`[MENU NODE] ========== PROCESSANDO NÓ MENU ==========`);
        logger.debug(`[MENU NODE] ID do nó: ${nodeSelected.id}`);
        logger.debug(`[MENU NODE] PressKey recebido: ${pressKey || 'undefined'}`);
        logger.debug(`[MENU NODE] Next atual: ${next}`);
        logger.debug(`[MENU NODE] Ticket ID: ${ticket?.id || idTicket}`);

        // ✅ CORRIGIDO: Verificar se o ticket está "open" antes de processar Menu
        // EXCEÇÃO: Se o fluxo foi disparado manualmente (isManualTrigger=true), permitir execução mesmo com status "open"
        // Recarregar o ticket para obter o status mais atualizado
        if (idTicket) {
          const currentTicket = await Ticket.findByPk(idTicket);
          if (currentTicket && currentTicket.status === "open" && !isManualTrigger) {
            logger.debug(`[MENU NODE] ⚠️ Ticket ${idTicket} está OPEN - Parando fluxo e não processando Menu`);
            // Limpar os dados do webhook relacionados ao fluxo
            await currentTicket.update({
              flowWebhook: false,
              lastFlowId: null,
              hashFlowId: null,
              flowStopped: null,
              dataWebhook: null
            });
            return "stopped_by_open_ticket";
          }
          // Atualizar a referência do ticket
          ticket = currentTicket;
        }

        if (pressKey) {
          // ✅ FIX: Normalizar pressKey — remover espaços, quebras de linha e caracteres invisíveis
          // O WhatsApp às vezes envia "1\n", " 1 ", "1." — todos devem ser tratados como "1"
          // Grupos/citações: WhatsApp envia "*Alan Lucena:*1" — remover prefixo "*Nome:*"
          const rawPressKey = pressKey;
          pressKey = pressKey.trim().replace(/[\r\n\u200e\u200f\u200b]/g, "");

          // Remover prefixo de citação de grupo no formato "*Nome:*resposta" ou "*Nome:* resposta"
          const groupQuoteMatch = pressKey.match(/^\*[^*]+:\*\s*/);
          if (groupQuoteMatch) {
            pressKey = pressKey.slice(groupQuoteMatch[0].length).trim();
            logger.debug(`[MENU NODE] Prefixo de grupo removido: "${groupQuoteMatch[0]}" → pressKey agora: "${pressKey}"`);
          }

          // Tentar extrair só o número do início da mensagem (ex: "1 - Suporte" → "1", "2." → "2")
          const numericMatch = pressKey.match(/^(\d+)/);
          const originalText = pressKey; // preservar texto original para matching por título
          if (numericMatch) {
            pressKey = numericMatch[1];
          }

          logger.debug(`[MENU NODE] ========== USUÁRIO RESPONDEU MENU ==========`);
          logger.debug(`[MENU NODE] Resposta bruta: "${rawPressKey}" → Normalizada: "${pressKey}"`);
          logger.debug(`[MENU NODE] Opções disponíveis: ${JSON.stringify(nodeSelected.data.arrayOption?.map(o => ({ number: o.number, value: o.value })))}`);

          // Saída do fluxo pelo nó de menu.
          //
          // Aqui havia uma SEGUNDA lista de palavras, fixa em
          // ["sair","encerrar","finalizar","cancelar"], que ignorava o que
          // estava configurado no nó de saída do fluxo e encerrava de um jeito
          // diferente do resto do sistema (gravava status "pending", deixando o
          // ticket parado em "Aguardando" em vez de fechar).
          //
          // Agora delega pro mesmo serviço usado pelos três canais, então as
          // palavras configuradas e a despedida valem em qualquer nó.
          const ticketParaSaida = await ShowTicketService(ticket.id, companyId);
          const encerrouPeloMenu = await HandleFlowExitKeyword({
            ticket: ticketParaSaida,
            contact: ticketParaSaida.contact,
            companyId,
            body: pressKey,
            canal: "MENU"
          });

          if (encerrouPeloMenu) {
            logger.debug(
              `[MENU NODE] Fluxo encerrado por palavra-chave de saída: "${pressKey}"`
            );
            return "flow_exited";
          }

          logger.debug(`[MENU NODE] Buscando conexão - Source: ${next}, SourceHandle: a${pressKey}`);
          logger.debug(`[MENU NODE] Total de conexões disponíveis: ${connectStatic.length}`);
          logger.debug(`[MENU NODE] Conexões do nó atual (${next}): ${JSON.stringify(connectStatic.filter(c => c.source === next).map(c => ({ source: c.source, target: c.target, handle: c.sourceHandle })))}`);

          const filterOne = connectStatic.filter(confil => confil.source === next)
          logger.debug(`[MENU NODE] FilterOne (conexões do source ${next}): ${filterOne.length} encontradas`);

          const filterTwo = filterOne.filter(filt2 => filt2.sourceHandle === "a" + pressKey)
          logger.debug(`[MENU NODE] FilterTwo (handle a${pressKey}): ${filterTwo.length} encontradas`);

          // ✅ FALLBACK: se não achou por número, tentar casar pelo texto do botão/lista
          // (necessário para respostas interativas da API Oficial e Baileys que enviam o título)
          let matchedByText: any = null;
          if (filterTwo.length === 0 && Array.isArray(nodeSelected.data?.arrayOption)) {
            const normalize = (s: any) =>
              String(s ?? "")
                .toLowerCase()
                .trim()
                .replace(/[\r\n\u200e\u200f\u200b]/g, "");
            const target = normalize(originalText);
            matchedByText = nodeSelected.data.arrayOption.find((opt: any) => {
              const v = normalize(opt?.value);
              const n = normalize(opt?.number);
              return target && (v === target || target === n || (v && target.includes(v)));
            });
            if (matchedByText) {
              const matchHandle = "a" + String(matchedByText.number);
              const byTitle = filterOne.filter(f => f.sourceHandle === matchHandle);
              if (byTitle.length > 0) {
                pressKey = String(matchedByText.number);
                filterTwo.push(byTitle[0]);
                logger.debug(`[MENU NODE] ✅ Match por título: "${originalText}" -> opção ${pressKey} (${matchedByText.value})`);
              }
            }
          }

          if (filterTwo.length > 0) {
            execFn = filterTwo[0].target
            logger.debug(`[MENU NODE] ✅ Conexão encontrada! Próximo nó (execFn): ${execFn}`);

            // ✅ SALVAR opção escolhida como variável global para uso no IF/ELSE
            // Ex: usuário digitou "1" → menuOption_1 = "1", menuOption = "1"
            const menuVarKey = `menuOption_${pressKey}`;
            global.flowVariables[menuVarKey] = pressKey;
            global.flowVariables["menuOption"] = pressKey;

            // Salvar também com escopo do ticket para evitar conflito entre sessões
            if (idTicket) {
              global.flowVariables[`${idTicket}_${menuVarKey}`] = pressKey;
              global.flowVariables[`${idTicket}_menuOption`] = pressKey;
            }

            logger.debug(`[MENU NODE] ✅ Variável salva: ${menuVarKey} = "${pressKey}" (ticketId: ${idTicket})`);

            // Registrar no histórico do atendimento qual opção foi escolhida
            try {
              const chosen = nodeSelected.data.arrayOption?.find(
                (o: any) => String(o.number) === String(pressKey)
              );
              if (chosen) {
                await CreateMessageService({
                  messageData: {
                    wid: randomString(50),
                    ticketId: ticket.id,
                    body: `✅ *Opção selecionada:* ${chosen.number}. ${chosen.value}`,
                    fromMe: true,
                    read: true,
                    ack: 2,
                  },
                  companyId
                });
              }
            } catch (e) {
              logger.warn(`[MENU NODE] Falha ao registrar msg de seleção: ${(e as any)?.message}`);
            }
          } else {
            execFn = undefined
            logger.warn(`[MENU NODE] ❌ NENHUMA CONEXÃO encontrada para handle a${pressKey}`);
          }

          if (execFn === undefined) {
            logger.error(`[MENU NODE] ========== OPÇÃO INVÁLIDA ==========`);
            logger.error(`[MENU NODE] PressKey: "${pressKey}" não tem conexão correspondente`);
            logger.error(`[MENU NODE] Handles disponíveis: ${filterOne.map(f => f.sourceHandle).join(', ')}`);

            let optionsText = "";
            nodeSelected.data.arrayOption.forEach(item => {
              optionsText += `[${item.number}] ${item.value}\n`;
            });

            const fallbackMessage = `Opção inválida. Por favor, escolha uma das opções abaixo ou digite *Sair* para finalizar o atendimento:\n\n${optionsText}`;

            const ticketDetails = await ShowTicketService(ticket.id, companyId);

            if (whatsapp.channel === "whatsapp" || whatsapp.channel === "wacalls") {
              await SendWhatsAppMessage({
                body: fallbackMessage,
                ticket: ticketDetails,
                quotedMsg: null
              });
            } else if (whatsapp.channel === "whatsapp_oficial") {
              await SendWhatsAppOficialMessage({
                body: fallbackMessage,
                ticket: ticketDetails,
                quotedMsg: null,
                type: 'text',
                media: null,
                vCard: null
              });
            }

            const messageData: MessageData = {
              wid: randomString(50),
              ticketId: ticket.id,
              body: fallbackMessage,
              fromMe: true,
              read: true,
              ack: 2,
            };

            await CreateMessageService({ messageData, companyId });

            return "fallback_sent";
          }

          logger.debug(`[MENU NODE] Definindo pressKey como "999" para continuar processamento`);
          pressKey = "999";

          const isNodeExist = nodes.filter(item => item.id === execFn);
          logger.debug(`[MENU NODE] Verificando se nó ${execFn} existe: ${isNodeExist.length > 0 ? 'SIM' : 'NÃO'}`);

          if (isNodeExist.length > 0) {
            isMenu = isNodeExist[0].type === "menu" ? true : false;
            logger.debug(`[MENU NODE] Próximo nó é do tipo: ${isNodeExist[0].type}, isMenu: ${isMenu}`);
          } else {
            isMenu = false;
            logger.warn(`[MENU NODE] ⚠️ Nó ${execFn} NÃO ENCONTRADO na lista de nós!`);
          }

          logger.debug(`[MENU NODE] ========== FIM PROCESSAMENTO RESPOSTA ==========`);
        } else {
          // ✅ CORRIGIDO: Verificar se o ticket está "open" antes de enviar Menu
          // EXCEÇÃO: Se o fluxo foi disparado manualmente (isManualTrigger=true), permitir execução mesmo com status "open"
          // Recarregar o ticket para obter o status mais atualizado
          if (idTicket) {
            const currentTicket = await Ticket.findByPk(idTicket);
            if (currentTicket && currentTicket.status === "open" && !isManualTrigger) {
              logger.debug(`[MENU NODE] ⚠️ Ticket ${idTicket} está OPEN - Parando fluxo e não enviando Menu`);
              // Limpar os dados do webhook relacionados ao fluxo
              await currentTicket.update({
                flowWebhook: false,
                lastFlowId: null,
                hashFlowId: null,
                flowStopped: null,
                dataWebhook: null
              });
              return "stopped_by_open_ticket";
            }
            // Atualizar a referência do ticket
            ticket = currentTicket;
          }

          logger.debug(`[MENU NODE] ========== CRIANDO E ENVIANDO MENU ==========`);

          let optionsMenu = "";
          nodeSelected.data.arrayOption.map(item => {
            optionsMenu += `[${item.number}] ${item.value}\n`;
          });
          logger.debug(`[MENU NODE] Opções do menu: ${optionsMenu.trim()}`);

          const menuCreate = `${nodeSelected.data.message}\n\n${optionsMenu}`;
          logger.debug(`[MENU NODE] Menu completo criado com ${nodeSelected.data.arrayOption.length} opções`);

          let msg;
          // ✅ Carregar ticket com relações para interpolação de variáveis ({{queue}}, {{userName}}, etc.)
          const ticketDetailsMenu = await ShowTicketService(ticket.id, companyId);
          if (dataWebhook === "") {
            msg = {
              body: formatBody(menuCreate, ticketDetailsMenu),
              number: numberClient,
              companyId: companyId
            };
          } else {
            const dataLocal = {
              nome: createFieldJsonName,
              numero: numberClient,
              email: createFieldJsonEmail
            };
            msg = {
              body: formatBody(replaceMessages(menuCreate, details, dataWebhook, dataLocal, idTicket), ticketDetailsMenu),
              number: numberClient,
              companyId: companyId
            };
          }

          logger.debug(`[MENU NODE] Mensagem pronta para envio (${msg.body.length} caracteres)`);

          const ticketDetails = await ShowTicketService(ticket.id, companyId);

          const messageData: MessageData = {
            wid: randomString(50),
            ticketId: ticket.id,
            body: msg.body,
            fromMe: true,
            read: true,
            ack: 2,
          };

          logger.debug(`[MENU NODE] Enviando menu via ${whatsapp.channel}...`);

          if (whatsapp.channel === "whatsapp" || whatsapp.channel === "wacalls") {
            await SendWhatsAppMessage({
              body: msg.body,
              ticket: ticketDetails,
              quotedMsg: null
            });
          }

          if (whatsapp.channel === "whatsapp_oficial") {
            await SendWhatsAppOficialMessage({
              body: msg.body,
              ticket: ticketDetails,
              quotedMsg: null,
              type: 'text',
              media: null,
              vCard: null
            });
          }

          logger.debug(`[MENU NODE] ✅ Menu enviado com sucesso!`);

          SetTicketMessagesAsRead(ticketDetails);

          logger.debug(`[TICKET UPDATE] Atualizando lastMessage do ticket ${ticket.id} no menu`);

          await ticketDetails.update({
            lastMessage: formatBody(msg.body, ticketDetails)
          });

          logger.debug(`[TICKET UPDATE] LastMessage atualizada para ticket ${ticket.id} no menu`);

          await intervalWhats("1");

          const ticketIdToRefresh = ticket?.id || idTicket;
          ticket = await getTicketWithWhatsapp(ticketIdToRefresh, whatsappId, companyId);

          if (ticket) {
            logger.debug(`[MENU NODE] ========== CONFIGURANDO TICKET PARA AGUARDAR RESPOSTA ==========`);
            logger.debug(`[MENU NODE] Ticket ID: ${ticket.id}`);
            logger.debug(`[MENU NODE] Status atual: ${ticket.status}`);
            logger.debug(`[MENU NODE] LastFlowId será: ${nodeSelected.id}`);
            logger.debug(`[MENU NODE] HashFlowId: ${hashWebhookId}`);
            logger.debug(`[MENU NODE] FlowStopped: ${idFlowDb}`);

            const updateData = {
              status: "pending",
              queueId: ticket.queueId ? ticket.queueId : null,
              userId: null,
              companyId: companyId,
              flowWebhook: true,
              lastFlowId: nodeSelected.id,
              dataWebhook: dataWebhook,
              hashFlowId: hashWebhookId,
              flowStopped: idFlowDb.toString()
            };

            logger.debug(`[MENU NODE] Dados que serão salvos: ${JSON.stringify(updateData)}`);

            try {
              const updateResult = await ticket.update(updateData);

              logger.debug(`[MENU NODE] ✅ UPDATE EXECUTADO COM SUCESSO!`);
              logger.debug(`[MENU NODE] Ticket após update - ID: ${updateResult.id}`);
              logger.debug(`[MENU NODE] flowWebhook: ${updateResult.flowWebhook}`);
              logger.debug(`[MENU NODE] lastFlowId: ${updateResult.lastFlowId}`);
              logger.debug(`[MENU NODE] hashFlowId: ${updateResult.hashFlowId}`);
              logger.debug(`[MENU NODE] flowStopped: ${updateResult.flowStopped}`);

              // Recarregar do banco para confirmar que foi salvo
              await ticket.reload();
              logger.debug(`[MENU NODE] ========== VERIFICAÇÃO APÓS RELOAD ==========`);
              logger.debug(`[MENU NODE] flowWebhook após reload: ${ticket.flowWebhook}`);
              logger.debug(`[MENU NODE] lastFlowId após reload: ${ticket.lastFlowId}`);
              logger.debug(`[MENU NODE] hashFlowId após reload: ${ticket.hashFlowId}`);
              logger.debug(`[MENU NODE] flowStopped após reload: ${ticket.flowStopped}`);

            } catch (updateError) {
              logger.error(`[MENU NODE] ❌ ERRO AO FAZER UPDATE: ${updateError.message}`);
              logger.error(`[MENU NODE] Stack: ${updateError.stack}`);
            }
          }

          logger.debug(`[MENU NODE] ========== FLUXO PAUSADO - AGUARDANDO RESPOSTA ==========`);
          break;
        }
      }

      let isSwitchFlow: boolean;
      if (nodeSelected.type === "switchFlow") {
        logger.debug(`[SWITCH FLOW] ========== ACIONANDO OUTRO FLUXO ==========`);
        logger.debug(`[SWITCH FLOW] Nó ID: ${nodeSelected.id}`);
        logger.debug(`[SWITCH FLOW] Ticket ID: ${ticket?.id || idTicket}`);

        const data = nodeSelected.data?.flowSelected;

        logger.debug(`[SWITCH FLOW] Dados do fluxo selecionado: ${JSON.stringify(data)}`);

        if (!data) {
          logger.error(`[SWITCH FLOW] ❌ Nenhum fluxo foi selecionado no nó!`);
          break;
        }

        const switchTicketId = ticket?.id || idTicket;
        ticket = await getTicketWithWhatsapp(switchTicketId);

        if (!ticket) {
          logger.error(`[SWITCH FLOW] ❌ Ticket não encontrado!`);
          break;
        }

        logger.debug(`[SWITCH FLOW] Fluxo de destino: ${data?.name || 'N/A'} (ID: ${data?.id || 'N/A'})`);
        logger.debug(`[SWITCH FLOW] Resetando estado do ticket antes de mudar de fluxo`);

        // ✅ IMPORTANTE: Resetar o fluxo atual antes de iniciar o novo
        await ticket.update({
          flowWebhook: false,
          lastFlowId: null,
          hashFlowId: null,
          flowStopped: null,
          dataWebhook: null
        });

        logger.debug(`[SWITCH FLOW] Ticket resetado - iniciando novo fluxo`);

        isSwitchFlow = true;

        try {
          await switchFlow(data, companyId, ticket);
          logger.debug(`[SWITCH FLOW] ✅ Novo fluxo iniciado com sucesso!`);
        } catch (error) {
          logger.error(`[SWITCH FLOW] ❌ Erro ao iniciar novo fluxo: ${error.message}`);
          logger.error(`[SWITCH FLOW] Stack: ${error.stack}`);
        }

        break;
      };

      if (nodeSelected.type === "attendant") {

        const targetUserId = nodeSelected.data?.user?.id;

        const attendantTicketId = ticket?.id || idTicket;
        ticket = await getTicketWithWhatsapp(attendantTicketId);

        if (!ticket) {
          logger.error(`[ATTENDANT NODE] Ticket ${attendantTicketId} não encontrado`);
          break;
        }

        if (!targetUserId) {
          logger.warn(`[ATTENDANT NODE] Nó ${nodeSelected.id} sem atendente configurado - ticket permanece como está`);
          break;
        }

        logger.info(`[ATTENDANT NODE] Atribuindo ticket ${ticket.id} ao atendente ${targetUserId} - status open, encerrando fluxo`);

        // Buscar fila padrão do usuário (se houver) para manter consistência do painel
        let assignedQueueId = ticket.queueId;
        try {
          const targetUser = await require("../../models/User").default.findByPk(targetUserId, {
            include: [{ model: Queue, as: "queues" }]
          });
          if (!assignedQueueId && targetUser?.queues?.length) {
            assignedQueueId = targetUser.queues[0].id;
          }
        } catch (uErr: any) {
          logger.warn(`[ATTENDANT NODE] Não foi possível carregar fila do usuário ${targetUserId}: ${uErr?.message}`);
        }

        // 1) Zerar apenas o estado interno do fluxo (campos que o UpdateTicketService não gerencia).
        //    NÃO atualizamos status/userId aqui — deixamos o UpdateTicketService detectar a
        //    troca de usuário (oldUserId !== newUserId) e disparar a saudação do atendente
        //    (sendUserAcceptanceGreeting).
        await ticket.update({
          useIntegration: false,
          integrationId: null,
          isBot: false,
          flowWebhook: false,
          lastFlowId: null,
          hashFlowId: null,
          flowStopped: null,
          dataWebhook: null
        });

        // 2) Persistir status/userId/queueId via service — ele emite socket e envia a saudação
        //    do atendente automaticamente quando o userId muda para "open".
        try {
          await UpdateTicketService({
            ticketData: {
              status: "open",
              userId: targetUserId,
              queueId: assignedQueueId || null,
              useIntegration: false,
              isBot: false
            },
            ticketId: ticket.id,
            companyId
          });
        } catch (uErr: any) {
          logger.error(`[ATTENDANT NODE] Erro ao chamar UpdateTicketService: ${uErr?.message}`);
        }

        try {
          await CreateLogTicketService({
            ticketId: ticket.id,
            type: "open",
            userId: targetUserId,
            queueId: assignedQueueId || undefined
          });
        } catch (logErr: any) {
          logger.warn(`[ATTENDANT NODE] Falha ao criar log de transferência: ${logErr?.message}`);
        }

        logger.info(`[ATTENDANT NODE] ✅ Ticket ${ticket.id} atribuído ao usuário ${targetUserId} - fila ${assignedQueueId || "nenhuma"} - fluxo encerrado`);

        break;
      };

      // ============================================================
      // NÓ: Distribuição (Round Robin / Menos Ocupado)
      // Escolhe automaticamente um membro (fila OU atendente, conforme
      // configurado no nó) e atribui o ticket a ele — mesmo padrão de
      // atribuição do nó "attendant" acima, só que o alvo é calculado em vez
      // de fixo.
      // ============================================================
      if (nodeSelected.type === "distribution") {
        const distributionTicketId = ticket?.id || idTicket;
        ticket = await getTicketWithWhatsapp(distributionTicketId);

        if (!ticket) {
          logger.error(`[DISTRIBUTION NODE] Ticket ${distributionTicketId} não encontrado`);
          break;
        }

        const target = await pickDistributionTarget({
          nodeData: nodeSelected.data || {},
          nodeId: nodeSelected.id,
          flowId: idFlowDb,
          companyId
        });

        if (!target) {
          logger.warn(`[DISTRIBUTION NODE] Nó ${nodeSelected.id} sem membros configurados - ticket permanece como está`);
          break;
        }

        const distTargetUserId = target.memberType === "user" ? target.id : null;
        const distTargetQueueId = target.memberType === "queue" ? target.id : ticket.queueId;

        logger.info(
          `[DISTRIBUTION NODE] Ticket ${ticket.id} distribuído (${nodeSelected.data?.distributionType || "roundRobin"}) para ${target.memberType} ${target.id}${target.name ? ` (${target.name})` : ""}`
        );

        // Se o usuário desenhou uma conexão saindo do nó "Distribuição"
        // (ex.: Intervalo → Mensagem "Vou te passar para {{queue}}"), o fluxo
        // precisa continuar depois de distribuir — igual ao nó "Setor".
        const distHasNext = connects.some(conn => conn.source === nodeSelected.id);

        await ticket.update({
          useIntegration: false,
          integrationId: null,
          isBot: distHasNext ? ticket.isBot : false,
          flowWebhook: distHasNext,
          lastFlowId: distHasNext ? nodeSelected.id : null,
          hashFlowId: distHasNext ? hashWebhookId : null,
          flowStopped: distHasNext && idFlowDb ? idFlowDb.toString() : null,
          dataWebhook: distHasNext ? ticket.dataWebhook : null
        });

        try {
          await UpdateTicketService({
            ticketData: {
              status: distTargetUserId ? "open" : "pending",
              userId: distTargetUserId,
              queueId: distTargetQueueId || null,
              useIntegration: false,
              isBot: distHasNext ? ticket.isBot : false
            },
            ticketId: ticket.id,
            companyId
          });
        } catch (uErr: any) {
          logger.error(`[DISTRIBUTION NODE] Erro ao chamar UpdateTicketService: ${uErr?.message}`);
        }

        try {
          await CreateLogTicketService({
            ticketId: ticket.id,
            type: distTargetUserId ? "open" : "queue",
            userId: distTargetUserId || undefined,
            queueId: distTargetQueueId || undefined
          });
        } catch (logErr: any) {
          logger.warn(`[DISTRIBUTION NODE] Falha ao criar log de transferência: ${logErr?.message}`);
        }

        if (!distHasNext) {
          logger.info(`[DISTRIBUTION NODE] ✅ Ticket ${ticket.id} atribuído - fluxo encerrado`);
          break;
        }

        // Recarrega o ticket já com a nova fila/usuário para que os próximos
        // nós (ex.: Mensagem com {{queue}} / {{userName}}) usem os dados novos.
        ticket = (await getTicketWithWhatsapp(ticket.id)) || ticket;

        // O próprio fluxo atribuiu o ticket (status "open" quando é usuário).
        // Sem isso, o Intervalo/Mensagem seguintes achariam que um atendente
        // aceitou o ticket e parariam o fluxo.
        if (distTargetUserId) {
          isManualTrigger = true;
        }

        logger.info(`[DISTRIBUTION NODE] ✅ Ticket ${ticket.id} atribuído - continuando para o próximo nó`);
      };

      // ============================================================
      // NÓ: Mover para o Kanban (kanban)
      // Coloca o ticket numa etapa (coluna) do quadro Kanban e SEGUE o
      // fluxo — diferente do nó de distribuição, que encerra. Mover o card
      // é uma ação de organização, normalmente combinada com outras (ex:
      // mover para "Em negociação" e continuar mandando mensagem).
      // ============================================================
      if (nodeSelected.type === "kanban") {
        const kanbanTicketId = ticket?.id || idTicket;
        const kanbanTagId = nodeSelected.data?.tagId;

        if (!kanbanTagId) {
          logger.warn(
            `[KANBAN NODE] Nó ${nodeSelected.id} sem etapa configurada — seguindo o fluxo sem mover o card`
          );
        } else if (!kanbanTicketId) {
          logger.warn(
            `[KANBAN NODE] Sem ticket no contexto — seguindo o fluxo sem mover o card`
          );
        } else {
          try {
            await MoveTicketToKanbanService({
              ticketId: Number(kanbanTicketId),
              companyId,
              tagId: Number(kanbanTagId)
            });
          } catch (kanbanErr: any) {
            // Não interrompe o fluxo: falhar ao organizar o card não deve
            // derrubar um atendimento em andamento.
            logger.error(
              `[KANBAN NODE] Falha ao mover ticket ${kanbanTicketId}: ${kanbanErr?.message}`
            );
          }
        }
        // sem break: o fluxo continua para o próximo nó
      }

      // ============================================================
      // NÓ: Aguardar Resposta do Cliente (waitInput)
      // Pausa o fluxo até o cliente enviar a próxima mensagem.
      // Quando o cliente responde, o listener retorna aqui com pressKey.
      // ============================================================
      if (nodeSelected.type === "waitInput") {
        if (!(await ensureTicket())) continue;

        const varName = nodeSelected.data?.variableName || "lastResponse";
        const reminderEnabled = !!nodeSelected.data?.reminderEnabled;
        const reminderDelayMin = Math.max(1, Number(nodeSelected.data?.reminderDelayMinutes) || 5);
        const reminderMessage = String(nodeSelected.data?.reminderMessage || "").trim();
        const timeoutAfterReminderMin = Math.max(0, Number(nodeSelected.data?.timeoutAfterReminderMinutes) || 0);
        const timeoutAction = String(nodeSelected.data?.timeoutAction || "continueFlow");
        const outgoing = connects.filter(
          c => c.source === nodeSelected.id
        )[0];

        if (pressKey) {
          // Cliente respondeu (ou timeout sintético) — cancelar timers e avançar
          await cancelFlowWaitTimer(ticket.id, nodeSelected.id);
          clearWaitInputTimers(ticket.id, nodeSelected.id);
          const isTimeout = pressKey === "__flow_timeout__";
          const storedValue = isTimeout ? "" : pressKey;
          logger.debug(`[WAIT INPUT NODE] ${isTimeout ? "Timeout do lembrete" : "Cliente respondeu"} no nó ${nodeSelected.id} - avançando`);
          try {
            global.flowVariables = global.flowVariables || {};
            global.flowVariables[`${ticket.id}_${varName}`] = storedValue;
            await ticket.update({
              dataWebhook: {
                ...(ticket.dataWebhook as any || {}),
                [varName]: storedValue,
                waitingInput: false,
                waitInputTimedOut: isTimeout || undefined
              }
            });
          } catch (e: any) {
            logger.warn(`[WAIT INPUT NODE] Falha ao salvar variável ${varName}: ${e?.message}`);
          }
          pressKey = undefined;
          if (outgoing) {
            next = outgoing.target;
            noAlterNext = true;
            logger.debug(`[WAIT INPUT NODE] Próximo nó definido: ${next}`);
          } else {
            // BUG relatado: "pergunta, recebe a resposta e repete a mesma
            // pergunta, não avança pro próximo nó". Sem isso, quando o nó
            // Aguardar Resposta não tem conexão de saída (falta ligar no
            // editor do FlowBuilder), `next` continuava apontando pra ELE
            // MESMO (nada o reatribuía aqui) — o loop reprocessava o mesmo
            // nó, caía no ramo "sem pressKey" logo abaixo e pausava/reenviava
            // a MESMA pergunta de novo, indefinidamente a cada resposta do
            // cliente. Agora encerra o fluxo explicitamente: a resposta já
            // foi salva em waitInputVariable, só não há próximo passo
            // configurado.
            logger.warn(`[WAIT INPUT NODE] ⚠️ Nó ${nodeSelected.id} não tem conexão de saída configurada — encerrando o fluxo em vez de repetir a pergunta. Verifique se falta ligar este nó Aguardar Resposta ao próximo passo no editor do FlowBuilder.`);
            next = "";
            noAlterNext = true;
            if (ticket) {
              await ticket.update({
                flowWebhook: false,
                flowStopped: null,
                lastFlowId: null,
                hashFlowId: null
              });
            }
          }
        } else {
          // Primeira passagem — pausar o fluxo
          logger.debug(`[WAIT INPUT NODE] Pausando fluxo no nó ${nodeSelected.id} - aguardando resposta do cliente`);
          await ticket.update({
            status: "pending",
            flowWebhook: true,
            lastFlowId: nodeSelected.id,
            hashFlowId: hashWebhookId,
            flowStopped: idFlowDb.toString(),
            dataWebhook: {
              ...(ticket.dataWebhook as any || {}),
              waitingInput: true,
              waitInputVariable: varName,
              waitInputTimedOut: false,
              flowId: idFlowDb
            }
          });

          // Agendar lembrete + timeout se habilitado (persistente em DB - sobrevive a restart)
          if (reminderEnabled) {
            const now = Date.now();
            const reminderAt = new Date(now + reminderDelayMin * 60 * 1000);
            const timeoutAt = timeoutAction !== "keepWaiting"
              ? new Date(now + (reminderDelayMin + timeoutAfterReminderMin) * 60 * 1000)
              : null;
            try {
              await scheduleFlowWaitTimer({
                ticketId: ticket.id,
                nodeId: nodeSelected.id,
                companyId,
                whatsappId: whatsapp?.id || whatsappId,
                flowId: idFlowDb,
                hashFlowId: hashWebhookId,
                numberClient,
                reminderMessage,
                reminderAt,
                timeoutAt,
                timeoutAction
              });
              logger.debug(`[WAIT INPUT NODE] Lembrete persistido: ${reminderDelayMin}min${timeoutAction !== "keepWaiting" ? `, ação "${timeoutAction}" em ${reminderDelayMin + timeoutAfterReminderMin}min` : ""}`);
            } catch (schedErr: any) {
              logger.error(`[WAIT INPUT NODE] Falha ao persistir timer: ${schedErr?.message}`);
            }
          }


          break;
        }
      }

      // ============================================================
      // NÓ: Sair / Encerrar Atendimento (exit)
      // Envia mensagem de despedida (opcional) e fecha o ticket.
      // ============================================================
      if (nodeSelected.type === "exit") {
        if (!(await ensureTicket())) continue;

        const farewell = nodeSelected.data?.farewellMessage || nodeSelected.data?.message || "";

        logger.info(`[EXIT NODE] Encerrando atendimento do ticket ${ticket.id}`);

        if (farewell && String(farewell).trim()) {
          try {
            const ticketDetailsExit = await ShowTicketService(ticket.id, companyId);
            const bodyMsg = ticketDetailsExit
              ? formatBody(String(farewell), ticketDetailsExit)
              : String(farewell);

            if (whatsapp?.channel === "whatsapp_oficial") {
              await SendWhatsAppOficialMessage({
                body: bodyMsg,
                ticket,
                quotedMsg: null,
                type: "text",
                media: null,
                vCard: null
              });
            } else if (whatsapp?.channel === "whatsapp") {
              // No Baileys o SendWhatsAppMessage NÃO grava a mensagem: quem
              // grava é o listener quando o WhatsApp devolve o eco
              // (messages.upsert, fromMe=true), o que acontece alguns
              // instantes DEPOIS. Como logo abaixo o ticket é fechado, esse
              // eco chegava com o ticket já "closed" — e o
              // FindOrCreateTicketService não reaproveita ticket fechado,
              // então CRIAVA UM NOVO com a despedida dentro. Era esse o
              // "encerrar abre um ticket novo em vez de encerrar", e o motivo
              // de o nó parecer funcionar só no WhatsApp Plus (lá a gravação
              // é inline e não há eco).
              //
              // Gravando aqui com o wid REAL do envio, a deduplicação por wid
              // no início do handleMessage descarta o eco antes de ele chegar
              // no FindOrCreateTicketService.
              const enviada: any = await SendWhatsAppMessage({
                body: bodyMsg,
                ticket,
                quotedMsg: null
              });

              try {
                await CreateMessageService({
                  messageData: {
                    wid: enviada?.key?.id || `${new Date().getTime()}`,
                    ticketId: ticket.id,
                    body: bodyMsg,
                    fromMe: true,
                    read: true,
                    ack: 2
                  } as any,
                  companyId
                });
              } catch (persistErr: any) {
                logger.warn(`[EXIT NODE] Falha ao gravar a despedida: ${persistErr?.message}`);
              }
            } else {
              await SendMessage(whatsapp, { number: numberClient, body: bodyMsg });
            }
          } catch (sendErr: any) {
            logger.warn(`[EXIT NODE] Falha ao enviar mensagem de despedida: ${sendErr?.message}`);
          }
        }

        // IMPORTANTE: NÃO marcar status="closed" antes de chamar o
        // UpdateTicketService. Ele usa o status anterior (oldStatus) para
        // decidir o fechamento real: quando já chega "closed" ele entra no
        // branch de reabertura (oldStatus === "closed"), pode retornar outro
        // ticket e sair sem fechar de fato / sem emitir o evento de socket —
        // era exatamente por isso que o nó de encerrar não encerrava o
        // atendimento. Aqui só limpamos o estado do fluxo.
        await ticket.update({
          flowWebhook: false,
          lastFlowId: null,
          hashFlowId: null,
          flowStopped: null,
          dataWebhook: null,
          useIntegration: false,
          integrationId: null,
          isBot: false
        });

        try {
          // sendFarewellMessage: false — a despedida deste nó JÁ foi enviada
          // acima. Sem isso o UpdateTicketService mandava também a mensagem de
          // conclusão da conexão e o cliente recebia duas despedidas seguidas.
          //
          // sendRatingMessage: true — precisa ser explícito. Quando
          // sendRatingMessage vem indefinido, o serviço deriva a decisão de
          // sendFarewellMessage (ver linha ~250 do UpdateTicketService); como
          // acabamos de passar false ali, a avaliação seria desligada junto.
          // O pedido de avaliação continua respeitando a configuração da
          // empresa: se userRating estiver desabilitado, nada é enviado.
          await UpdateTicketService({
            ticketData: {
              status: "closed",
              useIntegration: false,
              isBot: false,
              sendFarewellMessage: false,
              sendRatingMessage: true
            },
            ticketId: ticket.id,
            companyId
          });
        } catch (uErr: any) {
          logger.error(`[EXIT NODE] Erro ao chamar UpdateTicketService: ${uErr?.message}`);
        }

        // O UpdateTicketService pode ter colocado o ticket em "nps" (à espera
        // da nota). Recarregamos para o log dizer o estado REAL em que a
        // conversa ficou, em vez de afirmar "encerrado" sempre.
        try {
          await ticket.reload();
        } catch { /* log é best-effort */ }

        // Rede de segurança: se por qualquer motivo o UpdateTicketService não
        // fechou (erro, ticket duplicado, integração), forçamos o fechamento e
        // avisamos o front para remover o ticket das listas.
        if (ticket.status !== "closed" && ticket.status !== "nps") {
          logger.warn(`[EXIT NODE] Ticket ${ticket.id} continuou em "${ticket.status}" após UpdateTicketService — forçando fechamento`);
          await ticket.update({ status: "closed" });
          try {
            getIO()
              .of(String(companyId))
              .emit(`company-${companyId}-ticket`, {
                action: "delete",
                ticketId: ticket.id
              });
          } catch { /* socket é best-effort */ }
        }

        try {
          await CreateLogTicketService({
            ticketId: ticket.id,
            type: "closed"
          });
        } catch {}

        // Destino no Kanban ao encerrar.
        //
        // Antes isso REMOVIA o ticket do Kanban. Mudou: agora o nó de encerrar
        // tem um campo para escolher a etapa de destino (ex.: "Perdido"), que
        // é o comportamento de funil esperado — o atendimento fechado fica
        // arquivado na coluna certa em vez de sumir do quadro.
        //
        // Sem etapa configurada, não mexe no Kanban: quem já usava o nó antes
        // deste campo existir continua com o card onde estava.
        const kanbanDestinoId = nodeSelected.data?.kanbanTagId;
        if (kanbanDestinoId) {
          try {
            await MoveTicketToKanbanService({
              ticketId: ticket.id,
              companyId,
              tagId: Number(kanbanDestinoId),
              // Não manda a saudação da lane aqui: o cliente acabou de receber
              // a despedida do nó, e uma coluna de arquivamento como "Perdido"
              // é classificação interna — mandar "você foi movido para
              // Perdido" seria constrangedor.
              enviarSaudacao: false
            });
          } catch (kbErr: any) {
            logger.warn(
              `[EXIT NODE] Falha ao mover o ticket ${ticket.id} para a etapa ${kanbanDestinoId}: ${kbErr?.message}`
            );
          }
        }

        if (ticket.status === "nps") {
          logger.info(
            `[EXIT NODE] ✅ Ticket ${ticket.id} encerrado e AGUARDANDO AVALIAÇÃO. ` +
              `A próxima mensagem do cliente será tratada como nota, não como novo atendimento.`
          );
        } else {
          logger.info(`[EXIT NODE] ✅ Ticket ${ticket.id} encerrado com sucesso`);
        }
        // Retornar (em vez de apenas `break`) para que quem chamou o fluxo
        // saiba que o atendimento foi encerrado e não siga processando a
        // mensagem (fila/saudação/chatbot), o que reabria o ticket.
        return "ticket_closed";
      }


      let isContinue = false;

      logger.debug(`[FLOW] ========== DETERMINANDO PRÓXIMO NÓ ==========`);
      logger.debug(`[FLOW] PressKey: ${pressKey || 'undefined'}`);
      logger.debug(`[FLOW] ExecCount: ${execCount}`);
      logger.debug(`[FLOW] IsMenu: ${isMenu || false}`);
      logger.debug(`[FLOW] ExecFn: ${execFn || 'undefined'}`);
      logger.debug(`[FLOW] NoAlterNext: ${noAlterNext}`);

      // ✅ FIX IF/ELSE: Se noAlterNext=true, o nó atual (ex: conditionCompare) já processou
      // e definiu o next correto — NÃO sobrescrever com a lógica do pressKey=999
      // ✅ FIX MENU: Removido execCount > 0 — na primeira iteração (execCount=0) o menu já definiu
      // execFn corretamente, mas a condição antiga impedia o uso, causando sempre ir para opção 1
      if (pressKey === "999" && execFn && !noAlterNext && !isMenu) {
        logger.debug(`[FLOW] ========== PROCESSANDO RESPOSTA DO MENU (pressKey=999) ==========`);
        logger.debug(`[FLOW] Definindo próximo nó como execFn: ${execFn} (para processar o nó escolhido pelo menu)`);

        pressKey = undefined;

        // ✅ CORREÇÃO CRÍTICA: avançar para o nó escolhido pelo menu (execFn),
        // NÃO para o sucessor dele. Caso contrário, mensagens encadeadas após um menu
        // (ex.: menu de Informações → mensagem de resposta → encerramento) eram puladas.
        next = execFn;

        // Limpar execFn para evitar reprocessamento do mesmo nó na próxima iteração.
        execFn = "";
        logger.debug(`[FLOW] ✅ Próximo nó definido: ${next} (execFn limpo)`);
      } else if (pressKey === "999" && noAlterNext) {
        // Nó intermediário (ex: conditionCompare) já definiu o next corretamente — apenas limpar pressKey
        logger.debug(`[FLOW] pressKey=999 mas noAlterNext=true — nó já processou e definiu next: ${next}. Limpando pressKey.`);
        pressKey = undefined;
      } else {
        logger.debug(`[FLOW] Determinando próximo nó sem resposta de menu`);
        let result;

        if (isMenu) {
          logger.debug(`[FLOW] ========== PRÓXIMO É OUTRO MENU ==========`);
          result = { target: execFn };
          isContinue = true;
          pressKey = undefined;
          // ✅ CORRIGIDO: Quando isMenu=true, o menu já determinou o próximo nó (execFn)
          // Precisamos atualizar next diretamente, ignorando noAlterNext
          next = execFn;
          logger.debug(`[FLOW] Continuando para menu: ${execFn}`);
        } else if (isSwitchFlow) {
          logger.debug(`[SWITCH FLOW] ========== CÓDIGO LEGADO DE SWITCHFLOW DETECTADO ==========`);
          logger.debug(`[SWITCH FLOW] Este código NÃO deveria ser executado - o switchFlow já foi processado acima`);
          logger.debug(`[SWITCH FLOW] Pulando esta execução para evitar duplicação`);

          // ✅ CORRIGIDO: O switchFlow já foi executado acima, não precisa executar novamente
          // Este código legado será mantido comentado para referência
          /*
          const wbot = await getWbot(whatsapp.id);
          const contact = await Contact.findOne({
            where: {
              id: ticket?.contactId,
              companyId: companyId
            }
          })
          flowBuilderQueue(ticket, msg, wbot, whatsapp, companyId, contact, null);
          */
          break;
        } else if (isRandomizer) {
          isRandomizer = false;
          result = { target: next };
          logger.debug(`[FLOW DEBUG] Randomizer - próximo nó: ${next}`);
        } else if (isConditionCompare) {
          isConditionCompare = false;
          result = { target: next };
          logger.debug(`[FLOW DEBUG] ConditionCompare - próximo nó: ${next}`);
        } else {
          // ✅ CORRIGIDO: Verificar se noAlterNext está ativo antes de buscar nova conexão
          if (noAlterNext) {
            logger.debug(`[FLOW DEBUG] noAlterNext ativo - mantendo next: ${next}`);
            result = { target: next };
          } else {
            result = connects.filter(connect => connect.source === nodeSelected.id)[0];
            logger.debug(`[FLOW DEBUG] Buscando conexão para nó: ${nodeSelected.id}, resultado: ${result ? result.target : 'undefined'}`);
          }
        }

        if (typeof result === "undefined" || !result) {
          logger.warn(`[FLOW DEBUG] Nenhuma conexão encontrada para nó: ${nodeSelected?.id}`);
          next = "";
        } else {
          if (!noAlterNext) {
            next = result.target;
          }
          logger.debug(`[FLOW DEBUG] Próximo nó definido: ${next}`);
        }
      }

      let finalStatus;
      if (nodeSelected?.data?.finalStatus) {
        finalStatus = nodeSelected.data.finalStatus;
      }

      // ✅ CORRIGIDO: Verificar se é realmente o fim do fluxo antes de finalizar
      if (!pressKey && !isContinue) {
        const nextNode = connects.filter(connect => connect.source === nodeSelected.id).length;

        logger.debug(`[FLOW DEBUG] Verificando fim de fluxo - Nó: ${nodeSelected.id}, Conexões: ${nextNode}, Next: ${next}`);

        // ✅ Finalizar quando o nó atual não tem conexões de saída (é terminal),
        // independentemente do valor de `next` (que pode ainda apontar para o próprio nó já processado).
        if (nextNode === 0) {
          if (ticket) {
            ticket = await Ticket.findOne({
              where: { id: ticket.id, whatsappId, companyId: companyId }
            });

            if (ticket) {
              logger.debug(`[TICKET UPDATE] Finalizando fluxo - Ticket ${ticket.id} será resetado (LastFlowId: null, FlowWebhook: false)`);

              await ticket.update({
                lastFlowId: null,
                dataWebhook: null,
                hashFlowId: null,
                flowWebhook: false,
                flowStopped: null,
                useIntegration: null,
                integrationId: null,
                isBot: false,
                amountUsedBotQueues: (ticket.amountUsedBotQueues || 0) + 1
              });

              logger.debug(`[TICKET UPDATE] NO IF - Fluxo finalizado - Ticket ${ticket.id} resetado com sucesso`);
            } else {
              logger.warn(`[TICKET UPDATE] Ticket não encontrado para resetar no IF`);
            }

          } else {
            ticket = await Ticket.findOne({
              where: { id: idTicket, whatsappId, companyId: companyId }
            });

            if (ticket) {
              await ticket.update({
                lastFlowId: null,
                dataWebhook: null,
                hashFlowId: null,
                flowWebhook: false,
                flowStopped: null,
                useIntegration: null,
                integrationId: null,
                isBot: false,
                amountUsedBotQueues: (ticket.amountUsedBotQueues || 0) + 1
              });

              logger.debug(`[TICKET UPDATE] NO ELSE - Fluxo finalizado - Ticket ${idTicket} resetado com sucesso`);
            } else {
              logger.warn(`[TICKET UPDATE] Ticket ${idTicket} não encontrado para resetar no ELSE`);
            }
          }
          break;
        } else if (nextNode > 0 && (!next || next === "")) {
          // ✅ Se há conexões mas next não foi definido, buscar a conexão
          const nextConnection = connects.filter(connect => connect.source === nodeSelected.id)[0];
          if (nextConnection) {
            next = nextConnection.target;
            logger.debug(`[FLOW DEBUG] Next não definido mas há conexões - usando: ${next}`);
          }
        }
      }

      isContinue = false;

      // ✅ CORRIGIDO: Verificar se realmente não há próximo nó antes de finalizar
      if (next === "" || !next) {
        logger.debug(`[FLOW DEBUG] Next está vazio - verificando se deve finalizar fluxo`);

        // Tentar buscar conexão a partir do nó atual
        const possibleConnection = connects.filter(connect => connect.source === nodeSelected.id)[0];

        if (possibleConnection) {
          next = possibleConnection.target;
          logger.debug(`[FLOW DEBUG] Conexão encontrada - continuando para: ${next}`);
        } else {
          // Realmente não há próximo nó - finalizar fluxo
          logger.debug(`[FLOW DEBUG] Nenhuma conexão encontrada - finalizando fluxo`);

          if (ticket || idTicket) {
            ticket = await getTicketWithWhatsapp(ticket?.id || idTicket, whatsappId, companyId);
          }

          if (ticket) {
            logger.debug(`[TICKET UPDATE] Finalizando fluxo disparado - Ticket ${ticket.id} com status final: ${finalStatus}`);
            await finalizeTriggeredFlow(ticket, nodeSelected, companyId, finalStatus);
          }

          break;
        }
      }

      if (idTicket) {
        ticket = await getTicketWithWhatsapp(idTicket, whatsappId, companyId);
      }


      if (!ticket) {
        logger.warn(`[FLOW LOOP] Ticket não encontrado após UPDATE10 - encerrando fluxo`);
        break;
      }

      logger.info(`[FLOW LOOP] Finalizando iteração - Próximo nó: ${next}, NoAlterNext: ${noAlterNext}`);
      logger.debug(`[TICKET UPDATE] Continuando fluxo - Ticket ${ticket.id} - LastFlowId: ${nodeSelected.id}, HashFlowId: ${hashWebhookId}`);

      // ✅ CRÍTICO: Verificar se o próximo nó requer input do usuário
      // Se o próximo nó for do tipo 'menu' ou 'input', então flowStopped = idFlowDb (fluxo esperando input)
      // Caso contrário, flowStopped = null (fluxo executando, não esperando input)
      let flowStoppedValue: string | null = null;
      if (next) {
        const nextNode = nodes.find(node => node.id === next);
        if (nextNode && (nextNode.type === 'menu' || nextNode.type === 'input' || nextNode.type === 'interactiveMenu')) {
          // Próximo nó requer input do usuário - fluxo está esperando
          flowStoppedValue = idFlowDb.toString();
          logger.debug(`[TICKET UPDATE] Próximo nó (${next}) é do tipo ${nextNode.type} - fluxo esperando input do usuário`);
        } else {
          // Próximo nó não requer input - fluxo continuando execução
          flowStoppedValue = null;
          logger.debug(`[TICKET UPDATE] Próximo nó (${next}) é do tipo ${nextNode?.type || 'desconhecido'} - fluxo continuando execução`);
        }
      } else {
        // Não há próximo nó - fluxo finalizado ou continuando
        flowStoppedValue = null;
        logger.debug(`[TICKET UPDATE] Não há próximo nó - fluxo pode estar finalizando`);
      }

      await ticket.update({
        whatsappId: whatsappId,
        queueId: ticket?.queueId,
        userId: ticket?.userId,
        companyId: companyId,
        flowWebhook: true,
        lastFlowId: nodeSelected.id,
        dataWebhook: dataWebhook,
        hashFlowId: hashWebhookId,
        flowStopped: flowStoppedValue
      });

      logger.debug(`[TICKET UPDATE] Ticket ${ticket.id} atualizado para continuar fluxo - FlowStopped: ${flowStoppedValue || 'null'}`);

      noAlterNext = false;
      isMenu = false;
      execFn = undefined;
      execCount++;
      lastProcessedNodeId = nodeSelected?.id || lastProcessedNodeId;

      // 🟢 Realtime: nó concluído com sucesso
      emitFlowNodeEvent({
        companyId,
        flowId: idFlowDb,
        ticketId: idTicket,
        nodeId: nodeSelected?.id,
        nodeType: nodeSelected?.type,
        status: "success"
      });

      logger.info(`[FLOW LOOP] ========== Fim da iteração ${i + 1}/${lengthLoop} ==========`);
    }


    return "ds";
  } catch (error) {
    const errorMessage = error?.message || "Erro desconhecido";

    // 🔴 Realtime: erro no nó atual
    try {
      const failingNode = nodes.find(n => n.id === nextStage);
      emitFlowNodeEvent({
        companyId,
        flowId: idFlowDb,
        ticketId: idTicket,
        nodeId: failingNode?.id || nextStage,
        nodeType: failingNode?.type,
        status: "error",
        errorMessage,
        errorStack: error?.stack
      });
    } catch (_) {}
    const errorStack = error?.stack || "";
    const errorName = error?.name || "UnknownError";

    // Log detalhado para diagnóstico futuro
    logger.error(`[RDS-ERROR-DEBUG] Erro no ActionsWebhookService - Nome: ${errorName}`);
    logger.error(`[RDS-ERROR-DEBUG] Mensagem: ${errorMessage}`);

    // Registrar stack trace apenas em situações não previstas
    if (errorName !== "ValidationError" && errorName !== "NotFoundError") {
      logger.error(`[RDS-ERROR-DEBUG] Stack: ${errorStack.split("\n")[0]}`);
    }

    // Registrar contexto da execução para ajudar na depuração
    logger.error(`[RDS-ERROR-DEBUG] Contexto: Ticket=${idTicket}, nextStage=${nextStage}, nodeType=${nodes.find(n => n.id === nextStage)?.type || "unknown"}`);

    // Manter o log original para compatibilidade
    logger.error("[ActionsWebhookService] Erro geral no serviço:", error);

    if (idTicket) {
      const ticket = await Ticket.findByPk(idTicket);
      if (ticket) {
        await ticket.update({
          flowWebhook: false,
          lastFlowId: null,
          hashFlowId: null,
          flowStopped: null
        });

        logger.info(`[RDS-ERROR-DEBUG] Estado do ticket ${idTicket} resetado após erro`);
      }
    }

    // ⚠️ Contabilizar falha na execução do fluxo
    try {
      if (idFlowDb) {
        await FlowBuilderModel.increment(
          { failureCount: 1 },
          { where: { id: idFlowDb, company_id: companyId } }
        );
        logger.info(`[ACTIONS WEBHOOK] failureCount incrementado para fluxo ${idFlowDb}`);
      }
    } catch (incErr) {
      logger.warn(`[ACTIONS WEBHOOK] Falha ao incrementar failureCount: ${incErr?.message || incErr}`);
    }

  }
};

const switchFlow = async (data: any, companyId: number, ticket: Ticket) => {
  logger.debug(`[SWITCH FLOW FUNC] ========== FUNÇÃO switchFlow INICIADA ==========`);
  logger.debug(`[SWITCH FLOW FUNC] Ticket ID: ${ticket?.id}`);
  logger.debug(`[SWITCH FLOW FUNC] WhatsApp ID: ${ticket?.whatsappId}`);
  logger.debug(`[SWITCH FLOW FUNC] Company ID: ${companyId}`);
  logger.debug(`[SWITCH FLOW FUNC] Fluxo de destino: ${data?.name} (ID: ${data?.id})`);

  try {
    // Verificar se 'data' é o fluxo completo ou apenas o ID
    let flowData = data;

    // Se 'data' for um número ou string, buscar o fluxo
    if (typeof data === 'number' || typeof data === 'string') {
      logger.debug(`[SWITCH FLOW FUNC] Buscando fluxo com ID: ${data}`);
      const flow = await FlowBuilderModel.findOne({
        where: {
          id: data,
          company_id: companyId
        }
      });

      if (!flow) {
        logger.error(`[SWITCH FLOW FUNC] ❌ Fluxo ${data} não encontrado!`);
        return;
      }

      flowData = flow;
    } else if (!data?.flow || !data?.flow?.nodes) {
      logger.error(`[SWITCH FLOW FUNC] ❌ Dados do fluxo inválidos!`);
      return;
    }

    const wbot = await getWbot(ticket?.whatsappId);
    logger.debug(`[SWITCH FLOW FUNC] ✅ WBot obtido com sucesso`);

    const whatsapp = await ShowWhatsAppService(wbot.id || ticket?.whatsappId, companyId);
    logger.debug(`[SWITCH FLOW FUNC] ✅ WhatsApp service obtido - Nome: ${whatsapp.name}`);

    const contact = await Contact.findOne({
      where: {
        id: ticket?.contactId,
        companyId: companyId
      }
    });

    if (!contact) {
      logger.error(`[SWITCH FLOW FUNC] ❌ Contato não encontrado! ContactId: ${ticket?.contactId}`);
      return;
    }

    logger.debug(`[SWITCH FLOW FUNC] ✅ Contato obtido - Nome: ${contact.name}, Número: ${contact.number}`);

    const nodes: INodes[] = flowData.flow["nodes"];
    const connections: IConnections[] = flowData.flow["connections"];

    if (!nodes || nodes.length === 0) {
      logger.error(`[SWITCH FLOW FUNC] ❌ Fluxo não possui nós válidos!`);
      return;
    }

    const mountDataContact = {
      number: contact.number,
      name: contact.name,
      email: contact.email
    };

    logger.debug(`[SWITCH FLOW FUNC] Chamando ActionsWebhookService para iniciar o novo fluxo...`);
    logger.debug(`[SWITCH FLOW FUNC] Total de nós: ${nodes.length}, Primeiro nó: ${nodes[0].id}`);

    // ✅ CORRIGIDO: Chamar diretamente ActionsWebhookService para iniciar um NOVO fluxo
    // (flowBuilderQueue é apenas para CONTINUAR fluxos interrompidos)
    await ActionsWebhookService(
      whatsapp.id,
      flowData.id,
      companyId,
      nodes,
      connections,
      resolveFlowEntryNodeId(nodes, connections), // ✅ começa pelo nó "start" seguindo sua conexão
      null,
      "",
      "",
      null, // Sem pressKey pois não há mensagem do usuário
      ticket.id,
      mountDataContact,
      false // inputResponded = false
    );

    logger.debug(`[SWITCH FLOW FUNC] ✅ Novo fluxo iniciado com sucesso!`);
  } catch (error) {
    logger.error(`[SWITCH FLOW FUNC] ❌ Erro na função switchFlow: ${error.message}`);
    logger.error(`[SWITCH FLOW FUNC] Stack: ${error.stack}`);
    throw error;
  }
};

const constructJsonLine = (line: string, json: any) => {
  let valor = json
  const chaves = line.split(".")

  if (chaves.length === 1) {
    return valor[chaves[0]]
  }

  for (const chave of chaves) {
    valor = valor[chave]
  }
  return valor
};

function removerNaoLetrasNumeros(texto: string) {
  // Substitui todos os caracteres que não são letras ou números por vazio
  return texto.replace(/[^a-zA-Z0-9]/g, "");
}

const sendMessageWhats = async (
  whatsId: number,
  msg: any,
  req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>
) => {
  sendMessageFlow(whatsId, msg, req);
  return Promise.resolve();
};

const makeHttpRequest = async (
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body: any = null,
  queryParams: Array<{ key: string; value: string }> = [],
  timeout: number = 10000
): Promise<any> => {
  try {
    // ✅ VALIDAÇÃO INICIAL MELHORADA DE URL
    if (!url || typeof url !== "string" || url.trim().length === 0) {
      logger.error(`[httpRequestNode] URL vazia ou indefinida. method=${method}`);
      return { error: true, message: "Empty URL", status: 400, data: null };
    }

    let processedUrl = url.trim();

    // ✅ Processar variáveis na URL
    if (global.flowVariables && processedUrl.includes("${")) {
      const regex = /\${([^}]+)}/g;
      processedUrl = processedUrl.replace(regex, (match, varName) => {
        const value = global.flowVariables[varName];
        return value !== undefined ? String(value) : match;
      });
    }

    // ✅ VALIDAÇÃO PÓS-PROCESSAMENTO: Verificar se ainda há variáveis não resolvidas
    if (processedUrl.includes("${") && processedUrl.includes("}")) {
      const unresolvedVars = processedUrl.match(/\${([^}]+)}/g);
      logger.error(`[httpRequestNode] URL contém variáveis não resolvidas: ${unresolvedVars?.join(', ')} - URL: ${processedUrl}`);
      return { error: true, message: "Unresolved variables in URL", status: 400, data: null };
    }

    // ✅ VALIDAÇÃO: Verificar se URL ficou vazia após substituição
    if (!processedUrl || processedUrl.trim().length === 0) {
      logger.error(`[httpRequestNode] URL vazia após substituição de variáveis`);
      return { error: true, message: "Empty URL after variable substitution", status: 400, data: null };
    }

    // Log de diagnóstico do httpRequest
    logger.info(`[httpRequestNode] Preparando requisição: method=${(method || '').toUpperCase()} url=${processedUrl}`);

    if (queryParams) {
      try {
        const paramsArray = Array.isArray(queryParams) ? queryParams : [];

        if (paramsArray.length > 0) {
          // Processar variáveis nos parâmetros de query
          const processedParams = paramsArray.map(param => {
            if (!param || typeof param !== "object") {
              return { key: "", value: "" };
            }

            const key = param.key || "";
            let value = param.value || "";

            if (
              global.flowVariables &&
              typeof value === "string" &&
              value.includes("${")
            ) {
              const regex = /\${([^}]+)}/g;
              value = value.replace(regex, (match, varName) => {
                const replacement = global.flowVariables[varName];

                return replacement !== undefined ? String(replacement) : match;
              });
            }

            return { key, value };
          });

          const queryString = processedParams
            .filter(param => param.key && param.value)
            .map(
              param =>
                `${encodeURIComponent(param.key)}=${encodeURIComponent(
                  param.value
                )}`
            )
            .join("&");

          if (queryString) {
            processedUrl = processedUrl.includes("?")
              ? `${processedUrl}&${queryString}`
              : `${processedUrl}?${queryString}`;
          }
        }
      } catch (error) {
        logger.error(error);
      }
    }

    const processedHeaders: Record<string, string> = { ...headers };
    if (global.flowVariables) {
      Object.keys(processedHeaders).forEach(key => {
        if (processedHeaders[key] && processedHeaders[key].includes("${")) {
          const regex = /\${([^}]+)}/g;
          processedHeaders[key] = processedHeaders[key].replace(
            regex,
            (match, varName) => {
              return global.flowVariables[varName] !== undefined
                ? global.flowVariables[varName]
                : match;
            }
          );
        }
      });
    }

    let processedBody = body;
    try {
      if (
        ["POST", "PUT", "PATCH", "DELETE"].includes(
          method?.toUpperCase() || ""
        ) &&
        body
      ) {
        if (typeof body === "string") {
          if (global.flowVariables && body.includes("${")) {
            const regex = /\${([^}]+)}/g;
            processedBody = body.replace(regex, (match, varName) => {
              const value = global.flowVariables[varName];

              if (value !== undefined) {
                if (typeof value === "string") {
                  return value;
                } else {
                  return JSON.stringify(value);
                }
              }
              return match;
            });
          }

          if (
            processedBody &&
            typeof processedBody === "string" &&
            (processedBody.trim().startsWith("{") ||
              processedBody.trim().startsWith("["))
          ) {
            try {
              processedBody = JSON.parse(processedBody);
            } catch (e) { }
          }
        } else if (
          typeof body === "object" &&
          body !== null &&
          global.flowVariables
        ) {
          const processObject = (obj: any): any => {
            if (obj === null || typeof obj !== "object") {
              return obj;
            }

            if (Array.isArray(obj)) {
              return obj.map(item => processObject(item));
            }

            const result: any = {};
            Object.keys(obj).forEach(key => {
              if (typeof obj[key] === "string" && obj[key].includes("${")) {
                const regex = /\${([^}]+)}/g;
                result[key] = obj[key].replace(regex, (match, varName) => {
                  const value = global.flowVariables[varName];

                  return value !== undefined
                    ? typeof value === "object"
                      ? JSON.stringify(value)
                      : value
                    : match;
                });
              } else if (typeof obj[key] === "object") {
                result[key] = processObject(obj[key]);
              } else {
                result[key] = obj[key];
              }
            });
            return result;
          };

          processedBody = processObject(body);
        }
      }
    } catch (error) {
      logger.error(error);

      processedBody = body;
    }

    // Validação final da URL para evitar exception do axios/new URL
    try {
      // new URL lança se inválida
      // Aceitar apenas http/https
      const u = new URL(processedUrl);
      if (!/^https?:$/.test(u.protocol)) {
        logger.error(`[httpRequestNode] Protocolo não suportado em URL: ${processedUrl}`);
        return { error: true, message: "Unsupported protocol", status: 400 };
      }
    } catch (e) {
      logger.error(`[httpRequestNode] URL inválida: ${processedUrl}`);
      return { error: true, message: "Invalid URL", status: 400 };
    }

    const httpsAgent = new https.Agent({
      rejectUnauthorized: process.env.NODE_ENV === "production"
    });

    const limitedTimeout = Math.min(Math.max(1000, timeout), 45000);

    const config: any = {
      url: processedUrl,
      method: method.toUpperCase(),
      headers: {
        "Content-Type": "application/json",
        ...processedHeaders
      },
      httpsAgent,
      timeout: limitedTimeout
    };

    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()) &&
      processedBody
    ) {
      config.data =
        typeof processedBody === "string"
          ? processedBody
          : JSON.stringify(processedBody);
    }

    const response = await axios(config);

    return {
      data: response.data,
      status: response.status,
      headers: response.headers
    };
  } catch (error) {
    logger.error(
      `Erro na requisição HTTP (${method} ${url}): ${error.message}`
    );

    if (error.response) {
      logger.error(`Resposta de erro com status ${error.response.status}`);
      return {
        data: error.response.data,
        status: error.response.status,
        headers: error.response.headers,
        error: true
      };
    }

    logger.error(`Erro sem resposta do servidor: ${error}`);
    return {
      error: true,
      message: error.message,
      status: 500
    };
  }
};

export const getFlowVariable = (name: string): any => {
  if (!global.flowVariables) {
    global.flowVariables = {};
    return undefined;
  }

  const value = global.flowVariables[name];

  return value;
};

export const setFlowVariable = (name: string, value: any): any => {
  if (!global.flowVariables) {
    global.flowVariables = {};
  }

  global.flowVariables[name] = value;

  const savedValue = global.flowVariables[name];

  return value;
};

const intervalWhats = (time: string) => {
  const seconds = parseInt(time) * 1000;
  return new Promise(resolve => setTimeout(resolve, seconds));
};

const replaceMessages = (
  message: string,
  details: any,
  dataWebhook: any,
  dataNoWebhook?: DataNoWebhook,
  ticketId?: number
) => {
  if (!message) return "";

  try {
    global.flowVariables = global.flowVariables || {};

    const regexNewFormat = /\$\{([^}]+)\}/g;
    let processedMessage = message.replace(regexNewFormat, (match, varName) => {
      let varValue = global.flowVariables[varName];

      // Se temos um ticketId, verificar primeiro a variável específica do ticket
      if (ticketId) {
        const ticketSpecificVar = `${ticketId}_${varName}`;
        const ticketSpecificValue = global.flowVariables[ticketSpecificVar];
        if (ticketSpecificValue !== undefined && ticketSpecificValue !== null) {
          varValue = ticketSpecificValue;
        }
      }

      if (varValue !== undefined) {
        return typeof varValue === "object"
          ? JSON.stringify(varValue)
          : String(varValue);
      }

      return match;
    });

    const matches = processedMessage.match(/\{([^}]+)\}/g);

    if (dataWebhook && dataNoWebhook) {
      let newTxt = processedMessage;
      if (dataNoWebhook.nome) {
        newTxt = newTxt.replace(/{+nome}+/g, dataNoWebhook.nome);
      }
      if (dataNoWebhook.numero) {
        newTxt = newTxt.replace(/{+numero}+/g, dataNoWebhook.numero);
      }
      if (dataNoWebhook.email) {
        newTxt = newTxt.replace(/{+email}+/g, dataNoWebhook.email);
      }

      return newTxt;
    }

    if (matches && matches.includes("inputs")) {
      const placeholders = matches.map(match => match.replace(/\{|\}/g, ""));
      let newText = processedMessage;
      placeholders.map(item => {
        const value = details["inputs"].find(
          itemLocal => itemLocal.keyValue === item
        );
        if (value) {
          const lineToData = details["keysFull"].find(itemLocal =>
            itemLocal.endsWith(`.${value.data}`)
          );
          if (lineToData) {
            const createFieldJson = constructJsonLine(lineToData, dataWebhook);
            newText = newText.replace(`{${item}}`, createFieldJson);
          }
        }
      });
      return newText;
    } else {
      return processedMessage;
    }
  } catch (error) {
    logger.error(`Erro ao processar variáveis: ${error}`);
    return message;
  }
};

export { finalizeTriggeredFlow };
