import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

const checarPlano = isPlanFeatureEnabled("useSalesAgents");

import * as SalesAgentController from "../controllers/SalesAgentController";

const salesAgentRoutes = express.Router();

// Rotas literais ANTES de "/sales-agents/:id", senão "leads" e "dashboard"
// seriam lidos como id.
salesAgentRoutes.get("/sales-agents/leads", isAuth, checarPlano, SalesAgentController.leads);
salesAgentRoutes.get("/sales-agents/dashboard", isAuth, checarPlano, SalesAgentController.dashboard);

salesAgentRoutes.get("/sales-agents/slots", isAuth, checarPlano, SalesAgentController.slots);
salesAgentRoutes.post("/sales-agents/schedule", isAuth, checarPlano, SalesAgentController.schedule);

salesAgentRoutes.get("/sales-agents", isAuth, checarPlano, SalesAgentController.index);
salesAgentRoutes.get("/sales-agents/:id", isAuth, checarPlano, SalesAgentController.show);
salesAgentRoutes.post("/sales-agents", isAuth, checarPlano, SalesAgentController.store);
salesAgentRoutes.post("/sales-agents/:id/duplicate", isAuth, checarPlano, SalesAgentController.duplicate);
salesAgentRoutes.put("/sales-agents/:id", isAuth, checarPlano, SalesAgentController.update);
salesAgentRoutes.delete("/sales-agents/:id", isAuth, checarPlano, SalesAgentController.remove);

export default salesAgentRoutes;
