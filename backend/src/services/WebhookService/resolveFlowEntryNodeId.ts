import { IConnections, INodes } from "./DispatchWebHookService";

/**
 * Determina o ID do primeiro nó a ser executado num fluxo.
 *
 * Regra:
 *  1) Procura o nó do tipo "start" (nó "Início do fluxo").
 *  2) Segue a conexão de saída dele (source === start.id) e retorna o target.
 *  3) Se não houver nó start OU se ele não tiver conexão de saída, cai no
 *     fallback antigo: nodes[0].id.
 *
 * Isso corrige o bug em que o fluxo começava por um nó aleatório
 * (o primeiro do array JSON), pulando o menu inicial.
 */
export function resolveFlowEntryNodeId(
  nodes: INodes[],
  connections: IConnections[]
): string | null {
  if (!nodes || nodes.length === 0) return null;

  const startNode = nodes.find(
    (n: any) => n?.type === "start" || n?.type === "inicio"
  );

  if (startNode) {
    const conn = (connections || []).find(
      (c) => c.source === startNode.id && !!c.target
    );
    if (conn?.target) {
      const targetExists = nodes.some((n) => n.id === conn.target);
      if (targetExists) return conn.target;
    }
  }

  return nodes[0].id;
}

export default resolveFlowEntryNodeId;
