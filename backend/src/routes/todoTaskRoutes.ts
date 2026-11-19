import express from "express";
import isAuth from "../middleware/isAuth";
import * as TodoTaskController from "../controllers/TodoTaskController";

const todoTaskRoutes = express.Router();

todoTaskRoutes.get("/todo-tasks", isAuth, TodoTaskController.index);
todoTaskRoutes.post("/todo-tasks", isAuth, TodoTaskController.store);
todoTaskRoutes.put("/todo-tasks/:todoTaskId", isAuth, TodoTaskController.update);
todoTaskRoutes.delete("/todo-tasks/:todoTaskId", isAuth, TodoTaskController.remove);

export default todoTaskRoutes;
