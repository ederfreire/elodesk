import express from "express";
import { ZApiWebhookController } from "../controllers/ZApiWebhookController";

const zapiRoutes = express.Router();

zapiRoutes.post("/zapi/webhook/:instanceId", ZApiWebhookController);
zapiRoutes.get("/zapi/webhook/:instanceId", (req, res) => {
  return res.status(200).json({ status: "ok", message: "Webhook ativo" });
});

export default zapiRoutes;
