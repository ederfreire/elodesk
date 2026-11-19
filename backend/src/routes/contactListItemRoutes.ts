import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as ContactListItemController from "../controllers/ContactListItemController";

const routes = express.Router();
const checkCampaigns = isPlanFeatureEnabled("useCampaigns");

routes.get(
  "/contact-list-items/list",
  isAuth,
  checkCampaigns,
  ContactListItemController.findList
);

routes.get("/contact-list-items", isAuth, checkCampaigns, ContactListItemController.index);

routes.get("/contact-list-items/:id", isAuth, checkCampaigns, ContactListItemController.show);

routes.post("/contact-list-items", isAuth, checkCampaigns, ContactListItemController.store);

routes.put("/contact-list-items/:id", isAuth, checkCampaigns, ContactListItemController.update);

routes.delete(
  "/contact-list-items/:id",
  isAuth,
  checkCampaigns,
  ContactListItemController.remove
);

export default routes;
