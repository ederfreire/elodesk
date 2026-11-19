import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as GroupManagerController from "../controllers/GroupManagerController";

const groupManagerRoutes = Router();

groupManagerRoutes.get("/group-manager/groups", isAuth, GroupManagerController.listGroups);
groupManagerRoutes.get("/group-manager/:whatsappId/:groupJid/metadata", isAuth, GroupManagerController.getGroupMetadata);
groupManagerRoutes.put("/group-manager/:whatsappId/:groupJid/subject", isAuth, GroupManagerController.updateSubject);
groupManagerRoutes.put("/group-manager/:whatsappId/:groupJid/description", isAuth, GroupManagerController.updateDescription);
groupManagerRoutes.get("/group-manager/:whatsappId/:groupJid/invite-link", isAuth, GroupManagerController.getInviteLink);
groupManagerRoutes.post("/group-manager/:whatsappId/:groupJid/participants", isAuth, GroupManagerController.addParticipants);
groupManagerRoutes.post("/group-manager/:whatsappId/:groupJid/send-message", isAuth, GroupManagerController.sendMessage);
groupManagerRoutes.put("/group-manager/:whatsappId/:groupJid/settings", isAuth, GroupManagerController.updateSettings);
groupManagerRoutes.post("/group-manager/:whatsappId/:groupJid/remove-participant", isAuth, GroupManagerController.removeParticipant);
groupManagerRoutes.post("/group-manager/:whatsappId/:groupJid/promote-participant", isAuth, GroupManagerController.promoteParticipant);
groupManagerRoutes.post("/group-manager/:whatsappId/:groupJid/demote-participant", isAuth, GroupManagerController.demoteParticipant);

// Saudação para novos membros
groupManagerRoutes.get("/group-manager/:whatsappId/:groupJid/greeting", isAuth, GroupManagerController.getGreeting);
groupManagerRoutes.put("/group-manager/:whatsappId/:groupJid/greeting", isAuth, GroupManagerController.saveGreeting);
groupManagerRoutes.post("/group-manager/greeting/preview", isAuth, GroupManagerController.previewGreeting);

export default groupManagerRoutes;
