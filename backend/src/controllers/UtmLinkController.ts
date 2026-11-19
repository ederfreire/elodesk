import { Request, Response } from "express";
import { QueryTypes } from "sequelize";

import UtmLink from "../models/UtmLink";
import sequelize from "../database";
import AppError from "../errors/AppError";

const gerarCodigo = (): string => {
  // Sem I, O, 0 e 1: o código é lido e digitado por gente montando anúncio,
  // e essas quatro se confundem entre si.
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let saida = "";
  for (let i = 0; i < 6; i += 1) {
    saida += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  }
  return saida;
};

const gerarCodigoUnico = async (): Promise<string> => {
  for (let tentativa = 0; tentativa < 12; tentativa += 1) {
    const codigo = gerarCodigo();
    // eslint-disable-next-line no-await-in-loop
    const existe = await UtmLink.findOne({ where: { code: codigo } });
    if (!existe) return codigo;
  }
  throw new AppError("ERR_UTM_CODE_GENERATION", 500);
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const links = await UtmLink.findAll({
    where: { companyId },
    order: [["id", "DESC"]]
  });

  return res.status(200).json(links);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    name,
    source,
    medium,
    campaign,
    content,
    term,
    whatsappNumber,
    message
  } = req.body;

  if (!name || !String(name).trim()) {
    throw new AppError("ERR_UTM_NAME_REQUIRED", 400);
  }
  if (!source || !String(source).trim()) {
    throw new AppError("ERR_UTM_SOURCE_REQUIRED", 400);
  }

  const code = await gerarCodigoUnico();

  const link = await UtmLink.create({
    name: String(name).trim(),
    source: String(source).trim(),
    medium: medium || null,
    campaign: campaign || null,
    content: content || null,
    term: term || null,
    whatsappNumber: String(whatsappNumber || "").replace(/\D/g, "") || null,
    message: message || null,
    code,
    clicks: 0,
    active: true,
    companyId
  } as any);

  return res.status(200).json(link);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const link = await UtmLink.findOne({ where: { id, companyId } });
  if (!link) throw new AppError("ERR_UTM_NOT_FOUND", 404);

  const campos = [
    "name",
    "source",
    "medium",
    "campaign",
    "content",
    "term",
    "message",
    "active"
  ];
  const dados: any = {};
  campos.forEach(c => {
    if (req.body[c] !== undefined) dados[c] = req.body[c];
  });
  if (req.body.whatsappNumber !== undefined) {
    dados.whatsappNumber = String(req.body.whatsappNumber || "").replace(/\D/g, "");
  }

  // `code` fica de fora de propósito: trocá-lo quebraria os anúncios que já
  // estão no ar com o código antigo.
  await link.update(dados);

  return res.status(200).json(link);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const link = await UtmLink.findOne({ where: { id, companyId } });
  if (!link) throw new AppError("ERR_UTM_NOT_FOUND", 404);

  await link.destroy();

  return res.status(200).json({ message: "UTM link deleted" });
};

/**
 * Relatório de anúncios: leads e atendimentos por link.
 *
 * `leads` conta contatos atribuídos; `tickets` conta atendimentos abertos por
 * esses contatos no período. Os dois números respondem perguntas diferentes —
 * quantas pessoas o anúncio trouxe, e quanta conversa ele gerou.
 */
export const report = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { startDate, endDate } = req.query as any;

  const inicio = startDate || "2000-01-01";
  const fim = endDate || new Date().toISOString().slice(0, 10);

  /*
   * Agregacao em duas etapas, com CTE, em vez de um join triplo.
   *
   * A primeira versao fazia UtmLinks LEFT JOIN Contacts LEFT JOIN Tickets e
   * so entao COUNT(DISTINCT ...). Como cada contato pode ter dezenas de
   * tickets, o resultado intermediario virava o produto das tres tabelas e o
   * Postgres precisava deduplicar tudo isso em memoria — era o que fazia o
   * Relatorio de Anuncios demorar.
   *
   * Aqui os leads sao filtrados primeiro (poucos), os tickets sao agregados
   * por link uma unica vez, e no fim e so juntar dois resultados pequenos.
   */
  const linhas = await sequelize.query(
    `
    WITH leads AS (
      SELECT c."utmLinkId" AS "linkId", c."id" AS "contactId"
        FROM "Contacts" c
       WHERE c."companyId" = :companyId
         AND c."utmLinkId" IS NOT NULL
         AND c."createdAt" BETWEEN :inicio AND (:fim::date + INTERVAL '1 day')
    ),
    porLink AS (
      SELECT "linkId", COUNT(*) AS "leads" FROM leads GROUP BY "linkId"
    ),
    atendimentos AS (
      SELECT l."linkId",
             COUNT(t."id")                                             AS "tickets",
             COUNT(t."id") FILTER (WHERE t."status" = 'closed')         AS "closedTickets",
             COUNT(DISTINCT t."contactId") FILTER (WHERE t."status" = 'closed') AS "convertedLeads"
        FROM leads l
        JOIN "Tickets" t
          ON t."contactId" = l."contactId"
         AND t."companyId" = :companyId
       GROUP BY l."linkId"
    )
    SELECT
      u."id", u."name", u."source", u."medium", u."campaign", u."content",
      u."code", u."clicks",
      COALESCE(p."leads", 0)              AS "leads",
      COALESCE(a."tickets", 0)            AS "tickets",
      COALESCE(a."closedTickets", 0)      AS "closedTickets",
      COALESCE(a."convertedLeads", 0)     AS "convertedLeads"
    FROM "UtmLinks" u
    LEFT JOIN porLink       p ON p."linkId" = u."id"
    LEFT JOIN atendimentos  a ON a."linkId" = u."id"
    WHERE u."companyId" = :companyId
    ORDER BY "leads" DESC, u."id" DESC
    `,
    {
      replacements: { companyId, inicio, fim },
      type: QueryTypes.SELECT
    }
  );

  const relatorio = (linhas as any[]).map(l => ({
    id: l.id,
    name: l.name,
    source: l.source,
    medium: l.medium,
    campaign: l.campaign,
    content: l.content,
    code: l.code,
    clicks: Number(l.clicks) || 0,
    leads: Number(l.leads) || 0,
    tickets: Number(l.tickets) || 0,
    closedTickets: Number(l.closedTickets) || 0,
    convertedLeads: Number(l.convertedLeads) || 0,
    // Percentual calculado aqui e nao na tela: o mesmo numero passa a valer
    // para a exportacao e para qualquer outro consumidor da API.
    conversionRate:
      Number(l.leads) > 0
        ? Math.round((Number(l.convertedLeads) / Number(l.leads)) * 1000) / 10
        : 0
  }));

  return res.status(200).json(relatorio);
};
