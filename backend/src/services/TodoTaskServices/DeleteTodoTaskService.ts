import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import TodoTask from "../../models/TodoTask";

interface Request {
  id: number;
  userId: number;
  companyId: number;
  profile?: string;
}

const DeleteTodoTaskService = async ({ id, userId, companyId, profile }: Request): Promise<void> => {
  const whereClause: any = { id, companyId };

  if (profile !== "admin") {
    whereClause[Op.or] = [{ userId }, { assignedToId: userId }];
  }

  const task = await TodoTask.findOne({ where: whereClause });

  if (!task) throw new AppError("ERR_TODOTASK_NOT_FOUND", 404);

  await task.destroy();
};

export default DeleteTodoTaskService;
