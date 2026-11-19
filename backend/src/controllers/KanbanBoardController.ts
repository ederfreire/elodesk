import { Request, Response } from "express";
import * as Svc from "../services/KanbanBoardService/KanbanBoardService";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id, profile } = req.user as any;
  const all = req.query.all === "1" && profile === "admin";
  const boards = await Svc.listBoards(
    { companyId, userId: Number(id) },
    { all }
  );
  return res.json(boards);
};

export const templates = async (_req: Request, res: Response): Promise<Response> => {
  return res.json(Svc.getTemplates());
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id } = req.user;
  const board = await Svc.createBoard({
    ...req.body,
    companyId,
    userId: Number(id)
  });
  return res.status(201).json(board);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id } = req.user;
  const board = await Svc.updateBoard(Number(req.params.id), {
    ...req.body,
    companyId,
    userId: Number(id)
  });
  return res.json(board);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id } = req.user;
  await Svc.deleteBoard(Number(req.params.id), { companyId, userId: Number(id) });
  return res.status(204).send();
};

export const addColumn = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id } = req.user;
  const board = await Svc.addColumnToBoard(
    Number(req.params.id),
    Number(req.params.tagId),
    { companyId, userId: Number(id) }
  );
  return res.json(board);
};

export const removeColumn = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id } = req.user;
  const board = await Svc.removeColumnFromBoard(
    Number(req.params.id),
    Number(req.params.tagId),
    { companyId, userId: Number(id) }
  );
  return res.json(board);
};

export const setDefault = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id } = req.user;
  const board = await Svc.setDefaultBoard(Number(req.params.id), {
    companyId,
    userId: Number(id)
  });
  return res.json(board);
};