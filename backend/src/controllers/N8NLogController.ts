import { Request, Response } from "express";
import N8NLog from "../models/N8NLog";
import { Op } from "sequelize";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { pageNumber = "1", status, nodeType, startDate, endDate } = req.query as any;

  const limit = 20;
  const offset = limit * (parseInt(pageNumber) - 1);

  const where: any = { companyId };

  if (status) where.status = status;
  if (nodeType) where.nodeType = nodeType;
  if (startDate && endDate) {
    where.createdAt = {
      [Op.between]: [new Date(`${startDate}T00:00:00`), new Date(`${endDate}T23:59:59`)]
    };
  }

  const { count, rows } = await N8NLog.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    include: [
      { model: Ticket, as: "ticket", attributes: ["id", "uuid", "status"] },
      { model: Contact, as: "contact", attributes: ["id", "name", "number"] }
    ]
  });

  const hasMore = count > offset + rows.length;

  return res.json({ logs: rows, count, hasMore });
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  const log = await N8NLog.findOne({
    where: { id, companyId },
    include: [
      { model: Ticket, as: "ticket", attributes: ["id", "uuid", "status"] },
      { model: Contact, as: "contact", attributes: ["id", "name", "number"] }
    ]
  });

  if (!log) {
    return res.status(404).json({ error: "Log não encontrado" });
  }

  return res.json(log);
};

export const stats = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { startDate, endDate } = req.query as any;

  const where: any = { companyId };
  if (startDate && endDate) {
    where.createdAt = {
      [Op.between]: [new Date(`${startDate}T00:00:00`), new Date(`${endDate}T23:59:59`)]
    };
  }

  const all = await N8NLog.findAll({ where, attributes: ["status", "nodeType", "duration"] });

  const total = all.length;
  const success = all.filter(l => l.status === "success").length;
  const error = all.filter(l => l.status === "error").length;
  const pending = all.filter(l => l.status === "pending").length;
  const avgDuration = total > 0
    ? Math.round(all.reduce((sum, l) => sum + (l.duration || 0), 0) / total)
    : 0;

  const byNodeType: Record<string, number> = {};
  all.forEach(l => {
    byNodeType[l.nodeType] = (byNodeType[l.nodeType] || 0) + 1;
  });

  return res.json({ total, success, error, pending, avgDuration, byNodeType });
};
