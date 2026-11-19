import Prompt from "../models/Prompt";
import Queue from "../models/Queue";
import Whatsapp from "../models/Whatsapp";
import { isWithinWorkingHours } from "../services/IntegrationsServices/OpenAiService";
import logger from "../utils/logger";

/**
 * Retorna true se o agente de IA (Prompt) vinculado à fila ou à conexão
 * puder atuar agora. Se o turno do agente estiver desligado, o agente cobre
 * qualquer horário; se estiver ligado, precisa estar dentro do schedule.
 *
 * Quando true, o listener deve permitir que o fluxo continue até o
 * handleOpenAiFlow mesmo que a empresa/fila esteja fora do expediente.
 */
const PromptCoversNow = async (
  whatsapp: Whatsapp | null | undefined,
  queue: Queue | null | undefined,
  ticketPromptId?: string | number | null
): Promise<boolean> => {
  try {
    const promptId =
      ticketPromptId || (queue as any)?.promptId || (whatsapp as any)?.promptId || null;
    if (!promptId) return false;

    const prompt = await Prompt.findByPk(promptId);
    if (!prompt) return false;

    const pv: any = (prompt as any).dataValues || prompt;
    if (pv.active === false) return false;

    return isWithinWorkingHours({
      workingHoursEnabled: pv.workingHoursEnabled,
      workingHoursTimezone: pv.workingHoursTimezone,
      workingHoursSchedule: pv.workingHoursSchedule
    });
  } catch (e: any) {
    logger.warn(`[PromptCoversNow] Falha: ${e?.message}`);
    return false;
  }
};

export default PromptCoversNow;