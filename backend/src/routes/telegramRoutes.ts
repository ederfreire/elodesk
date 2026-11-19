import express from "express";
import { TelegramWebhookController } from "../controllers/TelegramWebhookController";

const telegramRoutes = express.Router();

telegramRoutes.post("/telegram/webhook/:botToken", TelegramWebhookController);
telegramRoutes.get("/telegram/webhook/:botToken", (req, res) => {
  return res.status(200).json({ status: "ok", message: "Telegram webhook ativo" });
});

export default telegramRoutes;
