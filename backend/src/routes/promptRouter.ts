import { Router } from "express";
import * as PromptController from "../controllers/PromptController";
import isAuth from "../middleware/isAuth";
import permissaoDoUsuario from "../middleware/permissaoDoUsuario";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

const promptRoutes = Router();
const checkOpenAi = isPlanFeatureEnabled("useOpenAi");

promptRoutes.get("/prompt", isAuth, checkOpenAi, PromptController.index);

promptRoutes.get("/prompt/token-stats", isAuth, permissaoDoUsuario("showOpenAi"), checkOpenAi, PromptController.tokenStats);

promptRoutes.post("/prompt/test", isAuth, permissaoDoUsuario("showOpenAi"), checkOpenAi, PromptController.testPrompt);

promptRoutes.post("/prompt/preview-voice", isAuth, permissaoDoUsuario("showOpenAi"), checkOpenAi, PromptController.previewVoice);

promptRoutes.post("/prompt", isAuth, permissaoDoUsuario("showOpenAi"), checkOpenAi, PromptController.store);

promptRoutes.post("/prompt/:promptId/duplicate", isAuth, permissaoDoUsuario("showOpenAi"), checkOpenAi, PromptController.duplicate);

promptRoutes.get("/prompt/:promptId", isAuth, checkOpenAi, PromptController.show);

promptRoutes.put("/prompt/:promptId", isAuth, permissaoDoUsuario("showOpenAi"), checkOpenAi, PromptController.update);

promptRoutes.delete("/prompt/:promptId", isAuth, permissaoDoUsuario("showOpenAi"), checkOpenAi, PromptController.remove);

export default promptRoutes;
