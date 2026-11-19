import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isPlanFeatureEnabled from "../middleware/isPlanFeatureEnabled";

import * as ChatbotController from "../controllers/ChatbotController";

const chatBotRoutes = Router();
const checkOpenAi = isPlanFeatureEnabled("useOpenAi");

chatBotRoutes.get("/chatbot", isAuth, checkOpenAi, ChatbotController.index);

chatBotRoutes.post("/chatbot", isAuth, checkOpenAi, ChatbotController.store);

chatBotRoutes.get("/chatbot/:chatbotId", isAuth, checkOpenAi, ChatbotController.show);

chatBotRoutes.put("/chatbot/:chatbotId", isAuth, checkOpenAi, ChatbotController.update);

chatBotRoutes.delete("/chatbot/:chatbotId", isAuth, checkOpenAi, ChatbotController.remove);

export default chatBotRoutes;
