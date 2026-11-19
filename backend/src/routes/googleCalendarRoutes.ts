import express from "express";
import isAuth from "../middleware/isAuth";
import * as GoogleCalendarController from "../controllers/GoogleCalendarController";

const googleCalendarRoutes = express.Router();

googleCalendarRoutes.get("/google-calendar/auth-url", isAuth, GoogleCalendarController.getAuthUrl);
// Callback é público (Google redireciona). State carrega o companyId.
googleCalendarRoutes.get("/google-calendar/oauth/callback", GoogleCalendarController.oauthCallback);
googleCalendarRoutes.get("/google-calendar/config", isAuth, GoogleCalendarController.getConfig);
googleCalendarRoutes.put("/google-calendar/config", isAuth, GoogleCalendarController.updateConfig);
googleCalendarRoutes.get("/google-calendar/calendars", isAuth, GoogleCalendarController.listCalendars);
googleCalendarRoutes.delete("/google-calendar/disconnect", isAuth, GoogleCalendarController.disconnect);

export default googleCalendarRoutes;
