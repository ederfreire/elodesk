import axios, { AxiosInstance } from "axios";
import logger from "../../utils/logger";

const telegramApi = (botToken: string): AxiosInstance =>
  axios.create({
    baseURL: `https://api.telegram.org/bot${botToken}/`,
    headers: { "Content-Type": "application/json" }
  });

// ==================== Inline Keyboard Types ====================

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface ReplyKeyboardButton {
  text: string;
  request_contact?: boolean;
  request_location?: boolean;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ReplyKeyboardMarkup {
  keyboard: ReplyKeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  selective?: boolean;
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true;
  selective?: boolean;
}

type ReplyMarkup = InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove;

// ==================== Send Functions ====================

export const sendMessage = async (
  botToken: string,
  chatId: string | number,
  text: string,
  replyToMessageId?: number,
  replyMarkup?: ReplyMarkup
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(replyToMessageId && { reply_to_message_id: replyToMessageId }),
      ...(replyMarkup && { reply_markup: replyMarkup })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar mensagem: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const sendMessageWithInlineKeyboard = async (
  botToken: string,
  chatId: string | number,
  text: string,
  buttons: InlineKeyboardButton[][],
  replyToMessageId?: number
): Promise<any> => {
  return sendMessage(botToken, chatId, text, replyToMessageId, {
    inline_keyboard: buttons
  });
};

export const sendMessageWithReplyKeyboard = async (
  botToken: string,
  chatId: string | number,
  text: string,
  buttons: ReplyKeyboardButton[][],
  options?: { resizeKeyboard?: boolean; oneTimeKeyboard?: boolean }
): Promise<any> => {
  return sendMessage(botToken, chatId, text, undefined, {
    keyboard: buttons,
    resize_keyboard: options?.resizeKeyboard ?? true,
    one_time_keyboard: options?.oneTimeKeyboard ?? true
  });
};

export const removeReplyKeyboard = async (
  botToken: string,
  chatId: string | number,
  text: string
): Promise<any> => {
  return sendMessage(botToken, chatId, text, undefined, {
    remove_keyboard: true
  });
};

export const answerCallbackQuery = async (
  botToken: string,
  callbackQueryId: string,
  text?: string,
  showAlert?: boolean
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text && { text }),
      ...(showAlert !== undefined && { show_alert: showAlert })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao responder callback query: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const editMessageReplyMarkup = async (
  botToken: string,
  chatId: string | number,
  messageId: number,
  replyMarkup?: InlineKeyboardMarkup
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      ...(replyMarkup ? { reply_markup: replyMarkup } : { reply_markup: { inline_keyboard: [] } })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao editar markup: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

// ==================== Media Functions ====================

export const sendPhoto = async (
  botToken: string,
  chatId: string | number,
  photoUrl: string,
  caption?: string,
  replyMarkup?: ReplyMarkup
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendPhoto", {
      chat_id: chatId,
      photo: photoUrl,
      ...(caption && { caption, parse_mode: "HTML" }),
      ...(replyMarkup && { reply_markup: replyMarkup })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar foto: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const sendDocument = async (
  botToken: string,
  chatId: string | number,
  documentUrl: string,
  caption?: string
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendDocument", {
      chat_id: chatId,
      document: documentUrl,
      ...(caption && { caption, parse_mode: "HTML" })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar documento: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const sendVideo = async (
  botToken: string,
  chatId: string | number,
  videoUrl: string,
  caption?: string
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendVideo", {
      chat_id: chatId,
      video: videoUrl,
      ...(caption && { caption, parse_mode: "HTML" })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar vídeo: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const sendAudio = async (
  botToken: string,
  chatId: string | number,
  audioUrl: string,
  caption?: string
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendAudio", {
      chat_id: chatId,
      audio: audioUrl,
      ...(caption && { caption, parse_mode: "HTML" })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar áudio: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const sendVoice = async (
  botToken: string,
  chatId: string | number,
  voiceUrl: string
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendVoice", {
      chat_id: chatId,
      voice: voiceUrl
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar áudio de voz: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const sendSticker = async (
  botToken: string,
  chatId: string | number,
  stickerUrl: string
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendSticker", {
      chat_id: chatId,
      sticker: stickerUrl
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar sticker: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const sendAnimation = async (
  botToken: string,
  chatId: string | number,
  animationUrl: string,
  caption?: string
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendAnimation", {
      chat_id: chatId,
      animation: animationUrl,
      ...(caption && { caption, parse_mode: "HTML" })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar GIF/animação: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

// ==================== Location & Contact Functions ====================

export const sendLocation = async (
  botToken: string,
  chatId: string | number,
  latitude: number,
  longitude: number,
  replyToMessageId?: number
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendLocation", {
      chat_id: chatId,
      latitude,
      longitude,
      ...(replyToMessageId && { reply_to_message_id: replyToMessageId })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar localização: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const sendVenue = async (
  botToken: string,
  chatId: string | number,
  latitude: number,
  longitude: number,
  title: string,
  address: string
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendVenue", {
      chat_id: chatId,
      latitude,
      longitude,
      title,
      address
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar venue: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const sendContactTelegram = async (
  botToken: string,
  chatId: string | number,
  phoneNumber: string,
  firstName: string,
  lastName?: string
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("sendContact", {
      chat_id: chatId,
      phone_number: phoneNumber,
      first_name: firstName,
      ...(lastName && { last_name: lastName })
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar contato: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

// ==================== Reaction Functions ====================

export const setMessageReaction = async (
  botToken: string,
  chatId: string | number,
  messageId: number,
  emoji?: string
): Promise<any> => {
  try {
    const reaction = emoji
      ? [{ type: "emoji", emoji }]
      : [];

    const { data } = await telegramApi(botToken).post("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction
    });
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao enviar reação: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

// ==================== File & Webhook Functions ====================

export const getFile = async (
  botToken: string,
  fileId: string
): Promise<string> => {
  try {
    const { data } = await telegramApi(botToken).post("getFile", {
      file_id: fileId
    });
    const filePath = data.result.file_path;
    return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao obter arquivo: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const setWebhook = async (
  botToken: string,
  url: string
): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("setWebhook", {
      url,
      allowed_updates: ["message", "edited_message", "callback_query", "message_reaction"]
    });
    logger.info(`[TELEGRAM] Webhook configurado: ${url}`);
    return data;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao configurar webhook: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const deleteWebhook = async (botToken: string): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("deleteWebhook");
    logger.info(`[TELEGRAM] Webhook removido`);
    return data;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao remover webhook: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const getMe = async (botToken: string): Promise<any> => {
  try {
    const { data } = await telegramApi(botToken).post("getMe");
    return data.result;
  } catch (error: any) {
    logger.error(`[TELEGRAM] Erro ao obter informações do bot: ${error?.response?.data?.description || error.message}`);
    throw error;
  }
};

export const getUserProfilePhoto = async (
  botToken: string,
  userId: number | string
): Promise<string | null> => {
  try {
    const api = telegramApi(botToken);
    const { data } = await api.post("getUserProfilePhotos", {
      user_id: userId,
      offset: 0,
      limit: 1
    });

    if (data.result?.total_count > 0) {
      const photos = data.result.photos[0];
      // Get the largest photo (last in array)
      const photo = photos[photos.length - 1];
      const fileId = photo.file_id;

      const fileRes = await api.post("getFile", { file_id: fileId });
      const filePath = fileRes.data.result?.file_path;

      if (filePath) {
        return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
      }
    }
    return null;
  } catch (error: any) {
    logger.warn(`[TELEGRAM] Erro ao buscar foto de perfil: ${error?.response?.data?.description || error.message}`);
    return null;
  }
};

export default telegramApi;
