import { Request, Response } from "express";
import ListTodoTasksService from "../services/TodoTaskServices/ListTodoTasksService";
import CreateTodoTaskService from "../services/TodoTaskServices/CreateTodoTaskService";
import UpdateTodoTaskService from "../services/TodoTaskServices/UpdateTodoTaskService";
import DeleteTodoTaskService from "../services/TodoTaskServices/DeleteTodoTaskService";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const userId = Number(req.user.id);
  const companyId = Number(req.user.companyId);
  const profile = req.user.profile as string;

  const tasks = await ListTodoTasksService({ userId, companyId, profile });

  return res.json({ tasks });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const userId = Number(req.user.id);
  const companyId = Number(req.user.companyId);
  const { title, description, priority, category, dueDate, completed, sortOrder, subtasks, assignedToId, status, notes } = req.body;

  const task = await CreateTodoTaskService({
    title, description, priority, category, dueDate, completed, sortOrder,
    userId, companyId, subtasks,
    assignedToId: assignedToId ? Number(assignedToId) : undefined,
    createdById: userId,
    status: status || "pending",
    notes,
  });

  return res.status(201).json(task);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const userId = Number(req.user.id);
  const companyId = Number(req.user.companyId);
  const profile = req.user.profile as string;
  const { todoTaskId } = req.params;
  const data = req.body;

  const task = await UpdateTodoTaskService({
    id: Number(todoTaskId),
    userId,
    companyId,
    profile,
    ...data,
    assignedToId: data.assignedToId !== undefined ? (data.assignedToId ? Number(data.assignedToId) : null) : undefined,
  });

  return res.json(task);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const userId = Number(req.user.id);
  const companyId = Number(req.user.companyId);
  const profile = req.user.profile as string;
  const { todoTaskId } = req.params;

  await DeleteTodoTaskService({
    id: Number(todoTaskId),
    userId,
    companyId,
    profile,
  });

  return res.status(200).json({ message: "Task deleted" });
};
