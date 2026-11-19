import Lead from "../../models/Lead";
import logger from "../../utils/logger";

export interface LeadReferralInput {
  phone: string;
  companyId: number;
  channel?: "whatsapp_oficial" | "baileys";
  contactId?: number | null;
  firstTicketId?: number | null;
  firstMessage?: string | null;
  ctwa_clid?: string | null;
  adId?: string | null;
  adTitle?: string | null;
  adBody?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  mediaType?: string | null;
  thumbnailUrl?: string | null;
}

/**
 * Cria ou atualiza o lead vindo de anúncio Meta (CTWA).
 * Regra: NUNCA sobrescreve ctwa_clid existente com null/vazio,
 * pois ele só vem na 1ª mensagem.
 */
export const upsertLead = async (
  data: LeadReferralInput
): Promise<Lead | null> => {
  try {
    if (!data.phone || !data.companyId) return null;

    const phone = String(data.phone).replace(/\D/g, "");
    if (!phone) return null;

    const hasAnyAdData = !!(
      data.ctwa_clid ||
      data.adId ||
      data.adTitle ||
      data.sourceUrl
    );

    const [lead] = await Lead.findOrCreate({
      where: { companyId: data.companyId, phone },
      defaults: {
        phone,
        companyId: data.companyId,
        channel: data.channel || "whatsapp_oficial",
        contactId: data.contactId || null,
        firstTicketId: data.firstTicketId || null,
        firstMessage: data.firstMessage || null,
        ctwa_clid: data.ctwa_clid || null,
        adId: data.adId || null,
        adTitle: data.adTitle || null,
        adBody: data.adBody || null,
        sourceType: data.sourceType || null,
        sourceUrl: data.sourceUrl || null,
        mediaType: data.mediaType || null,
        thumbnailUrl: data.thumbnailUrl || null,
        status: "new"
      } as any
    });

    // se chegou novo referral (mensagem nova clicando em outro anúncio), atualiza
    if (hasAnyAdData) {
      const updates: any = {};
      if (data.ctwa_clid && !lead.ctwa_clid) updates.ctwa_clid = data.ctwa_clid;
      if (data.adId) updates.adId = data.adId;
      if (data.adTitle) updates.adTitle = data.adTitle;
      if (data.adBody) updates.adBody = data.adBody;
      if (data.sourceType) updates.sourceType = data.sourceType;
      if (data.sourceUrl) updates.sourceUrl = data.sourceUrl;
      if (data.mediaType) updates.mediaType = data.mediaType;
      if (data.thumbnailUrl) updates.thumbnailUrl = data.thumbnailUrl;
      if (data.contactId && !lead.contactId) updates.contactId = data.contactId;
      if (data.firstTicketId && !lead.firstTicketId)
        updates.firstTicketId = data.firstTicketId;
      if (Object.keys(updates).length) await lead.update(updates);
    }

    return lead;
  } catch (err: any) {
    logger.error(`[LEAD UPSERT] erro: ${err?.message}`);
    return null;
  }
};

export const findLeadByPhone = async (
  phone: string,
  companyId: number
): Promise<Lead | null> => {
  if (!phone) return null;
  const normalized = String(phone).replace(/\D/g, "");
  return Lead.findOne({ where: { companyId, phone: normalized } });
};

export default upsertLead;