import { Router } from "express";
import isAuth from "../middleware/isAuth";
import permissaoDoUsuario from "../middleware/permissaoDoUsuario";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as QueueIntegrationController from "../controllers/QueueIntegrationController";

const queueIntegrationRoutes = Router();
const checkIntegrations = isPlanFeatureEnabled("useIntegrations");

queueIntegrationRoutes.get("/queueIntegration", isAuth, checkIntegrations, QueueIntegrationController.index);

queueIntegrationRoutes.post("/queueIntegration", isAuth, permissaoDoUsuario("showIntegrations"), checkIntegrations, QueueIntegrationController.store);

queueIntegrationRoutes.get("/queueIntegration/:integrationId", isAuth, checkIntegrations, QueueIntegrationController.show);

queueIntegrationRoutes.put("/queueIntegration/:integrationId", isAuth, permissaoDoUsuario("showIntegrations"), checkIntegrations, QueueIntegrationController.update);

queueIntegrationRoutes.delete("/queueIntegration/:integrationId", isAuth, permissaoDoUsuario("showIntegrations"), checkIntegrations, QueueIntegrationController.remove);

queueIntegrationRoutes.post("/queueIntegration/testsession", isAuth, permissaoDoUsuario("showIntegrations"), checkIntegrations, QueueIntegrationController.testSession);

export default queueIntegrationRoutes;
