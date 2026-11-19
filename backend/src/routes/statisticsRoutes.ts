import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as StatisticsController from "../controllers/StatisticsController";

const statisticsRoutes = express.Router();
const checkRealTime = isPlanFeatureEnabled("useRealTime");

statisticsRoutes.get(
  "/usersMoments",
  isAuth,
  checkRealTime,
  StatisticsController.DashTicketsQueues
);

statisticsRoutes.get(
  "/contacts-report",
  isAuth,
  StatisticsController.ContactsReport
);

export default statisticsRoutes;
