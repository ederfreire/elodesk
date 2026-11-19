import express from "express";
import isAuth from "../middleware/isAuth";

import * as LeadSourceController from "../controllers/LeadSourceController";

const leadSourceRoutes = express.Router();

// Antes de "/lead-sources/:id" nao e necessario (o :id esta so em PUT e
// DELETE), mas manter o relatorio primeiro evita surpresa se alguem
// acrescentar um GET com parametro depois.
leadSourceRoutes.get("/lead-sources/report", isAuth, LeadSourceController.report);

leadSourceRoutes.get("/lead-sources", isAuth, LeadSourceController.index);
leadSourceRoutes.post("/lead-sources", isAuth, LeadSourceController.store);
leadSourceRoutes.put("/lead-sources/:id", isAuth, LeadSourceController.update);
leadSourceRoutes.delete("/lead-sources/:id", isAuth, LeadSourceController.remove);

// Origem do contato: rota separada porque quem usa é o atendente na tela de
// atendimento, não quem administra a lista em Configurações.
leadSourceRoutes.put(
  "/contacts/:contactId/lead-source",
  isAuth,
  LeadSourceController.setContactSource
);

export default leadSourceRoutes;
