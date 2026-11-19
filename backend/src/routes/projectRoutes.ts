import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as ProjectController from "../controllers/ProjectController";

const projectRoutes = Router();

projectRoutes.get("/project/download-zip", isAuth, ProjectController.downloadZip);

export default projectRoutes;
