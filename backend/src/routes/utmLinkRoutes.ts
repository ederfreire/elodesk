import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

const checarPlano = isPlanFeatureEnabled("useUtmLinks");

import * as UtmLinkController from "../controllers/UtmLinkController";

const utmLinkRoutes = express.Router();

// O relatório vem antes de "/utm-links/:id" para "report" não ser lido como id.
utmLinkRoutes.get("/utm-links/report", isAuth, checarPlano, UtmLinkController.report);
utmLinkRoutes.get("/utm-links", isAuth, checarPlano, UtmLinkController.index);
utmLinkRoutes.post("/utm-links", isAuth, checarPlano, UtmLinkController.store);
utmLinkRoutes.put("/utm-links/:id", isAuth, checarPlano, UtmLinkController.update);
utmLinkRoutes.delete("/utm-links/:id", isAuth, checarPlano, UtmLinkController.remove);

export default utmLinkRoutes;
