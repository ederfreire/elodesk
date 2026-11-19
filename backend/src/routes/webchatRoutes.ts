import { Router } from "express";
import multer from "multer";
import * as WebchatController from "../controllers/WebchatController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const webchatRoutes = Router();

webchatRoutes.get("/public/webchat/:token/config", WebchatController.config);
webchatRoutes.post("/public/webchat/:token/session", WebchatController.session);
webchatRoutes.get("/public/webchat/:token/history", WebchatController.history);
webchatRoutes.post("/public/webchat/:token/message", WebchatController.sendMessage);
webchatRoutes.post(
  "/public/webchat/:token/media",
  upload.single("file"),
  WebchatController.sendMedia
);
webchatRoutes.post("/public/webchat/:token/ack", WebchatController.ack);

export default webchatRoutes;