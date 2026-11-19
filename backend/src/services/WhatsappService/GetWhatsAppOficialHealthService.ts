import axios from "axios";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

interface HealthResult {
  whatsappId: number;
  name: string;
  channel: string;
  phone_number: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  business_id: string | null;
  verified_name: string | null;
  display_phone_number: string | null;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  platform_type: string | null;
  code_verification_status: string | null;
  name_status: string | null;
  throughput: any | null;
  account_review_status: string | null;
  business_verification_status: string | null;
  waba_name: string | null;
  sent_24h: number | null;
  delivered_24h: number | null;
  limit_24h: number | null;
  fetchedAt: string;
  error: string | null;
}

const fetchPhoneNumber = async (
  phoneNumberId: string,
  token: string
): Promise<any> => {
  const fields = [
    "verified_name",
    "display_phone_number",
    "quality_rating",
    "messaging_limit_tier",
    "platform_type",
    "code_verification_status",
    "name_status",
    "throughput"
  ].join(",");
  const { data } = await axios.get(
    `${GRAPH_BASE}/${phoneNumberId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  );
  return data;
};

const fetchWaba = async (wabaId: string, token: string): Promise<any> => {
  const fields = [
    "name",
    "account_review_status",
    "business_verification_status"
  ].join(",");
  const { data } = await axios.get(
    `${GRAPH_BASE}/${wabaId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  );
  return data;
};

const TIER_TO_LIMIT: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: -1,
  // Variantes sem prefixo (algumas respostas da Meta retornam assim)
  "50": 50,
  "250": 250,
  "1K": 1000,
  "10K": 10000,
  "100K": 100000,
  UNLIMITED: -1
};

const parseTierToLimit = (tier: string | null | undefined): number | null => {
  if (!tier) return null;
  const key = String(tier).toUpperCase().trim();
  if (TIER_TO_LIMIT[key] !== undefined) return TIER_TO_LIMIT[key];
  // Tentativa por regex: TIER_1K, TIER_10000 etc.
  const m = key.match(/(\d+)(K|M)?/);
  if (m) {
    let n = Number(m[1]);
    if (m[2] === "K") n *= 1000;
    else if (m[2] === "M") n *= 1000000;
    if (n > 0) return n;
  }
  if (key.includes("UNLIMITED")) return -1;
  return null;
};

const fetchPhoneNumbersFromWaba = async (
  wabaId: string,
  phoneNumberId: string,
  token: string
): Promise<any | null> => {
  try {
    const fields = [
      "id",
      "verified_name",
      "display_phone_number",
      "quality_rating",
      "messaging_limit_tier",
      "platform_type",
      "code_verification_status",
      "name_status",
      "throughput"
    ].join(",");
    const { data } = await axios.get(
      `${GRAPH_BASE}/${wabaId}/phone_numbers?fields=${fields}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );
    const arr: any[] = data?.data || [];
    return arr.find(p => String(p.id) === String(phoneNumberId)) || null;
  } catch (err: any) {
    const msg =
      err?.response?.data?.error?.message || err?.message || "unknown";
    logger.warn(`[WHATSAPP HEALTH] waba/phone_numbers fallback error: ${msg}`);
    return null;
  }
};

const fetchAnalytics24h = async (
  wabaId: string,
  phoneNumberId: string,
  token: string
): Promise<{ sent: number; delivered: number; error?: string } | null> => {
  try {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 24 * 3600;
    const fields = `analytics.start(${start}).end(${end}).granularity(DAY).phone_numbers(["${phoneNumberId}"])`;
    const { data } = await axios.get(
      `${GRAPH_BASE}/${wabaId}?fields=${fields}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );
    const points: any[] = data?.analytics?.data_points || [];
    let sent = 0;
    let delivered = 0;
    points.forEach(p => {
      sent += Number(p.sent || 0);
      delivered += Number(p.delivered || 0);
    });
    return { sent, delivered };
  } catch (err: any) {
    const code = err?.response?.data?.error?.code;
    const msg = err?.response?.data?.error?.message || err?.message || "unknown";
    logger.error(`[WHATSAPP HEALTH] analytics error (code=${code}): ${msg}`);
    return { sent: 0, delivered: 0, error: `analytics: ${msg}` };
  }
};


const mapHealth = (whats: Whatsapp): HealthResult => ({
  whatsappId: whats.id,
  name: whats.name,
  channel: whats.channel,
  phone_number: whats.phone_number || null,
  phone_number_id: whats.phone_number_id || null,
  waba_id: whats.waba_id || null,
  business_id: whats.business_id || null,
  verified_name: null,
  display_phone_number: null,
  quality_rating: null,
  messaging_limit_tier: null,
  platform_type: null,
  code_verification_status: null,
  name_status: null,
  throughput: null,
  account_review_status: null,
  business_verification_status: null,
  waba_name: null,
  sent_24h: null,
  delivered_24h: null,
  limit_24h: null,
  fetchedAt: new Date().toISOString(),
  error: null
});

export const getWhatsAppOficialHealth = async (
  whatsappId: number | string,
  companyId: number
): Promise<HealthResult> => {
  const whats = await Whatsapp.findOne({
    where: { id: whatsappId, companyId }
  });
  if (!whats) throw new AppError("ERR_NO_WAPP_FOUND", 404);

  const result = mapHealth(whats);

  if (whats.channel !== "whatsapp_oficial") {
    result.error = "NOT_OFFICIAL_CHANNEL";
    return result;
  }

  const token = whats.send_token || whats.tokenMeta;
  if (!token || !whats.phone_number_id) {
    result.error = "MISSING_TOKEN_OR_PHONE_NUMBER_ID";
    return result;
  }

  try {
    const phoneData = await fetchPhoneNumber(whats.phone_number_id, token);
    result.verified_name = phoneData?.verified_name ?? null;
    result.display_phone_number = phoneData?.display_phone_number ?? null;
    result.quality_rating = phoneData?.quality_rating ?? null;
    result.messaging_limit_tier = phoneData?.messaging_limit_tier ?? null;
    result.platform_type = phoneData?.platform_type ?? null;
    result.code_verification_status =
      phoneData?.code_verification_status ?? null;
    result.name_status = phoneData?.name_status ?? null;
    result.throughput = phoneData?.throughput ?? null;
  } catch (err: any) {
    const msg =
      err?.response?.data?.error?.message || err?.message || "unknown";
    logger.error(`[WHATSAPP HEALTH] phone_number error: ${msg}`);
    result.error = `phone_number: ${msg}`;
  }

  if (whats.waba_id) {
    try {
      const wabaData = await fetchWaba(whats.waba_id, token);
      result.waba_name = wabaData?.name ?? null;
      result.account_review_status = wabaData?.account_review_status ?? null;
      result.business_verification_status =
        wabaData?.business_verification_status ?? null;
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message || err?.message || "unknown";
      logger.error(`[WHATSAPP HEALTH] waba error: ${msg}`);
      result.error = result.error
        ? `${result.error} | waba: ${msg}`
        : `waba: ${msg}`;
    }
  }

  // Map tier -> numeric daily limit
  if (!result.messaging_limit_tier && whats.waba_id && whats.phone_number_id) {
    // Fallback: tentar obter o tier listando phone_numbers da WABA
    const token2 = whats.send_token || whats.tokenMeta;
    if (token2) {
      const pn = await fetchPhoneNumbersFromWaba(
        whats.waba_id,
        whats.phone_number_id,
        token2
      );
      if (pn) {
        if (!result.messaging_limit_tier)
          result.messaging_limit_tier = pn.messaging_limit_tier ?? null;
        if (!result.quality_rating)
          result.quality_rating = pn.quality_rating ?? null;
        if (!result.throughput) result.throughput = pn.throughput ?? null;
      }
    }
  }
  const parsedLimit = parseTierToLimit(result.messaging_limit_tier);
  if (parsedLimit !== null) result.limit_24h = parsedLimit;

  // Se ainda não veio o tier, deixe a causa explícita para o usuário entender
  if (!result.messaging_limit_tier) {
    const hint =
      "Não foi possível obter o limite de envio (tier) deste número. Verifique se o token possui a permissão 'whatsapp_business_management' no Gerenciador da Meta, ou aguarde a Meta promover o número para um tier (ex: 1.000 conversas/dia).";
    result.error = result.error ? `${result.error} | ${hint}` : hint;
  }


  // Fetch analytics (sent/delivered nas últimas 24h)
  if (whats.waba_id && whats.phone_number_id) {
    const analytics = await fetchAnalytics24h(
      whats.waba_id,
      whats.phone_number_id,
      token
    );
    if (analytics) {
      result.sent_24h = analytics.sent;
      result.delivered_24h = analytics.delivered;
      if (analytics.error) {
        const analyticsMsg = `${analytics.error} (o token precisa da permissão 'whatsapp_business_management')`;
        result.error = result.error ? `${result.error} | ${analyticsMsg}` : analyticsMsg;
      }

    }
  }


  return result;
};

export const getAllWhatsAppOficialHealth = async (
  companyId: number
): Promise<HealthResult[]> => {
  const whatsapps = await Whatsapp.findAll({
    where: { companyId, channel: "whatsapp_oficial" }
  });

  return Promise.all(
    whatsapps.map(async w => {
      try {
        return await getWhatsAppOficialHealth(w.id, companyId);
      } catch (err: any) {
        const base = mapHealth(w);
        base.error = err?.message || "unknown";
        return base;
      }
    })
  );
};
