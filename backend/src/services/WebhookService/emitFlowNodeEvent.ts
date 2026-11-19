import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";

export type FlowNodeStatus = "start" | "running" | "success" | "error" | "end";

interface EmitFlowNodeParams {
  companyId: number;
  flowId: number | string;
  ticketId?: number;
  nodeId?: string;
  nodeType?: string;
  status: FlowNodeStatus;
  errorMessage?: string;
  errorStack?: string;
  data?: any;
}

/**
 * Emite um evento em tempo real sobre a execução de um nó do FlowBuilder.
 * Consumido pelo editor do FlowBuilder para exibir status (rodando/ok/erro)
 * diretamente sobre os nós do canvas, semelhante ao n8n.
 */
export function emitFlowNodeEvent(params: EmitFlowNodeParams): void {
  try {
    const io = getIO();
    const payload = {
      timestamp: new Date().toISOString(),
      companyId: params.companyId,
      flowId: params.flowId,
      ticketId: params.ticketId ?? null,
      nodeId: params.nodeId ?? null,
      nodeType: params.nodeType ?? null,
      status: params.status,
      errorMessage: params.errorMessage ?? null,
      errorStack: params.errorStack ?? null,
      data: params.data ?? null,
    };

    // Namespace por empresa (padrão usado no restante do projeto)
    io.of(String(params.companyId)).emit(
      `company-${params.companyId}-flow-node`,
      payload
    );
  } catch (err: any) {
    logger.warn(
      `[FLOW NODE EVENT] Falha ao emitir evento: ${err?.message || err}`
    );
  }
}
