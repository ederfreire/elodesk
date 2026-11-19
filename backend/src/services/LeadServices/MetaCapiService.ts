import axios from "axios";
import crypto from "crypto";
import Lead from "../../models/Lead";
import logger from "../../utils/logger";

/**
 * Envia evento de conversão para o Meta CAPI (Conversions API).
 * Usa action_source = "business_messaging" + ctwa_clid no user_data,
 * que é o método oficial para fechar o ciclo Click-to-WhatsApp.
 *
 * Configurar via variáveis de ambiente:
 *   META_PIXEL_ID
 *   META_ACCESS_TOKEN
 *   META_GRAPH_VERSION (opcional, default v22.0)
 *   META_TEST_EVENT_CODE (opcional, para Test Events)
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v22.0";

const sha256 = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  return crypto
    .createHash("sha256")
    .update(String(value).trim().toLowerCase())
    .digest("hex");
};

export type MetaCapiEvent =
  | "Lead"
  | "Contact"
  | "QualifiedLead"
  | "Schedule"
  | "Purchase";

export interface SendCapiOptions {
  value?: number;
  currency?: string;
  eventId?: string;
  customData?: Record<string, any>;
}

export const sendCapiEvent = async (
  lead: Lead | null,
  eventName: MetaCapiEvent,
  opts: SendCapiOptions = {}
): Promise<boolean> => {
  try {
    const PIXEL_ID = process.env.META_PIXEL_ID;
    const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

    if (!PIXEL_ID || !ACCESS_TOKEN) {
      logger.warn(
        "[META CAPI] META_PIXEL_ID/META_ACCESS_TOKEN não configurados — evento ignorado"
      );
      return false;
    }

    if (!lead) {
      logger.info("[META CAPI] Lead inexistente — pulando envio");
      return false;
    }

    if (!lead.ctwa_clid) {
      logger.info(
        `[META CAPI] Lead ${lead.id} sem ctwa_clid — não há atribuição CTWA, pulando`
      );
      return false;
    }

    const customData: Record<string, any> = { ...(opts.customData || {}) };
    if (typeof opts.value === "number") {
      customData.value = opts.value;
      customData.currency = opts.currency || "BRL";
    }

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          action_source: "business_messaging",
          messaging_channel: "whatsapp",
          event_id: opts.eventId || `lead_${lead.id}_${eventName}_${Date.now()}`,
          user_data: {
            ctwa_clid: lead.ctwa_clid,
            ph: lead.phone ? [sha256(lead.phone)] : undefined
          },
          custom_data: customData
        }
      ],
      ...(process.env.META_TEST_EVENT_CODE
        ? { test_event_code: process.env.META_TEST_EVENT_CODE }
        : {})
    };

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`;

    const { data } = await axios.post(url, payload, {
      params: { access_token: ACCESS_TOKEN },
      timeout: 15000
    });

    await lead.update({
      lastCapiEvent: eventName,
      lastCapiAt: new Date(),
      lastCapiError: null,
      status:
        eventName === "Purchase"
          ? "purchase"
          : eventName === "QualifiedLead"
          ? "qualified"
          : eventName === "Contact"
          ? "contact"
          : lead.status
    });

    logger.info(
      `[META CAPI] ✅ ${eventName} enviado p/ lead ${lead.id} (events_received=${data?.events_received})`
    );
    return true;
  } catch (err: any) {
    const detail =
      err?.response?.data
        ? JSON.stringify(err.response.data)
        : err?.message;
    logger.error(`[META CAPI] ❌ Falha ao enviar ${eventName}: ${detail}`);
    try {
      if (lead) {
        await lead.update({
          lastCapiError: String(detail).slice(0, 1000)
        });
      }
    } catch {}
    return false;
  }
};

export default sendCapiEvent;