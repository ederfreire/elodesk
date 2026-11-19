import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as DashboardController from "../controllers/DashbardController";

const routes = express.Router();
const checkDashboard = isPlanFeatureEnabled("useDashboard");

routes.get("/dashboard", isAuth, checkDashboard, DashboardController.index);
routes.get("/dashboard/ticketsUsers", DashboardController.reportsUsers);
routes.get("/dashboard/ticketsDay", DashboardController.reportsDay);
routes.get("/dashboard/moments", isAuth, checkDashboard, DashboardController.DashTicketsQueues);
routes.get("/dashboard/user-performance", isAuth, checkDashboard, DashboardController.userPerformance);

export default routes;
