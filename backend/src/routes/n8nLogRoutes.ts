import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as N8NLogController from "../controllers/N8NLogController";

const n8nLogRoutes = Router();

n8nLogRoutes.get("/n8n-logs", isAuth, N8NLogController.index);
n8nLogRoutes.get("/n8n-logs/stats", isAuth, N8NLogController.stats);
n8nLogRoutes.get("/n8n-logs/:id", isAuth, N8NLogController.show);

export default n8nLogRoutes;
