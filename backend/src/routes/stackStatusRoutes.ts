import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as StackStatusController from "../controllers/StackStatusController";

const stackStatusRoutes = Router();

stackStatusRoutes.get("/stack-status", isAuth, isSuper, StackStatusController.list);
stackStatusRoutes.get("/stack-status/:service/logs", isAuth, isSuper, StackStatusController.logs);
stackStatusRoutes.post("/stack-status/:service/restart", isAuth, isSuper, StackStatusController.restart);

export default stackStatusRoutes;