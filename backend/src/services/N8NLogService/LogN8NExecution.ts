import N8NLog from "../../models/N8NLog";
import logger from "../../utils/logger";
import { getIO } from "../../libs/socket";

interface LogN8NParams {
  companyId: number;
  nodeType: string;
  webhookUrl?: string;
  ticketId?: number;
  contactId?: number;
  requestPayload?: any;
  responseData?: any;
  errorMessage?: string;
  status: "success" | "error" | "pending";
  duration?: number;
  flowId?: number | string;
  nodeId?: string;
  event?: string;
  mode?: string;
}

export async function logN8NExecution(params: LogN8NParams): Promise<N8NLog | null> {
  try {
    // Embute metadados úteis pra filtragem dentro do payload (sem migração)
    const enrichedPayload = params.requestPayload
      ? {
          ...params.requestPayload,
          __flowId: params.flowId ?? params.requestPayload?.__flowId,
          __nodeId: params.nodeId ?? params.requestPayload?.__nodeId,
          __event: params.event ?? params.requestPayload?.__event,
          __mode: params.mode ?? params.requestPayload?.__mode,
        }
      : params.flowId || params.nodeId || params.event || params.mode
      ? {
          __flowId: params.flowId,
          __nodeId: params.nodeId,
          __event: params.event,
          __mode: params.mode,
        }
      : null;

    const log = await N8NLog.create({
      companyId: params.companyId,
      nodeType: params.nodeType,
      webhookUrl: params.webhookUrl || null,
      ticketId: params.ticketId || null,
      contactId: params.contactId || null,
      requestPayload: enrichedPayload,
      responseData: params.responseData || null,
      errorMessage: params.errorMessage || null,
      status: params.status,
      duration: params.duration || null,
    } as any);

    // Emite em tempo real para o painel de logs do FlowBuilder
    try {
      const io = getIO();
      io.of(`/${params.companyId}`).emit(`company-${params.companyId}-n8n-log`, {
        action: "create",
        log,
      });
    } catch (emitErr) {
      // Socket pode não estar inicializado em testes; ignorar
    }

    return log;
  } catch (err) {
    logger.error(`[N8N LOG] Erro ao salvar log: ${err.message}`);
    return null;
  }
}
