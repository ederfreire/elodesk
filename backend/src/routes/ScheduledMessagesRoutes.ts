import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as ScheduleMesageController from "../controllers/ScheduledMessagesController";
import multer from "multer";
import uploadConfig from "../config/upload";
const upload = multer(uploadConfig);

const scheduleMessageRoutes = express.Router();
const checkSchedules = isPlanFeatureEnabled("useSchedules");

scheduleMessageRoutes.get("/schedules-message", isAuth, checkSchedules, ScheduleMesageController.index);

scheduleMessageRoutes.post("/schedules-message", isAuth, checkSchedules, upload.array("file"), ScheduleMesageController.store);

scheduleMessageRoutes.put("/schedules-message/:scheduleId", isAuth, checkSchedules, upload.array("file"), ScheduleMesageController.update);

scheduleMessageRoutes.get("/schedules-message/:scheduleId", isAuth, checkSchedules, ScheduleMesageController.show);

scheduleMessageRoutes.delete("/schedules-message/:scheduleId", isAuth, checkSchedules, ScheduleMesageController.remove);

export default scheduleMessageRoutes;
