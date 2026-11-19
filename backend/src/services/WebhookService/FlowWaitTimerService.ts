import FlowWaitTimer from "../../models/FlowWaitTimer";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import ShowTicketService from "../TicketServices/ShowTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import SendWhatsAppOficialMessage from "../WhatsAppOficial/SendWhatsAppOficialMessage";
import { SendMessage } from "../../helpers/SendMessage";
import formatBody from "../../helpers/Mustache";
import logger from "../../utils/logger";

/**
 * Timers em memória para lembretes/timeouts do nó waitInput.
 * Espelhado a partir de FlowWaitTimers (DB) para permitir cancelamento local.
 * Chave: `${ticketId}_${nodeId}`.
 */
const runtimeTimers: Map<string, NodeJS.Timeout[]> =
  (global as any).__flowWaitRuntimeTimers ||
  ((global as any).__flowWaitRuntimeTimers = new Map());

const key = (ticketId: number, nodeId: string) => `${ticketId}_${nodeId}`;

const clearRuntime = (ticketId: number, nodeId?: string) => {
  for (const k of Array.from(runtimeTimers.keys())) {
    if (k.startsWith(`${ticketId}_`) && (!nodeId || k === key(ticketId, nodeId))) {
      (runtimeTimers.get(k) || []).forEach(t => clearTimeout(t));
      runtimeTimers.delete(k);
    }
  }
};

export const cancelFlowWaitTimer = async (ticketId: number, nodeId?: string) => {
  clearRuntime(ticketId, nodeId);
  try {
    const where: any = { ticketId };
    if (nodeId) where.nodeId = nodeId;
    await FlowWaitTimer.destroy({ where });
  } catch (e: any) {
    logger.warn(`[FlowWaitTimer] Falha ao remover do DB: ${e?.message}`);
  }
};

interface ScheduleParams {
  ticketId: number;
  nodeId: string;
  companyId: number;
  whatsappId: number;
  flowId: number;
  hashFlowId: string;
  numberClient: string;
  reminderMessage: string;
  reminderAt: Date | null;
  timeoutAt: Date | null;
  timeoutAction: string;
}

const sendReminder = async (row: FlowWaitTimer) => {
  try {
    const t = await Ticket.findByPk(row.ticketId);
    if (!t || t.lastFlowId !== row.nodeId || !(t.dataWebhook as any)?.waitingInput) {
      await FlowWaitTimer.destroy({ where: { id: row.id } });
      return;
    }
    const wa = row.whatsappId ? await Whatsapp.findByPk(row.whatsappId) : null;
    const tDetails = await ShowTicketService(row.ticketId, row.companyId);
    const bodyMsg = row.reminderMessage
      ? (tDetails ? formatBody(row.reminderMessage, tDetails) : row.reminderMessage)
      : "Olá, você ainda está aí?";
    if (wa?.channel === "whatsapp_oficial") {
      await SendWhatsAppOficialMessage({
        body: bodyMsg, ticket: tDetails as any, quotedMsg: null,
        type: "text", media: null, vCard: null
      });
    } else if (wa?.channel === "whatsapp") {
      await SendWhatsAppMessage({ body: bodyMsg, ticket: tDetails as any, quotedMsg: null });
    } else if (wa) {
      await SendMessage(wa, { number: row.numberClient, body: bodyMsg });
    }
    await row.update({ reminderSent: true });
  } catch (e: any) {
    logger.warn(`[FlowWaitTimer] reminder erro: ${e?.message}`);
  }
};

const fireTimeout = async (row: FlowWaitTimer) => {
  try {
    const t = await Ticket.findByPk(row.ticketId);
    if (!t || t.lastFlowId !== row.nodeId || !(t.dataWebhook as any)?.waitingInput) {
      await FlowWaitTimer.destroy({ where: { id: row.id } });
      return;
    }

    if (row.timeoutAction === "closeTicket") {
      await t.update({
        status: "closed",
        flowWebhook: false,
        lastFlowId: null,
        hashFlowId: null,
        flowStopped: null,
        dataWebhook: {
          ...(t.dataWebhook as any || {}),
          waitingInput: false,
          waitInputTimedOut: true
        }
      });
      await FlowWaitTimer.destroy({ where: { id: row.id } });
      return;
    }

    // continueFlow: retomar
    const flow = await FlowBuilderModel.findByPk(row.flowId);
    if (!flow?.flow) {
      await FlowWaitTimer.destroy({ where: { id: row.id } });
      return;
    }
    const nodes = (flow.flow as any).nodes || [];
    const connections = (flow.flow as any).connections || [];
    const contact = await Contact.findByPk(t.contactId);
    const mountDataContact: any = contact
      ? { number: contact.number, name: contact.name, email: contact.email }
      : "";

    // dynamic import to avoid circular
    const { ActionsWebhookService } = await import("./ActionsWebhookService");
    await ActionsWebhookService(
      row.whatsappId,
      row.flowId,
      row.companyId,
      nodes,
      connections,
      row.nodeId,
      null,
      "",
      row.hashFlowId,
      "__flow_timeout__",
      row.ticketId,
      mountDataContact
    );
    await FlowWaitTimer.destroy({ where: { id: row.id } });
  } catch (e: any) {
    logger.error(`[FlowWaitTimer] timeout erro: ${e?.message}`);
  }
};

const arm = (row: FlowWaitTimer) => {
  const timers: NodeJS.Timeout[] = [];
  const now = Date.now();

  if (row.reminderAt && !row.reminderSent) {
    const delay = Math.max(0, new Date(row.reminderAt).getTime() - now);
    timers.push(setTimeout(() => sendReminder(row), delay));
  }
  if (row.timeoutAt && row.timeoutAction !== "keepWaiting") {
    const delay = Math.max(0, new Date(row.timeoutAt).getTime() - now);
    timers.push(setTimeout(() => fireTimeout(row), delay));
  }
  if (timers.length) runtimeTimers.set(key(row.ticketId, row.nodeId), timers);
};

export const scheduleFlowWaitTimer = async (params: ScheduleParams) => {
  clearRuntime(params.ticketId, params.nodeId);
  await FlowWaitTimer.destroy({
    where: { ticketId: params.ticketId, nodeId: params.nodeId }
  });
  const row = await FlowWaitTimer.create({
    ticketId: params.ticketId,
    nodeId: params.nodeId,
    companyId: params.companyId,
    whatsappId: params.whatsappId,
    flowId: params.flowId,
    hashFlowId: params.hashFlowId,
    numberClient: params.numberClient,
    reminderMessage: params.reminderMessage,
    reminderAt: params.reminderAt,
    reminderSent: false,
    timeoutAt: params.timeoutAt,
    timeoutAction: params.timeoutAction
  } as any);
  arm(row);
};

/**
 * Restaura todos os timers persistidos ao subir o backend.
 * Deve ser chamado após a inicialização das sessões WhatsApp.
 */
export const restoreFlowWaitTimers = async () => {
  try {
    const rows = await FlowWaitTimer.findAll();
    let count = 0;
    for (const row of rows) {
      const t = await Ticket.findByPk(row.ticketId);
      if (!t || t.lastFlowId !== row.nodeId || !(t.dataWebhook as any)?.waitingInput) {
        await row.destroy();
        continue;
      }
      arm(row);
      count += 1;
    }
    logger.info(`[FlowWaitTimer] Restaurados ${count} timers persistidos`);
  } catch (e: any) {
    logger.error(`[FlowWaitTimer] Falha ao restaurar timers: ${e?.message}`);
  }
};
