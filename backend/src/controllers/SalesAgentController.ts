import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import SalesAgent from "../models/SalesAgent";
import SalesAgentLead from "../models/SalesAgentLead";
import Contact from "../models/Contact";
import sequelize from "../database";
import AppError from "../errors/AppError";
import ListAvailableSlotsService from "../services/SalesAgentService/ListAvailableSlotsService";
import ScheduleFromAgentService from "../services/SalesAgentService/ScheduleFromAgentService";

/** Campos que o agente tenta descobrir por padrão, quando não configurado. */
const CAMPOS_PADRAO = [
  { key: "product", label: "Produto de interesse", required: true, type: "text" },
  // "Valor" NÃO nasce obrigatório: o cliente raramente informa orçamento, e
  // exigi-lo fazia o lead nunca qualificar. Quem quiser exigir, marca na tela.
  { key: "value", label: "Valor / orçamento", required: false, type: "money" },
  { key: "paymentMethod", label: "Forma de pagamento", required: false, type: "text" },
  { key: "purchaseTerm", label: "Prazo de compra", required: false, type: "text" },
  { key: "city", label: "Cidade", required: false, type: "text" }
];

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const agentes = await SalesAgent.findAll({
    where: { companyId },
    order: [["id", "DESC"]]
  });

  return res.status(200).json(agentes);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const agente = await SalesAgent.findOne({ where: { id, companyId } });
  if (!agente) throw new AppError("ERR_SALES_AGENT_NOT_FOUND", 404);

  return res.status(200).json(agente);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const dados = req.body;

  if (!dados?.name || !String(dados.name).trim()) {
    throw new AppError("ERR_SALES_AGENT_NAME_REQUIRED", 400);
  }

  const agente = await SalesAgent.create({
    ...dados,
    name: String(dados.name).trim(),
    // Sem configuração explícita, começa com os campos padrão — tela nova
    // vazia não ajuda ninguém a entender o que o agente faz.
    requiredFields: dados.requiredFields || CAMPOS_PADRAO,
    companyId
  } as any);

  return res.status(200).json(agente);
};

export const duplicate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const original = await SalesAgent.findOne({ where: { id, companyId } });
  if (!original) throw new AppError("ERR_SALES_AGENT_NOT_FOUND", 404);

  const dados: any = original.toJSON();
  delete dados.id;
  delete dados.createdAt;
  delete dados.updatedAt;

  const copia = await SalesAgent.create({
    ...dados,
    name: `${original.name} (cópia)`,
    // Começa pausado: dois agentes ativos qualificariam o mesmo lead em
    // duplicidade. O operador ativa quando quiser.
    active: false,
    companyId
  } as any);

  return res.status(201).json(copia);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const agente = await SalesAgent.findOne({ where: { id, companyId } });
  if (!agente) throw new AppError("ERR_SALES_AGENT_NOT_FOUND", 404);

  // companyId e id nunca vêm do corpo: um payload malicioso poderia mover o
  // agente para outra empresa.
  const { companyId: _c, id: _i, ...dados } = req.body || {};
  await agente.update(dados);

  return res.status(200).json(agente);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const agente = await SalesAgent.findOne({ where: { id, companyId } });
  if (!agente) throw new AppError("ERR_SALES_AGENT_NOT_FOUND", 404);

  await agente.destroy();

  return res.status(200).json({ message: "Sales agent deleted" });
};

/** Leads apurados, com filtro de período e status. */
export const leads = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { startDate, endDate, status, salesAgentId } = req.query as any;

  const where: any = { companyId };
  if (status) where.status = status;
  if (salesAgentId) where.salesAgentId = salesAgentId;

  if (startDate && endDate) {
    where.createdAt = {
      [require("sequelize").Op.between]: [
        `${startDate} 00:00:00`,
        `${endDate} 23:59:59`
      ]
    };
  }

  const lista = await SalesAgentLead.findAll({
    where,
    include: [{ model: Contact, attributes: ["id", "name", "number"] }],
    order: [["createdAt", "DESC"]],
    limit: 500
  });

  return res.status(200).json(lista);
};

/**
 * Painel gerencial: totais por status, por intenção e por produto.
 *
 * Três agregações separadas em vez de uma consulta com vários GROUP BY. Uma
 * consulta só teria de repetir a varredura para cada dimensão ou usar
 * GROUPING SETS, que fica ilegível — e são três consultas rápidas sobre uma
 * tabela indexada por (companyId, createdAt).
 */
export const dashboard = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { startDate, endDate } = req.query as any;

  const inicio = startDate || "2000-01-01";
  const fim = endDate || new Date().toISOString().slice(0, 10);
  const reps = { companyId, inicio, fim };
  const opts = { replacements: reps, type: QueryTypes.SELECT as any };

  const porStatus: any[] = await sequelize.query(
    `SELECT "status", COUNT(*) AS "total"
       FROM "SalesAgentLeads"
      WHERE "companyId" = :companyId
        AND "createdAt" BETWEEN :inicio AND (:fim::date + INTERVAL '1 day')
      GROUP BY "status" ORDER BY 2 DESC`,
    opts
  );

  const porIntencao: any[] = await sequelize.query(
    `SELECT COALESCE(NULLIF("intent", ''), 'nao_informado') AS "intent",
            COUNT(*) AS "total"
       FROM "SalesAgentLeads"
      WHERE "companyId" = :companyId
        AND "createdAt" BETWEEN :inicio AND (:fim::date + INTERVAL '1 day')
      GROUP BY 1 ORDER BY 2 DESC`,
    opts
  );

  const porProduto: any[] = await sequelize.query(
    `SELECT COALESCE(NULLIF("product", ''), 'nao_informado') AS "product",
            COUNT(*) AS "leads",
            COUNT(*) FILTER (WHERE "status" = 'qualificado') AS "qualified",
            COALESCE(SUM("value"), 0) AS "totalValue"
       FROM "SalesAgentLeads"
      WHERE "companyId" = :companyId
        AND "createdAt" BETWEEN :inicio AND (:fim::date + INTERVAL '1 day')
      GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
    opts
  );

  const [totais]: any[] = await sequelize.query(
    `SELECT COUNT(*) AS "total",
            COUNT(*) FILTER (WHERE "status" = 'qualificado')   AS "qualified",
            COUNT(*) FILTER (WHERE "status" = 'desqualificado') AS "disqualified",
            COUNT(*) FILTER (WHERE "transferredAt" IS NOT NULL) AS "transferred",
            COUNT(*) FILTER (WHERE "scheduledAt" IS NOT NULL)   AS "scheduled",
            COALESCE(AVG("value") FILTER (WHERE "value" IS NOT NULL), 0) AS "avgValue"
       FROM "SalesAgentLeads"
      WHERE "companyId" = :companyId
        AND "createdAt" BETWEEN :inicio AND (:fim::date + INTERVAL '1 day')`,
    opts
  );

  const total = Number(totais?.total) || 0;
  const qualificados = Number(totais?.qualified) || 0;

  return res.status(200).json({
    totals: {
      total,
      qualified: qualificados,
      disqualified: Number(totais?.disqualified) || 0,
      transferred: Number(totais?.transferred) || 0,
      scheduled: Number(totais?.scheduled) || 0,
      avgValue: Number(totais?.avgValue) || 0,
      qualificationRate:
        total > 0 ? Math.round((qualificados / total) * 1000) / 10 : 0
    },
    byStatus: porStatus.map(l => ({ status: l.status, total: Number(l.total) })),
    byIntent: porIntencao.map(l => ({ intent: l.intent, total: Number(l.total) })),
    byProduct: porProduto.map(l => ({
      product: l.product,
      leads: Number(l.leads),
      qualified: Number(l.qualified),
      totalValue: Number(l.totalValue)
    }))
  });
};

/** Horários livres para o agente oferecer ao cliente. */
export const slots = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const agente = await SalesAgent.findOne({
    where: { companyId, active: true },
    order: [["id", "ASC"]]
  });

  if (!agente) throw new AppError("ERR_SALES_AGENT_NOT_FOUND", 404);
  if (!agente.schedulingEnabled) return res.status(200).json([]);

  const horarios = await ListAvailableSlotsService({ companyId, agente });

  return res.status(200).json(horarios);
};

/** Cria o evento no horário escolhido. */
export const schedule = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { ticketId, startISO, observacao } = req.body;

  if (!ticketId || !startISO) {
    throw new AppError("ERR_MISSING_PARAMS", 400);
  }

  const resultado = await ScheduleFromAgentService({
    ticketId: +ticketId,
    companyId,
    startISO,
    observacao
  });

  return res.status(200).json(resultado);
};
