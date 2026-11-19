import { Request, Response } from "express";

import LeadSource from "../models/LeadSource";
import Contact from "../models/Contact";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import { QueryTypes } from "sequelize";
import sequelize from "../database";

// Lista usada só quando a empresa ainda não tem nenhuma origem cadastrada.
// Serve para a tela não nascer vazia; a partir daí tudo é editável.
const PADRAO = [
  { name: "Facebook Ads", icon: "facebook", color: "#1877F2", order: 1 },
  { name: "Instagram Ads", icon: "instagram", color: "#E4405F", order: 2 },
  { name: "Messenger Ads", icon: "messenger", color: "#0084FF", order: 3 },
  { name: "Google Ads", icon: "google", color: "#4285F4", order: 4 },
  { name: "TikTok Ads", icon: "tiktok", color: "#010101", order: 5 },
  { name: "YouTube Ads", icon: "youtube", color: "#FF0000", order: 6 },
  { name: "Orgânico", icon: "organic", color: "#22C55E", order: 7 },
  { name: "Indicação", icon: "referral", color: "#8B5CF6", order: 8 },
  { name: "Outro", icon: "other", color: "#64748B", order: 9 }
];

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  let origens = await LeadSource.findAll({
    where: { companyId },
    order: [
      ["order", "ASC"],
      ["id", "ASC"]
    ]
  });

  // Semeia na primeira leitura, e não numa migration: uma migration rodaria
  // uma vez só, e empresas criadas depois nasceriam sem origem nenhuma.
  if (origens.length === 0) {
    await LeadSource.bulkCreate(PADRAO.map(o => ({ ...o, companyId })) as any);
    origens = await LeadSource.findAll({
      where: { companyId },
      order: [
        ["order", "ASC"],
        ["id", "ASC"]
      ]
    });
  }

  return res.status(200).json(origens);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, icon, color, order } = req.body;

  if (!name || !String(name).trim()) {
    throw new AppError("ERR_LEAD_SOURCE_NAME_REQUIRED", 400);
  }

  const origem = await LeadSource.create({
    name: String(name).trim(),
    icon: icon || "other",
    color: color || "#64748b",
    order: Number(order) || 0,
    active: true,
    companyId
  } as any);

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-leadSource`, {
    action: "create",
    leadSource: origem
  });

  return res.status(200).json(origem);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { name, icon, color, order, active } = req.body;

  const origem = await LeadSource.findOne({ where: { id, companyId } });
  if (!origem) throw new AppError("ERR_LEAD_SOURCE_NOT_FOUND", 404);

  await origem.update({
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(icon !== undefined ? { icon } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(order !== undefined ? { order: Number(order) || 0 } : {}),
    ...(active !== undefined ? { active: !!active } : {})
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-leadSource`, {
    action: "update",
    leadSource: origem
  });

  return res.status(200).json(origem);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const origem = await LeadSource.findOne({ where: { id, companyId } });
  if (!origem) throw new AppError("ERR_LEAD_SOURCE_NOT_FOUND", 404);

  // Contact.leadSource guarda o NOME, não o id, então apagar a origem não
  // apaga o histórico: os contatos continuam mostrando de onde vieram.
  await origem.destroy();

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-leadSource`, {
    action: "delete",
    leadSourceId: +id
  });

  return res.status(200).json({ message: "Lead source deleted" });
};

/** Define ou limpa a origem de um contato. */
export const setContactSource = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { contactId } = req.params;
  const { leadSource } = req.body;

  const contato = await Contact.findOne({ where: { id: contactId, companyId } });
  if (!contato) throw new AppError("ERR_NO_CONTACT_FOUND", 404);

  await contato.update({ leadSource: leadSource || null });
  await contato.reload();

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-contact`, {
    action: "update",
    contact: contato
  });

  return res.status(200).json(contato);
};

/**
 * Relatório de origem dos leads.
 *
 * Agrupa por `Contacts.leadSource` — o valor que o atendente escolhe no chip
 * do cabeçalho do atendimento. Conta contatos, atendimentos e conversões.
 *
 * Assim como no relatório de UTM, a conversão é "leads que converteram sobre
 * leads totais", e não "atendimentos encerrados sobre leads": um lead pode
 * abrir vários atendimentos, e a segunda conta passa de 100%.
 *
 * A agregação vem em duas etapas (CTE) pelo mesmo motivo do UTM: juntar
 * Contacts e Tickets num join só e depois usar COUNT(DISTINCT) faz o
 * resultado intermediário virar o produto das duas tabelas.
 */
export const report = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { startDate, endDate } = req.query as any;

  const inicio = startDate || "2000-01-01";
  const fim = endDate || new Date().toISOString().slice(0, 10);

  const linhas = await sequelize.query(
    `
    WITH leads AS (
      SELECT COALESCE(NULLIF(c."leadSource", ''), :semOrigem) AS "origem",
             c."id" AS "contactId"
        FROM "Contacts" c
       WHERE c."companyId" = :companyId
         AND COALESCE(c."isGroup", FALSE) = FALSE
         AND c."createdAt" BETWEEN :inicio AND (:fim::date + INTERVAL '1 day')
    ),
    porOrigem AS (
      SELECT "origem", COUNT(*) AS "leads" FROM leads GROUP BY "origem"
    ),
    atendimentos AS (
      SELECT l."origem",
             COUNT(t."id")                                      AS "tickets",
             COUNT(t."id") FILTER (WHERE t."status" = 'closed')  AS "closedTickets",
             COUNT(DISTINCT t."contactId") FILTER (WHERE t."status" = 'closed') AS "convertedLeads"
        FROM leads l
        JOIN "Tickets" t
          ON t."contactId" = l."contactId"
         AND t."companyId" = :companyId
       GROUP BY l."origem"
    )
    SELECT p."origem",
           p."leads",
           COALESCE(a."tickets", 0)        AS "tickets",
           COALESCE(a."closedTickets", 0)  AS "closedTickets",
           COALESCE(a."convertedLeads", 0) AS "convertedLeads"
      FROM porOrigem p
      LEFT JOIN atendimentos a ON a."origem" = p."origem"
     ORDER BY p."leads" DESC
    `,
    {
      replacements: { companyId, inicio, fim, semOrigem: "__sem_origem__" },
      type: QueryTypes.SELECT
    }
  );

  // Cores e ícones vêm do cadastro de origens, para o relatório usar a mesma
  // identidade visual do chip que o atendente vê no atendimento.
  const cadastradas = await LeadSource.findAll({ where: { companyId } });
  const porNome = new Map(cadastradas.map(o => [o.name, o]));

  const relatorio = (linhas as any[]).map(l => {
    const leads = Number(l.leads) || 0;
    const convertidos = Number(l.convertedLeads) || 0;
    const cadastro = porNome.get(l.origem);

    return {
      source: l.origem,
      icon: cadastro?.icon || "other",
      color: cadastro?.color || "#94a3b8",
      leads,
      tickets: Number(l.tickets) || 0,
      closedTickets: Number(l.closedTickets) || 0,
      convertedLeads: convertidos,
      conversionRate:
        leads > 0 ? Math.round((convertidos / leads) * 1000) / 10 : 0
    };
  });

  return res.status(200).json(relatorio);
};
