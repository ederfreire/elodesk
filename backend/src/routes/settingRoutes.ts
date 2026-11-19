import { Router } from "express";
import isAuth from "../middleware/isAuth";
import envTokenAuth from "../middleware/envTokenAuth";
import multer from "multer";

import * as SettingController from "../controllers/SettingController";
import * as SmtpSettingsController from "../controllers/SmtpSettingsController";
import * as MetaSettingsController from "../controllers/MetaSettingsController";
import isSuper from "../middleware/isSuper";
import uploadConfig from "../config/upload";
import uploadPrivateConfig from "../config/privateFiles";

const upload = multer(uploadConfig);
const uploadPrivate = multer(uploadPrivateConfig);

const settingRoutes = Router();

settingRoutes.get("/settings", isAuth, SettingController.index);

// IMPORTANTE: rotas específicas devem vir ANTES da rota com parâmetro
// "/settings/:settingKey", senão o Express trata "public-folder-info"
// como um settingKey e a rota correta nunca é alcançada.
settingRoutes.post("/settings/clean-public-folder", isAuth, isSuper, SettingController.cleanPublicFolder);

settingRoutes.post("/settings/dedupe-public-folder", isAuth, isSuper, SettingController.dedupePublicFolder);


settingRoutes.get("/settings/public-folder-preview", isAuth, isSuper, SettingController.previewCleanPublicFolder);

settingRoutes.get("/settings/public-folder-info", isAuth, isSuper, SettingController.publicFolderInfo);

settingRoutes.get("/settings/:settingKey", isAuth, SettingController.showOne);

// change setting key to key in future
settingRoutes.put("/settings/:settingKey", isAuth, SettingController.update);

settingRoutes.get("/setting/:settingKey", isAuth, SettingController.getSetting);

settingRoutes.put("/setting/:settingKey", isAuth, SettingController.updateOne);

settingRoutes.get("/public-settings/:settingKey", envTokenAuth, SettingController.publicShow);

settingRoutes.post("/settings-whitelabel/logo", isAuth, upload.single("file"), SettingController.storeLogo);

settingRoutes.post(
  "/settings/privateFile",
  isAuth,
  uploadPrivate.single("file"),
  SettingController.storePrivateFile
);

// SMTP Settings (Super Admin only)
settingRoutes.get("/smtp-settings", isAuth, isSuper, SmtpSettingsController.getSmtpSettings);
settingRoutes.put("/smtp-settings", isAuth, isSuper, SmtpSettingsController.updateSmtpSettings);
settingRoutes.post("/smtp-settings/test", isAuth, isSuper, SmtpSettingsController.testSmtp);

// Meta (Facebook / Instagram) Settings (Super Admin only)
// Precisa vir ANTES de "/meta-settings" para o Express não tratar "public"
// como parâmetro. Só isAuth: qualquer usuário logado pode ler o App ID e o
// Configuration ID (não são segredos e vão para o SDK do Facebook no
// navegador). Os segredos continuam atrás do isSuper, na rota abaixo.
settingRoutes.get("/meta-settings/public", isAuth, MetaSettingsController.getPublicMetaSettings);
settingRoutes.get("/meta-settings", isAuth, isSuper, MetaSettingsController.getMetaSettings);
settingRoutes.put("/meta-settings", isAuth, isSuper, MetaSettingsController.updateMetaSettings);

export default settingRoutes;
