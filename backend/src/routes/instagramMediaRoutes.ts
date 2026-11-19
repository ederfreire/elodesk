import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as InstagramMediaController from "../controllers/InstagramMediaController";

const instagramMediaRoutes = Router();

instagramMediaRoutes.get("/instagram/accounts", isAuth, InstagramMediaController.accounts);
instagramMediaRoutes.get("/instagram/media", isAuth, InstagramMediaController.media);

export default instagramMediaRoutes;
