import { Router } from "express";
import * as PromptKnowledgeBaseController from "../controllers/PromptKnowledgeBaseController";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";
import multer from "multer";
import uploadConfig from "../config/upload";

const upload = multer(uploadConfig);
const knowledgeBaseRoutes = Router();
const checkOpenAi = isPlanFeatureEnabled("useOpenAi");

knowledgeBaseRoutes.get("/prompt/:promptId/knowledge", isAuth, checkOpenAi, PromptKnowledgeBaseController.index);
knowledgeBaseRoutes.post("/prompt/:promptId/knowledge", isAuth, checkOpenAi, PromptKnowledgeBaseController.store);
knowledgeBaseRoutes.post("/prompt/:promptId/knowledge/upload", isAuth, checkOpenAi, upload.single("file"), PromptKnowledgeBaseController.storeFile);
knowledgeBaseRoutes.put("/prompt/knowledge/:id", isAuth, checkOpenAi, PromptKnowledgeBaseController.update);
knowledgeBaseRoutes.delete("/prompt/knowledge/:id", isAuth, checkOpenAi, PromptKnowledgeBaseController.remove);

export default knowledgeBaseRoutes;
