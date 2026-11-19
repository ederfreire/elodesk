import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import TodoTask from "../../models/TodoTask";
import TodoSubtask from "../../models/TodoSubtask";
import User from "../../models/User";

interface SubtaskData {
  id?: number;
  text: string;
  completed?: boolean;
  sortOrder?: number;
}

interface Request {
  id: number;
  userId: number;
  companyId: number;
  profile?: string;
  title?: string;
  description?: string;
  priority?: string;
  category?: string;
  dueDate?: string | null;
  completed?: boolean;
  sortOrder?: number;
  subtasks?: SubtaskData[];
  assignedToId?: number | null;
  status?: string;
  notes?: string;
}

const UpdateTodoTaskService = async (data: Request): Promise<TodoTask> => {
  const whereClause: any = { id: data.id, companyId: data.companyId };

  // Admin can update any task in the company
  if (data.profile !== "admin") {
    whereClause[Op.or] = [{ userId: data.userId }, { assignedToId: data.userId }];
  }

  const task = await TodoTask.findOne({ where: whereClause });

  if (!task) throw new AppError("ERR_TODOTASK_NOT_FOUND", 404);

  await task.update({
    title: data.title !== undefined ? data.title : task.title,
    description: data.description !== undefined ? data.description : task.description,
    priority: data.priority !== undefined ? data.priority : task.priority,
    category: data.category !== undefined ? data.category : task.category,
    dueDate: data.dueDate !== undefined ? data.dueDate : task.dueDate,
    completed: data.completed !== undefined ? data.completed : task.completed,
    sortOrder: data.sortOrder !== undefined ? data.sortOrder : task.sortOrder,
    assignedToId: data.assignedToId !== undefined ? data.assignedToId : task.assignedToId,
    status: data.status !== undefined ? data.status : task.status,
    notes: data.notes !== undefined ? data.notes : task.notes,
  });

  // Upsert subtasks if provided
  if (data.subtasks !== undefined) {
    const existingSubtasks = await TodoSubtask.findAll({ where: { todoTaskId: task.id } });
    const incomingIds = data.subtasks.filter(s => s.id).map(s => s.id);

    for (const existing of existingSubtasks) {
      if (!incomingIds.includes(existing.id)) {
        await existing.destroy();
      }
    }

    for (let i = 0; i < data.subtasks.length; i++) {
      const sub = data.subtasks[i];
      if (sub.id) {
        const existing = existingSubtasks.find(e => e.id === sub.id);
        if (existing) {
          await existing.update({
            text: sub.text,
            completed: sub.completed || false,
            sortOrder: sub.sortOrder ?? i
          });
        }
      } else {
        await TodoSubtask.create({
          text: sub.text,
          completed: sub.completed || false,
          sortOrder: sub.sortOrder ?? i,
          todoTaskId: task.id
        });
      }
    }
  }

  await task.reload({
    include: [
      { model: TodoSubtask, as: "subtasks" },
      { model: User, as: "assignedTo", attributes: ["id", "name"] },
      { model: User, as: "createdBy", attributes: ["id", "name"] },
    ]
  });

  return task;
};

export default UpdateTodoTaskService;
