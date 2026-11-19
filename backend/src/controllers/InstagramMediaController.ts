import { Request, Response } from "express";
import Whatsapp from "../models/Whatsapp";
import { listInstagramMedia } from "../services/FacebookServices/graphAPI";
import AppError from "../errors/AppError";

/**
 * GET /instagram/accounts
 * Lista as contas Instagram conectadas da empresa logada.
 */
export const accounts = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const list = await Whatsapp.findAll({
    where: { companyId, channel: "instagram" },
    attributes: ["id", "name", "facebookPageUserId", "facebookUserToken", "status"]
  });

  return res.json(
    list.map(w => ({
      whatsappId: w.id,
      name: w.name,
      igBusinessId: w.facebookPageUserId,
      status: w.status
    }))
  );
};

/**
 * GET /instagram/media?whatsappId=X&after=cursor&limit=25&q=texto
 * Retorna { items, nextCursor }.
 */
export const media = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { whatsappId, after, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || 25, 50);

  let target: Whatsapp | null = null;
  if (whatsappId) {
    target = await Whatsapp.findOne({
      where: { id: Number(whatsappId), companyId, channel: "instagram" }
    });
  } else {
    target = await Whatsapp.findOne({
      where: { companyId, channel: "instagram" }
    });
  }

  if (!target) {
    throw new AppError("Nenhuma conta Instagram conectada encontrada.", 404);
  }

  if (!target.facebookPageUserId || !target.facebookUserToken) {
    throw new AppError("Conta Instagram sem token/ID válido.", 400);
  }

  const { items, nextCursor } = await listInstagramMedia(
    target.facebookPageUserId,
    target.facebookUserToken,
    limit,
    after ? String(after) : undefined
  );

  const filtered = q
    ? items.filter(it =>
        (it.caption || "").toLowerCase().includes(String(q).toLowerCase())
      )
    : items;

  return res.json({
    items: filtered,
    nextCursor,
    whatsappId: target.id,
    accountName: target.name
  });
};
