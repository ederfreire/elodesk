import express from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";
import uploadConfig from "../config/upload";
import multer from "multer";
const upload = multer(uploadConfig);

import * as ChatController from "../controllers/ChatController";

const routes = express.Router();
const checkInternalChat = isPlanFeatureEnabled("useInternalChat");

routes.get("/chats", isAuth, checkInternalChat, ChatController.index);
routes.get("/chats/:id", isAuth, checkInternalChat, ChatController.show);
routes.get("/chats/:id/messages", isAuth, checkInternalChat, ChatController.messages);
routes.post(
  "/chats/:id/messages",
  isAuth,
  checkInternalChat,
  upload.array("medias"),
  ChatController.saveMessage
);
routes.post("/chats/:id/read", isAuth, checkInternalChat, ChatController.checkAsRead);
routes.post("/chats", isAuth, checkInternalChat, ChatController.store);
routes.put("/chats/:id", isAuth, checkInternalChat, ChatController.update);
routes.delete("/chats/:id", isAuth, checkInternalChat, ChatController.remove);

// Middleware para upload de imagem de grupo
const setGroupImageUploadType = (req: any, res: any, next: any) => {
  req.body.typeArch = "groups";
  next();
};

// Rota para upload de imagem de grupo
routes.post(
  "/chats/upload",
  isAuth,
  checkInternalChat,
  setGroupImageUploadType,
  upload.single("file"),
  ChatController.uploadGroupImage
);

routes.put("/chats/messages/:messageId", isAuth, checkInternalChat, ChatController.editMessage);

routes.delete(
  "/chats/messages/:messageId",
  isAuth,
  checkInternalChat,
  ChatController.deleteMessage
);

routes.post(
  "/chats/messages/:messageId/forward",
  isAuth,
  checkInternalChat,
  ChatController.forwardMessage
);

export default routes;
