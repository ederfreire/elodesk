import { Request, Response } from "express";
import Whatsapp from "../models/Whatsapp";
import Company from "../models/Company";
import Plan from "../models/Plan";
import { handleTelegramMessage, handleTelegramCallbackQuery, handleTelegramReaction } from "../services/TelegramServices/TelegramMessageListener";
import logger from "../utils/logger";

export const TelegramWebhookController = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { botToken } = req.params;
    const update = req.body;

    // Buscar a conexão pelo token do bot
    const whatsapp = await Whatsapp.findOne({
      where: {
        token: botToken,
        channel: "telegram"
      }
    });

    if (!whatsapp) {
      logger.warn(`[TELEGRAM] Webhook recebido para bot token não encontrado`);
      return res.status(200).json({ ok: true });
    }

    // Verificar se o plano da empresa permite Telegram
    const company = await Company.findByPk(whatsapp.companyId, {
      include: [{ model: Plan, as: "plan", attributes: ["useTelegram"] }]
    });

    if (!company || !company.plan || (company.plan as any).useTelegram === false) {
      logger.warn(`[TELEGRAM] Feature desabilitada no plano da empresa ${whatsapp.companyId}`);
      return res.status(200).json({ ok: true });
    }

    // Processar a atualização em background
    if (update.message || update.edited_message) {
      handleTelegramMessage(whatsapp, update, whatsapp.companyId).catch(err => {
        logger.error(`[TELEGRAM] Erro ao processar mensagem: ${err.message}`);
      });
    }

    // Processar callback_query (clique em botão inline)
    if (update.callback_query) {
      handleTelegramCallbackQuery(whatsapp, update.callback_query, whatsapp.companyId).catch(err => {
        logger.error(`[TELEGRAM] Erro ao processar callback_query: ${err.message}`);
      });
    }

    // Processar reações a mensagens
    if (update.message_reaction) {
      handleTelegramReaction(whatsapp, update.message_reaction, whatsapp.companyId).catch(err => {
        logger.error(`[TELEGRAM] Erro ao processar reação: ${err.message}`);
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro no webhook: ${error.message}`);
    return res.status(200).json({ ok: true });
  }
};
