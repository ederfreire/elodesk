import AppError from "../../errors/AppError";
import TodoTask from "../../models/TodoTask";
import TodoSubtask from "../../models/TodoSubtask";
import User from "../../models/User";

interface SubtaskData {
  text: string;
  completed?: boolean;
  sortOrder?: number;
}

interface Request {
  title: string;
  description?: string;
  priority?: string;
  category?: string;
  dueDate?: string;
  completed?: boolean;
  sortOrder?: number;
  userId: number;
  companyId: number;
  subtasks?: SubtaskData[];
  assignedToId?: number;
  createdById?: number;
  status?: string;
  notes?: string;
}

const CreateTodoTaskService = async (data: Request): Promise<TodoTask> => {
  if (!data.title) throw new AppError("ERR_TODOTASK_TITLE_REQUIRED");

  const task = await TodoTask.create({
    title: data.title,
    description: data.description || null,
    priority: data.priority || "medium",
    category: data.category || "Geral",
    dueDate: data.dueDate || null,
    completed: data.completed || false,
    sortOrder: data.sortOrder || 0,
    userId: data.userId,
    companyId: data.companyId,
    assignedToId: data.assignedToId || null,
    createdById: data.createdById || data.userId,
    status: data.status || "pending",
    notes: data.notes || null,
  });

  if (data.subtasks && data.subtasks.length > 0) {
    await Promise.all(
      data.subtasks.map((sub, idx) =>
        TodoSubtask.create({
          text: sub.text,
          completed: sub.completed || false,
          sortOrder: sub.sortOrder ?? idx,
          todoTaskId: task.id
        })
      )
    );
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

export default CreateTodoTaskService;
