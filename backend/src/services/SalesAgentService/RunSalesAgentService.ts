import planoLibera from "../../helpers/planoLibera";
import SalesAgent from "../../models/SalesAgent";
import SalesAgentLead from "../../models/SalesAgentLead";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import QualifyLeadService from "./QualifyLeadService";
import logger from "../../utils/logger";

/**
 * Decide SE vale rodar a qualificação, e roda.
 *
 * O CUSTO É O PROBLEMA CENTRAL
 * Cada execução é uma chamada de IA lendo 30 mensagens. Rodar a cada mensagem
 * recebida multiplicaria o custo por dez em qualquer atendimento normal, e o
 * diagnóstico praticamente não mudaria entre uma mensagem e a seguinte.
 *
 * Três freios, do mais barato ao mais caro de avaliar:
 *
 * 1. Precisa haver agente ativo na empresa.
 * 2. Precisa haver conversa de verdade — pelo menos 3 mensagens do cliente.
 *    Abaixo disso não há o que extrair, só "oi".
 * 3. Intervalo mínimo desde a última execução no mesmo ticket.
 *
 * Ticket já qualificado não roda de novo: o trabalho está feito e reprocessar
 * só gastaria dinheiro.
 */

// Quantas mensagens o cliente precisa mandar antes de o agente avaliar.
// Era fixo em 3, e num teste curto ("quero comprar X") o agente nunca rodava —
// dava a impressão de que a etiqueta não funcionava. Agora dá para baixar por
// variável de ambiente (SALES_AGENT_MIN_MESSAGES=1 para testar).
const MINIMO_MENSAGENS_CLIENTE = Number(process.env.SALES_AGENT_MIN_MESSAGES || 3);
const INTERVALO_MINIMO_MS = 90 * 1000;

const RunSalesAgentService = async (
  ticket: Ticket,
  companyId: number
): Promise<void> => {
  try {
    if (!ticket?.id || ticket.isGroup) return;
    if (!(await planoLibera(companyId, "useSalesAgents"))) return;

    const agente = await SalesAgent.findOne({
      where: { companyId, active: true },
      order: [["id", "ASC"]]
    });
    if (!agente) {
      logger.info(`[SalesAgent] Ticket ${ticket.id}: nenhum agente comercial ATIVO nesta empresa.`);
      return;
    }

    const lead = await SalesAgentLead.findOne({ where: { ticketId: ticket.id } });

    // Já qualificado: encerrado para efeito de processamento.
    if (lead?.status === "qualificado") return;

    if (lead?.updatedAt) {
      const desde = Date.now() - new Date(lead.updatedAt).getTime();
      if (desde < INTERVALO_MINIMO_MS) {
        logger.info(
          `[SalesAgent] Ticket ${ticket.id}: avaliado há ${Math.round(desde / 1000)}s — ` +
          `aguardando o intervalo de ${INTERVALO_MINIMO_MS / 1000}s.`
        );
        return;
      }
    }

    const mensagensCliente = await Message.count({
      where: { ticketId: ticket.id, companyId, fromMe: false }
    });
    if (mensagensCliente < MINIMO_MENSAGENS_CLIENTE) {
      logger.info(
        `[SalesAgent] Ticket ${ticket.id}: ${mensagensCliente} mensagem(ns) do cliente — ` +
        `o agente só avalia a partir de ${MINIMO_MENSAGENS_CLIENTE}. Nada aplicado ainda.`
      );
      return;
    }

    await QualifyLeadService(ticket.id, companyId, agente);
  } catch (err: any) {
    // Qualificação é acessório: nunca pode afetar o recebimento da mensagem.
    logger.warn(`[SalesAgent] Falha ao avaliar ticket ${ticket?.id}: ${err?.message}`);
  }
};

export default RunSalesAgentService;
