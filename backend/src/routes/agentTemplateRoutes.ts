import express from "express";
import isAuth from "../middleware/isAuth";

import * as AgentTemplateController from "../controllers/AgentTemplateController";

const agentTemplateRoutes = express.Router();

agentTemplateRoutes.get("/agent-templates", isAuth, AgentTemplateController.index);
agentTemplateRoutes.get("/agent-templates/:id", isAuth, AgentTemplateController.show);
agentTemplateRoutes.post("/agent-templates", isAuth, AgentTemplateController.store);
agentTemplateRoutes.post("/agent-templates/:id/duplicate", isAuth, AgentTemplateController.duplicate);
agentTemplateRoutes.put("/agent-templates/:id", isAuth, AgentTemplateController.update);
agentTemplateRoutes.delete("/agent-templates/:id", isAuth, AgentTemplateController.remove);

export default agentTemplateRoutes;
