import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as ScheduleController from "../controllers/ScheduleController";
import multer from "multer";
import uploadConfig from "../config/upload";

const upload = multer(uploadConfig);

const scheduleRoutes = express.Router();
const checkSchedules = isPlanFeatureEnabled("useSchedules");

scheduleRoutes.get("/schedules", isAuth, checkSchedules, ScheduleController.index);

scheduleRoutes.post("/schedules", isAuth, checkSchedules, ScheduleController.store);

scheduleRoutes.put("/schedules/:scheduleId", isAuth, checkSchedules, ScheduleController.update);

scheduleRoutes.get("/schedules/:scheduleId", isAuth, checkSchedules, ScheduleController.show);

scheduleRoutes.delete("/schedules/:scheduleId", isAuth, checkSchedules, ScheduleController.remove);

scheduleRoutes.post("/schedules/:id/media-upload", isAuth, checkSchedules, upload.array("file"), ScheduleController.mediaUpload);

scheduleRoutes.delete("/schedules/:id/media-upload", isAuth, checkSchedules, ScheduleController.deleteMedia);

export default scheduleRoutes;
