import express from "express";
import isAuth from "../middleware/isAuth";

import * as CallController from "../controllers/CallController";

const callRoutes = express.Router();

callRoutes.get("/historical", isAuth, CallController.getHistoric)
callRoutes.post("/historical/wavoip", isAuth, CallController.createCallHistoric);
callRoutes.put("/historical/:id", isAuth, CallController.updateCallHistoric);
callRoutes.get("/historical/user/whatsapp", isAuth, CallController.getWhatsappUserId);

export default callRoutes;
