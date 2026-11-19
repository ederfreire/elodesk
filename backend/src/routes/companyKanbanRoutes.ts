import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";
import * as CompanyKanbanController from "../controllers/CompanyKanbanController";

const companyKanbanRoutes = express.Router();
const checkKanban = isPlanFeatureEnabled("useKanban");

companyKanbanRoutes.post(
  "/company-kanban/lane-order",
  isAuth,
  checkKanban,
  CompanyKanbanController.setLaneOrder
);

companyKanbanRoutes.get(
  "/company-kanban/lane-order",
  isAuth,
  checkKanban,
  CompanyKanbanController.getLaneOrder
);

export default companyKanbanRoutes;
