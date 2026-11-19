import axios from "axios";
import logger from "../../utils/logger";

const ZAPI_BASE = "https://api.z-api.io";

interface ZApiConfig {
  zapiInstanceId: string;
  zapiToken: string;
  zapiClientToken: string;
}

interface ZApiStatusResponse {
  connected: boolean;
  sessionExpired?: boolean;
  statusCode?: number;
  error?: string;
  raw?: any;
}

const zapiClient = ({ zapiInstanceId, zapiToken, zapiClientToken }: ZApiConfig) => {
  return axios.create({
    baseURL: `${ZAPI_BASE}/instances/${zapiInstanceId}/token/${zapiToken}`,
    headers: {
      "Content-Type": "application/json",
      "Client-Token": zapiClientToken
    }
  });
};

const normalizeZApiBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "connected", "online"].includes(normalized);
  }
  return false;
};

const getZApiErrorDetails = (error: any) => {
  const statusCode = error?.response?.status || error?.statusCode;
  const apiMessage = error?.response?.data?.message || error?.response?.data?.error;
  const message = apiMessage || error?.message || "Erro desconhecido na Z-API";

  return { statusCode, message };
};

export const isZApiSessionExpiredError = (error: any): boolean => {
  const { statusCode, message } = getZApiErrorDetails(error);
  return statusCode === 401 || String(message).includes("ERR_SESSION_EXPIRED");
};

export const sendZApiText = async (config: ZApiConfig, phone: string, message: string) => {
  const client = zapiClient(config);
  const { data } = await client.post("/send-text", { phone, message });
  logger.info(`[Z-API] Texto enviado para ${phone}`);
  return data;
};

export const sendZApiImage = async (config: ZApiConfig, phone: string, image: string, caption?: string) => {
  const client = zapiClient(config);
  const { data } = await client.post("/send-image", { phone, image, caption: caption || "" });
  logger.info(`[Z-API] Imagem enviada para ${phone}`);
  return data;
};

export const sendZApiAudio = async (config: ZApiConfig, phone: string, audio: string) => {
  const client = zapiClient(config);
  const { data } = await client.post("/send-audio", { phone, audio });
  logger.info(`[Z-API] Áudio enviado para ${phone}`);
  return data;
};

export const sendZApiVideo = async (config: ZApiConfig, phone: string, video: string, caption?: string) => {
  const client = zapiClient(config);
  const { data } = await client.post("/send-video", { phone, video, caption: caption || "" });
  logger.info(`[Z-API] Vídeo enviado para ${phone}`);
  return data;
};

export const sendZApiDocument = async (config: ZApiConfig, phone: string, document: string, fileName: string) => {
  const client = zapiClient(config);
  const { data } = await client.post("/send-document/{extension}", { phone, document, fileName });
  logger.info(`[Z-API] Documento enviado para ${phone}`);
  return data;
};

export const sendZApiSticker = async (config: ZApiConfig, phone: string, sticker: string) => {
  const client = zapiClient(config);
  const { data } = await client.post("/send-sticker", { phone, sticker });
  logger.info(`[Z-API] Sticker enviado para ${phone}`);
  return data;
};

export const sendZApiContact = async (config: ZApiConfig, phone: string, contactName: string, contactPhone: string) => {
  const client = zapiClient(config);
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL:${contactPhone}\nEND:VCARD`;
  const { data } = await client.post("/send-contact", { phone, contactName, contactPhone: contactPhone, contactVcard: vcard });
  logger.info(`[Z-API] Contato enviado para ${phone}`);
  return data;
};

export const getZApiStatus = async (config: ZApiConfig): Promise<ZApiStatusResponse> => {
  const client = zapiClient(config);

  try {
    const { data } = await client.get("/status");
    const rawConnected = data?.connected ?? data?.isConnected ?? data?.status;
    const connected = normalizeZApiBoolean(rawConnected);
    const errorMessage = data?.message || data?.error;
    const sessionExpired = String(errorMessage || "").includes("ERR_SESSION_EXPIRED");

    return {
      connected: sessionExpired ? false : connected,
      sessionExpired,
      statusCode: data?.statusCode,
      error: errorMessage,
      raw: data
    };
  } catch (error: any) {
    const { statusCode, message } = getZApiErrorDetails(error);
    const sessionExpired = isZApiSessionExpiredError(error);

    logger.error(`[Z-API] Erro ao obter status: ${message}`);

    return {
      connected: false,
      sessionExpired,
      statusCode,
      error: message,
      raw: error?.response?.data
    };
  }
};

export const getZApiQrCode = async (config: ZApiConfig) => {
  const client = zapiClient(config);
  try {
    const { data } = await client.get("/qr-code/image");
    return data;
  } catch (error: any) {
    const { message } = getZApiErrorDetails(error);
    logger.error(`[Z-API] Erro ao obter QR Code: ${message}`);
    return null;
  }
};

export const disconnectZApi = async (config: ZApiConfig) => {
  const client = zapiClient(config);
  try {
    const { data } = await client.get("/disconnect");
    logger.info(`[Z-API] Instância desconectada`);
    return data;
  } catch (error: any) {
    const { message } = getZApiErrorDetails(error);
    logger.error(`[Z-API] Erro ao desconectar: ${message}`);
    return null;
  }
};

export const restartZApi = async (config: ZApiConfig) => {
  const client = zapiClient(config);
  try {
    const { data } = await client.get("/restart");
    logger.info(`[Z-API] Instância reiniciada`);
    return data;
  } catch (error: any) {
    const { message } = getZApiErrorDetails(error);
    logger.error(`[Z-API] Erro ao reiniciar: ${message}`);
    return null;
  }
};

/**
 * Registra/atualiza a URL do webhook na Z-API para que ela envie eventos
 * de mensagens recebidas, status, ACK etc. para o nosso backend.
 */
export const setZApiWebhook = async (config: ZApiConfig): Promise<boolean> => {
  const client = zapiClient(config);
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
  const webhookUrl = `${backendUrl}/zapi/webhook/${config.zapiInstanceId}`;

  try {
    // Configurar cada webhook individualmente (mais compatível)
    await client.put("/update-webhook-received", { value: webhookUrl });
    logger.info(`[Z-API] ✅ Webhook received configurado: ${webhookUrl}`);

    await client.put("/update-webhook-status", { value: webhookUrl });
    logger.info(`[Z-API] ✅ Webhook status configurado: ${webhookUrl}`);

    await client.put("/update-webhook-delivery", { value: webhookUrl });
    logger.info(`[Z-API] ✅ Webhook delivery configurado: ${webhookUrl}`);

    return true;
  } catch (error: any) {
    const { message } = getZApiErrorDetails(error);
    logger.error(`[Z-API] ❌ Erro ao configurar webhook: ${message}`);
    return false;
  }
};

export const buildPublicMediaUrl = (mediaUrl: string): string => {
  if (!mediaUrl) return "";
  if (mediaUrl.startsWith("http")) return mediaUrl;
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
  return `${backendUrl}/public/${mediaUrl}`;
};
