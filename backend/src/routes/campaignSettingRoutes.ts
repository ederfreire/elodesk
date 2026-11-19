import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as CampaignSettingController from "../controllers/CampaignSettingController";
import multer from "multer";
import uploadConfig from "../config/upload";

const upload = multer(uploadConfig);

const routes = express.Router();
const checkCampaigns = isPlanFeatureEnabled("useCampaigns");

routes.get("/campaign-settings", isAuth, checkCampaigns, CampaignSettingController.index);

routes.post("/campaign-settings", isAuth, checkCampaigns, CampaignSettingController.store);
// routes.put("/campaign-settings/:id", isAuth, checkCampaigns, CampaignSettingController.update);


export default routes;
