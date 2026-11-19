import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as Controller from "../controllers/KanbanBoardController";

const kanbanBoardRoutes = Router();

kanbanBoardRoutes.get("/kanban-boards/templates", isAuth, Controller.templates);
kanbanBoardRoutes.get("/kanban-boards", isAuth, Controller.index);
kanbanBoardRoutes.post("/kanban-boards", isAuth, Controller.store);
kanbanBoardRoutes.put("/kanban-boards/:id", isAuth, Controller.update);
kanbanBoardRoutes.put("/kanban-boards/:id/default", isAuth, Controller.setDefault);
kanbanBoardRoutes.post("/kanban-boards/:id/columns/:tagId", isAuth, Controller.addColumn);
kanbanBoardRoutes.delete("/kanban-boards/:id/columns/:tagId", isAuth, Controller.removeColumn);
kanbanBoardRoutes.delete("/kanban-boards/:id", isAuth, Controller.remove);

export default kanbanBoardRoutes;