import Ticket from "../../models/Ticket";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import logger from "../../utils/logger";

export interface DistributionMember {
  id: number;
  name?: string;
}

export interface DistributionNodeData {
  distributionType?: "roundRobin" | "leastBusy";
  memberType?: "user" | "queue";
  members?: DistributionMember[];
  lastAssignedIndex?: number;
}

export interface DistributionResult {
  memberType: "user" | "queue";
  id: number;
  name?: string;
}

// Conta quantos tickets ABERTOS/PENDENTES cada membro tem agora — usado pelo
// modo "Menos Ocupado". Considera "open" (em atendimento) e "pending"
// (aguardando), do jeito que o resto do sistema já entende "ocupado" (ver
// getCampaignValidMessages/VerifyQueue.ts, que usam o mesmo critério pra
// contar fila).
const countOpenTickets = async (
  companyId: number,
  memberType: "user" | "queue",
  memberId: number
): Promise<number> => {
  const where: any = {
    companyId,
    status: ["open", "pending"],
    isGroup: false
  };
  if (memberType === "user") where.userId = memberId;
  else where.queueId = memberId;

  return Ticket.count({ where });
};

// Achado por leitura-modificação-escrita direto no JSON `flow` do
// FlowBuilder — não existe uma tabela de estado separada pra round robin
// neste projeto, e criar uma só pra isso seria desproporcional ao tamanho
// do recurso. Sob concorrência muito alta (dois tickets batendo nesse nó no
// mesmíssimo milissegundo) o índice pode ocasionalmente repetir um membro
// em vez de girar perfeitamente — aceitável pra distribuição de
// atendimento, que não exige exatidão de fila FIFO.
const persistRoundRobinIndex = async (
  flowId: number,
  companyId: number,
  nodeId: string,
  newIndex: number
): Promise<void> => {
  try {
    const flow = await FlowBuilderModel.findOne({
      where: { id: flowId, company_id: companyId }
    });
    if (!flow || !(flow as any).flow?.nodes) return;

    const flowJson: any = { ...(flow as any).flow };
    flowJson.nodes = flowJson.nodes.map((n: any) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, lastAssignedIndex: newIndex } }
        : n
    );
    await flow.update({ flow: flowJson });
  } catch (err: any) {
    logger.warn(`[DISTRIBUTION] Falha ao persistir índice do round robin (nó ${nodeId}): ${err?.message}`);
  }
};

// Escolhe o próximo membro (fila ou usuário) pra receber o ticket, segundo o
// tipo de distribuição configurado no nó. Usada pelo node type
// "distribution" em ActionsWebhookService.ts.
export const pickDistributionTarget = async ({
  nodeData,
  nodeId,
  flowId,
  companyId
}: {
  nodeData: DistributionNodeData;
  nodeId: string;
  flowId?: number | null;
  companyId: number;
}): Promise<DistributionResult | null> => {
  const memberType = nodeData.memberType === "queue" ? "queue" : "user";
  const members = Array.isArray(nodeData.members) ? nodeData.members.filter(m => m?.id) : [];

  if (members.length === 0) {
    logger.warn(`[DISTRIBUTION] Nó ${nodeId} sem membros configurados`);
    return null;
  }

  if (members.length === 1) {
    return { memberType, id: members[0].id, name: members[0].name };
  }

  if (nodeData.distributionType === "leastBusy") {
    const counts = await Promise.all(
      members.map(async m => ({
        member: m,
        count: await countOpenTickets(companyId, memberType, m.id)
      }))
    );
    counts.sort((a, b) => a.count - b.count);
    const chosen = counts[0].member;
    return { memberType, id: chosen.id, name: chosen.name };
  }

  // Round Robin (padrão): gira pra o próximo índice da lista, dando a volta
  // no final. O índice fica salvo no próprio nó (ver persistRoundRobinIndex)
  // pra continuar de onde parou na próxima execução do fluxo.
  const lastIndex = Number.isInteger(nodeData.lastAssignedIndex) ? (nodeData.lastAssignedIndex as number) : -1;
  const nextIndex = (lastIndex + 1) % members.length;
  const chosen = members[nextIndex];

  if (flowId) {
    await persistRoundRobinIndex(flowId, companyId, nodeId, nextIndex);
  }

  return { memberType, id: chosen.id, name: chosen.name };
};
