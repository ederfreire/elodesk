import { Op } from "sequelize";
import TodoTask from "../../models/TodoTask";
import TodoSubtask from "../../models/TodoSubtask";
import User from "../../models/User";

interface Request {
  userId: number;
  companyId: number;
  profile?: string;
}

const ListTodoTasksService = async ({ userId, companyId, profile }: Request): Promise<TodoTask[]> => {
  const whereClause: any = { companyId };

  if (profile === "admin") {
    // admin sees all company tasks
  } else {
    whereClause[Op.or as any] = [
      { userId },
      { assignedToId: userId }
    ];
  }

  const tasks = await TodoTask.findAll({
    where: whereClause,
    order: [
      ["sortOrder", "ASC"],
      ["createdAt", "DESC"],
      [{ model: TodoSubtask, as: "subtasks" }, "sortOrder", "ASC"]
    ],
    include: [
      { model: TodoSubtask, as: "subtasks" },
      { model: User, as: "assignedTo", attributes: ["id", "name"] },
      { model: User, as: "createdBy", attributes: ["id", "name"] },
    ]
  });

  return tasks;
};

export default ListTodoTasksService;
