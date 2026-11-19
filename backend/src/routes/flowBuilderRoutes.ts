import express from "express";
import isAuth from "../middleware/isAuth";
import permissaoDoUsuario from "../middleware/permissaoDoUsuario";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";
import multer from "multer";
// import uploadConfig from "../config/uploadExt";
import uploadConfig from "../config/upload";

import * as FlowBuilderController from "../controllers/FlowBuilderController";

const upload = multer(uploadConfig);

const flowBuilder = express.Router();

const checkFlows = isPlanFeatureEnabled("useFlows");

flowBuilder.post("/flowbuilder", isAuth, permissaoDoUsuario("showFlow"), checkFlows, FlowBuilderController.createFlow);

flowBuilder.post("/flowbuilder/generate-ai", isAuth, permissaoDoUsuario("showFlow"), checkFlows, FlowBuilderController.generateFlowAI);

flowBuilder.put("/flowbuilder", isAuth, permissaoDoUsuario("showFlow"), checkFlows, FlowBuilderController.updateFlow);

flowBuilder.delete("/flowbuilder/:idFlow", isAuth, permissaoDoUsuario("showFlow"), checkFlows, FlowBuilderController.deleteFlow);

flowBuilder.get("/flowbuilder", isAuth, checkFlows, FlowBuilderController.myFlows);

flowBuilder.get("/flowbuilder/:idFlow", isAuth, checkFlows, FlowBuilderController.flowOne);

flowBuilder.post("/flowbuilder/flow", isAuth, permissaoDoUsuario("showFlow"), checkFlows, FlowBuilderController.FlowDataUpdate);

flowBuilder.post("/flowbuilder/duplicate", isAuth, permissaoDoUsuario("showFlow"), checkFlows, FlowBuilderController.FlowDuplicate);

flowBuilder.get("/flowbuilder/flow/:idFlow", isAuth, checkFlows, FlowBuilderController.FlowDataGetOne);

flowBuilder.post("/flowbuilder/img", isAuth, permissaoDoUsuario("showFlow"), checkFlows, upload.array("medias"), FlowBuilderController.FlowUploadImg);

flowBuilder.post("/flowbuilder/audio", isAuth, permissaoDoUsuario("showFlow"), checkFlows, upload.array("medias"), FlowBuilderController.FlowUploadAudio);

flowBuilder.post("/flowbuilder/content", isAuth, permissaoDoUsuario("showFlow"), checkFlows, upload.array('medias'), FlowBuilderController.FlowUploadAll);

flowBuilder.put("/flowbuilder/:idFlow/toggle-active", isAuth, permissaoDoUsuario("showFlow"), checkFlows, FlowBuilderController.toggleFlowActive);

// Exporta um fluxo para JSON contendo lista de mídias
flowBuilder.get("/flowbuilder/:idFlow/export", isAuth, checkFlows, FlowBuilderController.exportFlow);

// Importa um fluxo via ZIP contendo flow.json e pasta midias/
flowBuilder.post("/flowbuilder/import", isAuth, permissaoDoUsuario("showFlow"), checkFlows, upload.single("file"), FlowBuilderController.importFlow);

export default flowBuilder;
