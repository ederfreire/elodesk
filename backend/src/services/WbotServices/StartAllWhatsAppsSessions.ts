import ListWhatsAppsService from "../WhatsappService/ListWhatsAppsService";
import { StartWhatsAppSession } from "./StartWhatsAppSession";
import { setZApiWebhook } from "../ZApiServices/ZApiService";
import { setWebhook as setTelegramWebhook, getMe as getTelegramMe } from "../TelegramServices/telegramBotAPI";
import * as Sentry from "@sentry/node";
import logger from "../../utils/logger";

const BATCH_SIZE = 3; // Sessões simultâneas por lote
const DELAY_BETWEEN_SESSIONS = 5000; // 5s entre cada sessão
const DELAY_BETWEEN_BATCHES = 10000; // 10s entre lotes

export const StartAllWhatsAppsSessions = async (
  companyId: number
): Promise<void> => {
  try {
    const whatsapps = await ListWhatsAppsService({ companyId });
    if (whatsapps.length > 0) {
      // ✅ Registrar webhooks para conexões Z-API existentes no boot
      const zapiConnections = whatsapps.filter(
        w => w.zapiInstanceId && w.zapiToken && w.zapiClientToken
      );

      for (const zapi of zapiConnections) {
        try {
          await setZApiWebhook({
            zapiInstanceId: zapi.zapiInstanceId!,
            zapiToken: zapi.zapiToken!,
            zapiClientToken: zapi.zapiClientToken!,
          });
          logger.info(`[BOOT] ✅ Webhook Z-API configurado para conexão ${zapi.id} (${zapi.name})`);
        } catch (err: any) {
          logger.warn(`[BOOT] ⚠️ Falha ao configurar webhook Z-API para conexão ${zapi.id}: ${err.message}`);
        }
      }

      // ✅ Registrar webhooks para conexões Telegram no boot
      const telegramConnections = whatsapps.filter(w => w.channel === "telegram" && w.token);
      for (const tg of telegramConnections) {
        try {
          const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
          const webhookUrl = `${backendUrl}/telegram/webhook/${tg.token}`;
          await setTelegramWebhook(tg.token, webhookUrl);

          const botInfo = await getTelegramMe(tg.token);
          if (botInfo) {
            await tg.update({
              status: "CONNECTED",
              number: String(botInfo.id),
              name: tg.name || botInfo.first_name
            });
          }

          logger.info(`[BOOT] ✅ Webhook Telegram configurado para conexão ${tg.id} (${tg.name})`);
        } catch (err: any) {
          logger.warn(`[BOOT] ⚠️ Falha ao configurar webhook Telegram para conexão ${tg.id}: ${err.message}`);
          await tg.update({ status: "DISCONNECTED" });
        }
      }

      const whatsappSessions = whatsapps.filter(
        whatsapp => whatsapp.channel === "whatsapp" && !whatsapp.zapiInstanceId
      );

      logger.info(`[BOOT] Iniciando ${whatsappSessions.length} sessões para empresa ${companyId} em lotes de ${BATCH_SIZE}`);

      // Processar em lotes para evitar pico de CPU
      for (let i = 0; i < whatsappSessions.length; i += BATCH_SIZE) {
        const batch = whatsappSessions.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(whatsappSessions.length / BATCH_SIZE);

        logger.info(`[BOOT] Lote ${batchNum}/${totalBatches} - ${batch.length} sessões`);

        for (const whatsapp of batch) {
          await StartWhatsAppSession(whatsapp, companyId);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SESSIONS));
        }

        // Pausa maior entre lotes para deixar CPU estabilizar
        if (i + BATCH_SIZE < whatsappSessions.length) {
          logger.info(`[BOOT] Aguardando ${DELAY_BETWEEN_BATCHES / 1000}s antes do próximo lote...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      logger.info(`[BOOT] Todas as sessões da empresa ${companyId} iniciadas.`);
    }
  } catch (e) {
    Sentry.captureException(e);
    logger.error(`[BOOT] Erro ao iniciar sessões da empresa ${companyId}: ${e}`);
  }
};
