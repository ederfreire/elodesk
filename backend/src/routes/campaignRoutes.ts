import express from "express";
import isAuth from "../middleware/isAuth";
import permissaoDoUsuario from "../middleware/permissaoDoUsuario";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as CampaignController from "../controllers/CampaignController";
import multer from "multer";
import uploadConfig from "../config/upload";

const upload = multer(uploadConfig);

const routes = express.Router();
const checkCampaigns = isPlanFeatureEnabled("useCampaigns");
const checkVoiceCampaign = isPlanFeatureEnabled("useVoiceCampaign");

routes.get("/campaigns/:id/recurrence-preview", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.previewRecurrence);
routes.post("/campaigns/ai-generate-variants", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.aiGenerateVariants);
routes.post("/campaigns/:id/stop-recurrence", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.stopRecurrence);
routes.get("/campaigns/list", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.findList);
routes.get("/campaigns", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.index);
routes.get("/campaigns/:id", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.show);
routes.get("/campaigns/:id/shipping", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.getShipping);
routes.get("/campaigns/:id/stats", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.getStats);
routes.post("/campaigns", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.store);
routes.put("/campaigns/:id", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.update);
routes.delete("/campaigns/:id", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.remove);
routes.post("/campaigns/:id/cancel", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.cancel);
routes.post("/campaigns/:id/duplicate", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.duplicate);
routes.post("/campaigns/:id/restart", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.restart);
routes.post("/campaigns/:id/media-upload", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, upload.array("file"), CampaignController.mediaUpload);
routes.delete("/campaigns/:id/media-upload", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.deleteMedia);
// Áudio da campanha de voz (gravado ou enviado)
// checkVoiceCampaign: subir áudio de campanha é ação exclusiva do recurso de
// voz. Sem esta trava, dava para preparar a campanha por fora da tela.
routes.post("/campaigns/:id/voice-audio", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, checkVoiceCampaign, upload.array("file"), CampaignController.voiceAudioUpload);
routes.delete("/campaigns/:id/voice-audio", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.deleteVoiceAudio);
routes.post("/campaigns/:id/message-media-upload", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, upload.array("file"), CampaignController.messageMediaUpload);
routes.delete("/campaigns/:id/message-media", isAuth, permissaoDoUsuario("showCampaign"), checkCampaigns, CampaignController.deleteMessageMedia);

export default routes;
