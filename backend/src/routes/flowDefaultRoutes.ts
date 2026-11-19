import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as FlowDefaultController from "../controllers/FlowDefaultController";

const flowDefaultRoutes = express.Router();
const checkFlows = isPlanFeatureEnabled("useFlows");

flowDefaultRoutes.post(
  "/flowdefault",
  isAuth,
  checkFlows,
  FlowDefaultController.createFlowDefault
);

flowDefaultRoutes.put("/flowdefault", isAuth, checkFlows, FlowDefaultController.updateFlow);

flowDefaultRoutes.get("/flowdefault", isAuth, checkFlows, FlowDefaultController.getFlows);

export default flowDefaultRoutes;
