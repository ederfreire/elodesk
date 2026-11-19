import logger from "../../utils/logger";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { ActionsWebhookService } from "./ActionsWebhookService";

/**
 * Retoma um FlowBuilder que estava aguardando resposta de um nó Input.
 * Espelha a lógica de wbotMessageListener.ts (linhas ~7215-7317) para os
 * canais que não passam pelo listener do Baileys (WhatsApp Oficial e
 * Wacalls). Sem isso, ao existirem dois nós Input em sequência, o segundo
 * nunca chega a ser processado — o fluxo fica preso reprocessando o
 * primeiro.
 *
 * Retorna true quando o input foi tratado (o chamador deve encerrar o
 * pipeline). Retorna false quando não havia input pendente (ou não foi
 * possível resumir), para o chamador seguir o fluxo normal.
 */
export const tryResumeFlowInput = async (
  whatsappId: number,
  ticket: Ticket,
  contact: Contact,
  body: string
): Promise<boolean> => {
  const dw: any = ticket.dataWebhook || {};

  const waiting =
    (dw.waitingInput === true && dw.inputVariableName) ||
    (dw.nextNodeId && dw.inputVariableName);

  if (!waiting) return false;

  const hasActiveFlowState = Boolean(
    ticket.flowWebhook ||
    ticket.flowStopped ||
    ticket.lastFlowId ||
    dw.flowId ||
    dw.waitingInput
  );

  // Ticket realmente assumido por humano, sem estado de fluxo ativo: encerra o input.
  // Se estiver "open" por distribuição automática/randômica, mas ainda com FlowBuilder
  // ativo, não pode engolir a resposta — o fluxo precisa continuar.
  if (ticket.status === "open" && !hasActiveFlowState) {
    try {
      await ticket.update({
        dataWebhook: {
          ...dw,
          waitingInput: false,
          inputVariableName: null,
          inputIdentifier: null,
          nextNodeId: null
        }
      });
    } catch (err: any) {
      logger.error(`[INPUT NODE] Erro ao limpar input ticket ${ticket.id}: ${err?.message}`);
    }
    return true;
  }

  try {
    const inputVariableName = dw.inputVariableName;
    const inputIdentifier = dw.inputIdentifier || `${ticket.id}_${inputVariableName}`;

    global.flowVariables = global.flowVariables || {};
    global.flowVariables[inputVariableName] = body;
    global.flowVariables[inputIdentifier] = body;
    global.flowVariables[`${ticket.id}_${inputVariableName}`] = body;

    const nextNode = global.flowVariables[`${inputIdentifier}_next`];
    const fallbackNext = dw.nextNodeId;
    const resolvedNext = nextNode || fallbackNext;

    await ticket.update({
      dataWebhook: {
        ...dw,
        waitingInput: false,
        inputProcessed: true,
        inputVariableName: null,
        inputIdentifier: null,
        lastInputValue: body
      }
    });

    const resolvedFlowId = ticket.flowStopped || dw.flowId;

    if (resolvedNext && resolvedFlowId) {
      const flow = await FlowBuilderModel.findOne({
        where: { id: resolvedFlowId, company_id: ticket.companyId, active: true }
      });

      if (flow) {
        const nodes: any[] = (flow.flow as any)["nodes"];
        const connections: any[] = (flow.flow as any)["connections"];

        await ActionsWebhookService(
          whatsappId,
          parseInt(String(resolvedFlowId)),
          ticket.companyId,
          nodes,
          connections,
          resolvedNext,
          ticket.dataWebhook || {},
          ticket.dataWebhook || {},
          ticket.hashFlowId || "",
          null,
          ticket.id,
          { number: contact.number, name: contact.name, email: contact.email },
          true // inputResponded
        );
        return true;
      }
    }

    logger.warn(`[INPUT NODE] Ticket ${ticket.id}: resume sem flow/next resolvidos (flowId=${resolvedFlowId}, next=${resolvedNext})`);
  } catch (err: any) {
    logger.error(`[INPUT NODE] Falha ao resumir input do ticket ${ticket.id}: ${err?.message}`);
  }

  return false;
};

export default tryResumeFlowInput;
