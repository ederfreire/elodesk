import { Op } from "sequelize";

import SalesAgent from "../../models/SalesAgent";
import SalesAgentLead from "../../models/SalesAgentLead";
import Ticket from "../../models/Ticket";
import TicketTag from "../../models/TicketTag";
import ContactTag from "../../models/ContactTag";
import Tag from "../../models/Tag";
import MoveTicketToKanbanService from "../FlowBuilderService/MoveTicketToKanbanService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowTicketService from "../TicketServices/ShowTicketService";
import ExtractLeadDataService, { DadosExtraidos } from "./ExtractLeadDataService";
import logger from "../../utils/logger";
import { getIO } from "../../libs/socket";

/**
 * Motor de qualificação do Agente Comercial.
 *
 * Fluxo: extrai os dados da conversa → decide o status → executa as ações
 * configuradas (etiqueta, Kanban, transferência) → registra o resultado.
 *
 * TUDO É OPCIONAL E INDEPENDENTE
 * Cada ação só acontece se estiver configurada. Um agente que só etiqueta é
 * válido; um que só move no Kanban também. Nada aqui pressupõe que todas as
 * ações foram preenchidas.
 *
 * FALHA EM UMA AÇÃO NÃO CANCELA AS OUTRAS
 * Se a fila configurada foi apagada, a transferência falha — mas a etiqueta e
 * o Kanban já aconteceram e devem permanecer. Cada ação tem seu próprio
 * try/catch, e o que deu errado vai para o log.
 */

type Status = "pendente" | "qualificado" | "desqualificado" | "em_maturacao";

interface Resultado {
  status: Status;
  dados: DadosExtraidos;
  acoes: string[];
}

/**
 * Decide o status a partir do que foi extraído.
 *
 * A regra é deliberadamente conservadora: só marca DESQUALIFICADO quando o
 * cliente disse claramente que não tem interesse, ou quando o valor está fora
 * da faixa. Marcar desqualificado por falta de informação seria descartar
 * lead que só não terminou de conversar.
 */
const decidirStatus = (agente: SalesAgent, dados: DadosExtraidos): Status => {
  if (dados.intent === "sem_interesse") return "desqualificado";

  // Fora da faixa de valor configurada.
  if (dados.value !== null) {
    const min = agente.minValue !== null && agente.minValue !== undefined ? Number(agente.minValue) : null;
    const max = agente.maxValue !== null && agente.maxValue !== undefined ? Number(agente.maxValue) : null;
    if (min !== null && dados.value < min) return "desqualificado";
    if (max !== null && dados.value > max) return "desqualificado";
  }

  // Todos os campos obrigatórios preenchidos = qualificado.
  const obrigatorios = Array.isArray(agente.requiredFields)
    ? agente.requiredFields.filter((c: any) => c?.required)
    : [];

  const preenchido = (chave: string): boolean => {
    if (["product", "value", "paymentMethod", "purchaseTerm", "city"].includes(chave)) {
      return (dados as any)[chave] !== null && (dados as any)[chave] !== "";
    }
    const v = dados.extraData?.[chave];
    return v !== null && v !== undefined && v !== "";
  };

  const faltando = obrigatorios.filter((c: any) => !preenchido(c.key));

  if (faltando.length === 0 && obrigatorios.length > 0) return "qualificado";

  // INTENÇÃO DE FECHAR QUALIFICA POR SI SÓ.
  //
  // Exigir TODOS os campos obrigatórios travava o recurso na prática: o padrão
  // de fábrica marca "Valor / orçamento" como obrigatório, e cliente quase
  // nunca declara orçamento na conversa. O lead dizia "quero fechar, como
  // faço pra pagar?" e continuava "em maturação" para sempre — a etiqueta
  // nunca era aplicada. Quem diz que quer fechar está qualificado, faltando
  // preencher dado ou não; é assim que um SDR humano trataria.
  if (["pronto", "qualificado"].includes(dados.intent || "")) return "qualificado";

  // Sem campos obrigatórios configurados, basta o lead estar quente.
  if (obrigatorios.length === 0 && ["quente", "pronto", "qualificado"].includes(dados.intent || "")) {
    return "qualificado";
  }

  if (["interessado", "pesquisando"].includes(dados.intent || "")) return "em_maturacao";

  return "pendente";
};

/** Aplica a etiqueta no ticket E no contato — os dois, como pedido. */
const aplicarEtiqueta = async (
  tagId: number,
  ticket: Ticket,
  companyId: number,
  acoes: string[]
): Promise<void> => {
  try {
    const tag = await Tag.findOne({ where: { id: tagId, companyId } });
    if (!tag) return;

    const jaNoTicket = await TicketTag.findOne({ where: { ticketId: ticket.id, tagId } });
    if (!jaNoTicket) {
      await TicketTag.create({ ticketId: ticket.id, tagId });
      acoes.push(`etiqueta "${tag.name}" no atendimento`);
    }

    if (ticket.contactId) {
      const jaNoContato = await ContactTag.findOne({
        where: { contactId: ticket.contactId, tagId }
      });
      if (!jaNoContato) {
        await ContactTag.create({ contactId: ticket.contactId, tagId });
        acoes.push(`etiqueta "${tag.name}" no contato`);
      }
    }
  } catch (err: any) {
    logger.warn(`[SalesAgent] Falha ao aplicar etiqueta ${tagId}: ${err?.message}`);
  }
};

const QualifyLeadService = async (
  ticketId: number,
  companyId: number,
  agente: SalesAgent
): Promise<Resultado | null> => {
  const acoes: string[] = [];

  try {
    const ticket = await ShowTicketService(ticketId, companyId);
    if (!ticket) return null;

    const dados = await ExtractLeadDataService(ticket, agente, companyId);
    const status = decidirStatus(agente, dados);

    // Por que qualificou (ou não): sem isto, "a etiqueta não funciona" não
    // tinha como ser diagnosticado — o serviço decidia em silêncio.
    const obrigatoriosLog = Array.isArray(agente.requiredFields)
      ? agente.requiredFields.filter((c: any) => c?.required).map((c: any) => c.key)
      : [];
    const faltandoLog = obrigatoriosLog.filter((chave: string) => {
      if (["product", "value", "paymentMethod", "purchaseTerm", "city"].includes(chave)) {
        return (dados as any)[chave] === null || (dados as any)[chave] === "";
      }
      const v = (dados as any).extraData?.[chave];
      return v === null || v === undefined || v === "";
    });
    logger.info(
      `[SalesAgent] Ticket ${ticketId}: status=${status} | intenção=${dados.intent || "-"} | ` +
      `obrigatórios=[${obrigatoriosLog.join(", ") || "nenhum"}] | faltando=[${faltandoLog.join(", ") || "nada"}] | ` +
      `etiqueta configurada=${agente.qualifiedTagId || "nenhuma"}`
    );

    // ── REGISTRO ────────────────────────────────────────────────────────
    // upsert por ticketId (índice único): reprocessar a conversa atualiza a
    // mesma linha em vez de duplicar o lead no relatório.
    const existente = await SalesAgentLead.findOne({ where: { ticketId } });

    const camposLead: any = {
      salesAgentId: agente.id,
      ticketId,
      contactId: ticket.contactId,
      companyId,
      product: dados.product,
      value: dados.value,
      paymentMethod: dados.paymentMethod,
      purchaseTerm: dados.purchaseTerm,
      city: dados.city,
      intent: dados.intent,
      temperature: dados.temperature,
      objections: dados.objections,
      extraData: dados.extraData,
      status
    };

    // qualifiedAt só na PRIMEIRA vez que qualifica: é o carimbo de quando o
    // lead virou oportunidade, e sobrescrever apagaria o tempo de resposta.
    const jaEraQualificado = existente?.status === "qualificado";
    if (status === "qualificado" && !jaEraQualificado) {
      camposLead.qualifiedAt = new Date();
    }

    const lead = existente
      ? await existente.update(camposLead)
      : await SalesAgentLead.create(camposLead);

    // Já estava qualificado antes: nada de reexecutar as ações. Sem isso,
    // cada mensagem nova reaplicaria etiqueta e transferiria o ticket de
    // novo, tirando-o do atendente que já estava cuidando.
    if (status === "qualificado" && jaEraQualificado) {
      return { status, dados, acoes };
    }

    // ── AÇÕES ───────────────────────────────────────────────────────────
    if (status === "qualificado") {
      if (agente.qualifiedTagId) {
        await aplicarEtiqueta(agente.qualifiedTagId, ticket, companyId, acoes);
      }

      if (agente.qualifiedKanbanTagId) {
        try {
          await MoveTicketToKanbanService({
            ticketId,
            companyId,
            tagId: agente.qualifiedKanbanTagId,
            enviarSaudacao: false
          });
          acoes.push("movido no Kanban");
        } catch (err: any) {
          logger.warn(`[SalesAgent] Falha ao mover no Kanban: ${err?.message}`);
        }
      }

      if (agente.transferOnQualify && (agente.qualifiedQueueId || agente.qualifiedUserId)) {
        try {
          await UpdateTicketService({
            ticketId,
            companyId,
            ticketData: {
              ...(agente.qualifiedQueueId ? { queueId: agente.qualifiedQueueId } : {}),
              ...(agente.qualifiedUserId ? { userId: agente.qualifiedUserId } : {}),
              // "pending" e não "open": quem recebe precisa aceitar o
              // atendimento. Abrir direto no nome de alguém faz o ticket
              // sumir da fila sem ninguém ter visto.
              status: "pending"
            } as any
          });
          await lead.update({ transferredAt: new Date() });
          acoes.push("transferido para atendimento humano");
        } catch (err: any) {
          logger.warn(`[SalesAgent] Falha ao transferir: ${err?.message}`);
        }
      }
    }

    if (status === "desqualificado") {
      if (agente.disqualifiedTagId) {
        await aplicarEtiqueta(agente.disqualifiedTagId, ticket, companyId, acoes);
      }
      if (agente.disqualifiedKanbanTagId) {
        try {
          await MoveTicketToKanbanService({
            ticketId,
            companyId,
            tagId: agente.disqualifiedKanbanTagId,
            enviarSaudacao: false
          });
          acoes.push("movido no Kanban");
        } catch (err: any) {
          logger.warn(`[SalesAgent] Falha ao mover no Kanban: ${err?.message}`);
        }
      }
    }

    if (acoes.length > 0) {
      logger.info(
        `[SalesAgent] Ticket ${ticketId} -> ${status}. Ações: ${acoes.join(", ")}`
      );

      // Atualiza a tela de quem estiver com o atendimento aberto.
      try {
        const atualizado = await ShowTicketService(ticketId, companyId);
        getIO().of(String(companyId)).emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket: atualizado
        });
      } catch {
        // Emissão é acessório.
      }
    }

    return { status, dados, acoes };
  } catch (err: any) {
    logger.error(`[SalesAgent] Erro ao qualificar ticket ${ticketId}: ${err?.message}`);
    return null;
  }
};

export default QualifyLeadService;
