import express from "express";
import isAuth from "../middleware/isAuth";
import permissaoDoUsuario from "../middleware/permissaoDoUsuario";

import * as WhatsAppController from "../controllers/WhatsAppController";

import multer from "multer";
import uploadConfig from "../config/upload";
import { mediaUpload } from "../services/WhatsappService/uploadMediaAttachment";
import { deleteMedia } from "../services/WhatsappService/uploadMediaAttachment";

const upload = multer(uploadConfig);


const whatsappRoutes = express.Router();

whatsappRoutes.get("/whatsapp/", isAuth, WhatsAppController.index);
whatsappRoutes.get("/whatsapp/filter", isAuth, WhatsAppController.indexFilter);
whatsappRoutes.get("/whatsapp/all", isAuth, WhatsAppController.listAll);
whatsappRoutes.get("/whatsapp-oficial/health", isAuth, WhatsAppController.healthAll);
whatsappRoutes.get("/whatsapp-oficial/health/report.pdf", isAuth, WhatsAppController.healthReportPdf);
whatsappRoutes.get("/whatsapp-oficial/health/reports", isAuth, WhatsAppController.healthReportList);
whatsappRoutes.get("/whatsapp-oficial/meta-webhook-info", isAuth, WhatsAppController.metaUnifiedWebhookInfo);
whatsappRoutes.post("/whatsapp-oficial/:whatsappId/subscribe-waba", isAuth, WhatsAppController.subscribeWaba);
whatsappRoutes.get("/whatsapp-oficial/:whatsappId/health", isAuth, WhatsAppController.healthOne);

whatsappRoutes.get("/whatsapp/sync-templates/:whatsappId", isAuth, WhatsAppController.syncTemplatesOficial);
whatsappRoutes.post("/whatsapp/:whatsappId/create-template", isAuth, WhatsAppController.createTemplate);
whatsappRoutes.delete("/whatsapp/:whatsappId/delete-template/:templateName", isAuth, WhatsAppController.deleteTemplate);

whatsappRoutes.post("/whatsapp/", isAuth, permissaoDoUsuario("allowConnections"), WhatsAppController.store);
whatsappRoutes.post("/whatsapp/embedded-signup", isAuth, permissaoDoUsuario("allowConnections"), WhatsAppController.embeddedSignup);
whatsappRoutes.post("/facebook/", isAuth, permissaoDoUsuario("allowConnections"), WhatsAppController.storeFacebook);
// Antes de "/whatsapp/:whatsappId" nao e necessario (3 segmentos vs 2), mas
// o prefixo separado evita qualquer ambiguidade futura.
whatsappRoutes.get("/whatsapp-stats/last7days", isAuth, WhatsAppController.connectionStats);

whatsappRoutes.get("/whatsapp/:whatsappId/quality", isAuth, WhatsAppController.quality);

whatsappRoutes.get("/whatsapp/:whatsappId", isAuth, WhatsAppController.show);
whatsappRoutes.put("/whatsapp/:whatsappId", isAuth, permissaoDoUsuario("allowConnections"), WhatsAppController.update);
whatsappRoutes.delete("/whatsapp/:whatsappId", isAuth, WhatsAppController.remove);


//restart
whatsappRoutes.post("/whatsapp-restart/", isAuth, WhatsAppController.restart);
whatsappRoutes.post("/whatsapp/:whatsappId/media-upload", isAuth, upload.array("file"), mediaUpload);

whatsappRoutes.delete("/whatsapp/:whatsappId/media-upload", isAuth, deleteMedia);


whatsappRoutes.delete("/whatsapp-admin/:whatsappId", isAuth, WhatsAppController.remove);

whatsappRoutes.put("/whatsapp-admin/:whatsappId", isAuth, WhatsAppController.updateAdmin);

whatsappRoutes.get("/whatsapp-admin/:whatsappId", isAuth, WhatsAppController.showAdmin);

whatsappRoutes.post("/whatsapp/import-messages", isAuth, WhatsAppController.importMessages);
whatsappRoutes.post("/whatsapp/import-messages/cancel", isAuth, WhatsAppController.cancelImportMessages);

// Upload de mídia para usar como sample no header de templates oficiais.
// Salva em public/company{companyId}/templateMedia/ e devolve a URL pública.
whatsappRoutes.post(
  "/template-media-upload",
  isAuth,
  (req, _res, next) => {
    // garante typeArch antes do multer (que depende disso para escolher a pasta)
    req.body = req.body || {};
    req.body.typeArch = "templateMedia";
    next();
  },
  multer(uploadConfig).single("file"),
  async (req, res) => {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

      const { companyId } = req.user;
      let nameFile = file.filename;
      if (nameFile.split(".").length === 1) {
        const ext = (file.mimetype || "").split("/")[1];
        if (ext) nameFile = `${nameFile}.${ext}`;
      }

      const relativePath = `company${companyId}/templateMedia/${nameFile}`;
      const backendUrl =
        process.env.BACKEND_URL ||
        `${req.protocol}://${req.get("host")}`;
      const publicUrl = `${backendUrl.replace(/\/$/, "")}/public/${relativePath}`;

      return res.status(200).json({
        url: publicUrl,
        path: relativePath,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });
    } catch (err: any) {
      console.error("[template-media-upload] erro:", err);
      return res.status(500).json({ error: err.message || "Falha no upload." });
    }
  }
);

export default whatsappRoutes;
