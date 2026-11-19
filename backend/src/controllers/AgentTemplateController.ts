import { Request, Response } from "express";
import { Op } from "sequelize";

import AgentTemplate from "../models/AgentTemplate";
import AppError from "../errors/AppError";

/**
 * Módulo de Modelos de Agente.
 *
 * Lista devolve modelos de sistema (companyId null) + os da empresa. Escrita e
 * remoção só valem para os da empresa: um modelo de sistema é intocável — para
 * ajustar, a empresa DUPLICA e edita a cópia.
 */

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { scope } = req.query as any;

  const where: any = {
    [Op.or]: [{ companyId: null }, { companyId }]
  };

  // scope "comercial" também traz os "ambos"; idem para "conversa".
  if (scope && scope !== "ambos") {
    where.scope = { [Op.in]: [scope, "ambos"] };
  }

  const templates = await AgentTemplate.findAll({
    where,
    order: [
      ["isSystem", "DESC"],
      ["sortOrder", "ASC"],
      ["label", "ASC"]
    ]
  });

  return res.status(200).json(templates);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const template = await AgentTemplate.findOne({
    where: { id, [Op.or]: [{ companyId: null }, { companyId }] } as any
  });
  if (!template) throw new AppError("ERR_AGENT_TEMPLATE_NOT_FOUND", 404);

  return res.status(200).json(template);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const dados = req.body || {};

  if (!dados.label || !String(dados.label).trim()) {
    throw new AppError("ERR_AGENT_TEMPLATE_LABEL_REQUIRED", 400);
  }

  // slug da empresa nunca colide com o de sistema porque a unicidade é por
  // (companyId, slug) na prática — geramos um a partir do label se não vier.
  const slug =
    (dados.slug && String(dados.slug).trim()) ||
    String(dados.label)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "modelo";

  const template = await AgentTemplate.create({
    slug,
    label: String(dados.label).trim(),
    description: dados.description || null,
    prompt: dados.prompt || null,
    extractionInstructions: dados.extractionInstructions || null,
    scope: dados.scope || "ambos",
    niche: dados.niche || null,
    isSystem: false,
    active: dados.active !== undefined ? !!dados.active : true,
    sortOrder: dados.sortOrder || 0,
    companyId
  } as any);

  return res.status(201).json(template);
};

/** Duplica qualquer modelo (inclusive de sistema) como um da empresa, editável. */
export const duplicate = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const origem = await AgentTemplate.findOne({
    where: { id, [Op.or]: [{ companyId: null }, { companyId }] } as any
  });
  if (!origem) throw new AppError("ERR_AGENT_TEMPLATE_NOT_FOUND", 404);

  const copia = await AgentTemplate.create({
    slug: `${origem.slug}-copia`,
    label: `${origem.label} (cópia)`,
    description: origem.description,
    prompt: origem.prompt,
    extractionInstructions: origem.extractionInstructions,
    scope: origem.scope,
    niche: origem.niche,
    isSystem: false,
    active: true,
    sortOrder: origem.sortOrder,
    companyId
  } as any);

  return res.status(201).json(copia);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const template = await AgentTemplate.findOne({ where: { id, companyId } });
  if (!template) {
    // Ou não existe, ou é de sistema (companyId null) — que não se edita.
    throw new AppError("ERR_AGENT_TEMPLATE_NOT_EDITABLE", 404);
  }

  const { companyId: _c, id: _i, isSystem: _s, ...dados } = req.body || {};
  await template.update(dados);

  return res.status(200).json(template);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const template = await AgentTemplate.findOne({ where: { id, companyId } });
  if (!template) {
    throw new AppError("ERR_AGENT_TEMPLATE_NOT_EDITABLE", 404);
  }

  await template.destroy();

  return res.status(200).json({ message: "Agent template deleted" });
};
