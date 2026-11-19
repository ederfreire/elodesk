import { isNil } from "lodash";
import Prompt from "../models/Prompt";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import logger from "../utils/logger";

/**
 * Aplica no ticket o agente de IA vinculado a uma fila.
 * 1) Tenta Queue.promptId.
 * 2) Fallback: Prompt cadastrado apontando para esta fila (Prompt.queueId).
 * Não sobrescreve se o ticket já tem promptId.
 */
const ApplyQueueAiAgent = async (
  queueOrId: Queue | number,
  ticket: Ticket
): Promise<boolean> => {
  try {
    if (!ticket || !isNil(ticket.promptId)) return false;

    const companyId = ticket.companyId;
    let queueRecord: any = queueOrId as any;
    let queueId: number | null = null;

    if (typeof queueOrId === "number") {
      queueId = queueOrId;
      queueRecord = await Queue.findOne({
        where: { id: queueId, companyId }
      });
    } else if (queueOrId) {
      queueId = queueOrId.id;
    }

    if (!queueRecord && !queueId) return false;

    let promptOfQueue: Prompt | null = null;

    const queuePromptId = queueRecord?.promptId ?? null;
    if (queuePromptId) {
      promptOfQueue = await Prompt.findOne({
        where: { id: queuePromptId, companyId }
      });
    }

    if (!promptOfQueue && queueId) {
      promptOfQueue = await Prompt.findOne({
        where: { queueId, companyId }
      });
    }

    if (!promptOfQueue) return false;

    if ((promptOfQueue as any).active === false) {
      logger.info(
        `[ApplyQueueAiAgent] Prompt ${promptOfQueue.id} inativo - não aplicado ao ticket ${ticket.id}`
      );
      return false;
    }

    await ticket.update({
      promptId: promptOfQueue.id,
      aiModel:
        (promptOfQueue as any).aiModel ||
        ticket.aiModel ||
        "gpt-4.1-mini",
      useIntegration: true
    });
    await ticket.reload();

    logger.info(
      `[ApplyQueueAiAgent] Agente de IA aplicado ao ticket ${ticket.id} via fila ${queueId} (prompt ${promptOfQueue.id})`
    );
    return true;
  } catch (err) {
    logger.error(`[ApplyQueueAiAgent] Falha: ${err}`);
    return false;
  }
};

export default ApplyQueueAiAgent;