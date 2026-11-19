import express from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";
import uploadConfig from "../config/upload";

import * as ContactController from "../controllers/ContactController";
import * as ImportPhoneContactsController from "../controllers/ImportPhoneContactsController";

const contactRoutes = express.Router();
const upload = multer(uploadConfig);
const checkContacts = isPlanFeatureEnabled("useContacts");

// ========== Rotas estáticas PRIMEIRO (antes de :contactId) ==========
contactRoutes.post("/contacts/bulk-delete", isAuth, checkContacts, ContactController.bulkDelete);
contactRoutes.delete("/contacts/all", isAuth, checkContacts, ContactController.deleteAll);
contactRoutes.post("/contacts/import", isAuth, checkContacts, ImportPhoneContactsController.store);
contactRoutes.get("/contacts/geo-distribution", isAuth, ContactController.geoDistribution);

contactRoutes.get("/contacts/sync-status", isAuth, checkContacts, ImportPhoneContactsController.syncStatus);
contactRoutes.get("/contacts/list", isAuth, checkContacts, ContactController.list);
contactRoutes.get("/contacts/wallets", isAuth, checkContacts, ContactController.listWallets);
contactRoutes.post("/contacts/force-update-photos", isAuth, checkContacts, ContactController.forceUpdatePhotos);
contactRoutes.get("/contacts/profile/:number", isAuth, checkContacts, ContactController.getContactProfileURL);
contactRoutes.post("/contacts/upload", isAuth, checkContacts, upload.array("file"), ContactController.upload);
contactRoutes.post("/contactsImport", isAuth, checkContacts, ContactController.importXls);

// ========== Rotas base ==========
contactRoutes.get("/contacts", isAuth, checkContacts, ContactController.index);
contactRoutes.post("/contacts", isAuth, checkContacts, ContactController.store);

// ========== Rotas parametrizadas por :contactId POR ÚLTIMO ==========
contactRoutes.get("/contacts/:contactId(\\d+)", isAuth, checkContacts, ContactController.show);
contactRoutes.put("/contacts/:contactId(\\d+)", isAuth, checkContacts, ContactController.update);
contactRoutes.delete("/contacts/:contactId(\\d+)", isAuth, checkContacts, ContactController.remove);
contactRoutes.get("/contacts/:contactId(\\d+)/participants", isAuth, checkContacts, ContactController.getGroupParticipants);
contactRoutes.get("/contacts/:contactId(\\d+)/media", isAuth, checkContacts, ContactController.getContactMedia);
contactRoutes.get("/contacts/:contactId(\\d+)/messages/search", isAuth, checkContacts, ContactController.searchMessages);
contactRoutes.put("/contacts/toggleAcceptAudio/:contactId", isAuth, checkContacts, ContactController.toggleAcceptAudio);
contactRoutes.put("/contacts/block/:contactId", isAuth, checkContacts, ContactController.blockUnblock);
contactRoutes.put("/contacts/toggleDisableBot/:contactId", isAuth, checkContacts, ContactController.toggleDisableBot);
contactRoutes.put("/contacts/wallet/:contactId", isAuth, checkContacts, ContactController.updateContactWallet);
contactRoutes.delete("/contacts/wallet/:contactId", isAuth, checkContacts, ContactController.deleteContactWallet);
contactRoutes.get("/contactTags/:contactId", isAuth, checkContacts, ContactController.getContactTags);

export default contactRoutes;
