import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";
import multer from "multer";
import uploadConfig from "../config/uploadExt";

import * as FlowCampaignController from "../controllers/FlowCampaignController";

const flowCampaignRoutes = express.Router();
const checkFlows = isPlanFeatureEnabled("useFlows");

flowCampaignRoutes.post("/flowcampaign", isAuth, checkFlows, FlowCampaignController.createFlowCampaign);

flowCampaignRoutes.get("/flowcampaign", isAuth, checkFlows, FlowCampaignController.flowCampaigns);

flowCampaignRoutes.get("/flowcampaign/:idFlow", isAuth, checkFlows, FlowCampaignController.flowCampaign);

flowCampaignRoutes.put("/flowcampaign", isAuth, checkFlows, FlowCampaignController.updateFlowCampaign);

flowCampaignRoutes.delete("/flowcampaign/:idFlow", isAuth, checkFlows, FlowCampaignController.deleteFlowCampaign);

export default flowCampaignRoutes;
