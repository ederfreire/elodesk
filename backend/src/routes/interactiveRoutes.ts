import { Router } from "express";
import multer from "multer";
import uploadConfig from "../config/upload";
import isAuth from "../middleware/isAuth";
import * as InteractiveMessageController from "../controllers/InteractiveMessageController";

const upload = multer(uploadConfig);

const interactiveRoutes = Router();

interactiveRoutes.post("/interactive/send", isAuth, InteractiveMessageController.send);

interactiveRoutes.post(
  "/interactive/upload-pdf",
  isAuth,
  upload.single("file"),
  InteractiveMessageController.uploadPdf
);

// Upload de imagem (cards de carrossel/catálogo). Reaproveita a mesma lógica
// de salvar em public/company{companyId}/interactive e retornar o caminho.
interactiveRoutes.post(
  "/interactive/upload-media",
  isAuth,
  upload.single("file"),
  InteractiveMessageController.uploadPdf
);

export default interactiveRoutes;
