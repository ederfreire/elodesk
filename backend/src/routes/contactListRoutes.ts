import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";
import uploadConfig from "../config/upload";

import * as ContactListController from "../controllers/ContactListController";
import multer from "multer";

const routes = express.Router();
const checkCampaigns = isPlanFeatureEnabled("useCampaigns");

const upload = multer(uploadConfig);

routes.get("/contact-lists/list", isAuth, checkCampaigns, ContactListController.findList);
routes.get("/contact-lists", isAuth, checkCampaigns, ContactListController.index);
routes.post("/contact-lists/from-contacts", isAuth, checkCampaigns, ContactListController.createFromContacts);
routes.get("/contact-lists/:id", isAuth, checkCampaigns, ContactListController.show);
routes.post("/contact-lists", isAuth, checkCampaigns, ContactListController.store);
routes.post("/contact-lists/:id/upload", isAuth, checkCampaigns, upload.array("file"), ContactListController.upload);
routes.put("/contact-lists/:id", isAuth, checkCampaigns, ContactListController.update);
routes.delete("/contact-lists/:id", isAuth, checkCampaigns, ContactListController.remove);

export default routes;
