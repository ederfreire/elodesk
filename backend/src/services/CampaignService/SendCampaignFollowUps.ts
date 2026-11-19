import path from "path";
import logger from "../../utils/logger";
import SendWhatsAppOficialMessage from "../WhatsAppOficial/SendWhatsAppOficialMessage";
import Campaign from "../../models/Campaign";
import CampaignShipping from "../../models/CampaignShipping";
import Ticket from "../../models/Ticket";
import QuickMessage from "../../models/QuickMessage";
import QuickMessageComponent from "../../models/QuickMessageComponent";
import { aplicarVariaveisDeCampanha } from "../../helpers/VariaveisDeCampanha";

interface Params {
  campaign: Campaign;
  campaignShipping: CampaignShipping;
  ticket: Ticket;
}

/**
 * Envia as mensagens de follow-up (message1..message5 + mídias por mensagem)
 * para um contato após ele ter respondido ao template oficial.
 *
 * Importante: a API Oficial da Meta só aceita mensagens de texto livre
 * dentro da janela de 24h iniciada pela resposta do cliente. Por isso
 * este helper só deve ser chamado APÓS o webhook detectar uma mensagem
 * recebida do contato.
 */
const SendCampaignFollowUps = async ({
  campaign,
  campaignShipping,
  ticket
}: Params): Promise<void> => {
  if (!campaign.sendFollowUpMessage) return;

  const messageKeys = ["message1", "message2", "message3", "message4", "message5"];
  const messageTexts: Record<string, string> = {
    message1: campaign.message1 || "",
    message2: campaign.message2 || "",
    message3: campaign.message3 || "",
    message4: campaign.message4 || "",
    message5: campaign.message5 || ""
  };

  // Templates por slot (modo "Template aprovado" no formulário)
  let parsedTemplates: Record<string, { templateId: number; name?: string }> = {};
  try {
    if ((campaign as any).messageTemplates) {
      parsedTemplates = JSON.parse((campaign as any).messageTemplates);
    }
  } catch (e) {}

  // Slots ativos: tem texto OU tem template configurado
  const activeSlots = messageKeys.filter(k =>
    (messageTexts[k] && messageTexts[k].trim() !== "") ||
    !!parsedTemplates[k]
  );

  const hasMedia = !!campaign.mediaPath;

  if (activeSlots.length === 0 && !hasMedia) return;

  const contactName = (campaignShipping as any).contact?.name || "";
  const contactNumber = campaignShipping.number || "";
  const contactEmail = (campaignShipping as any).contact?.email || "";
  const firstName = contactName.split(" ")[0] || "";

  // Variáveis personalizadas cadastradas na campanha. O disparo normal
  // (queues.ts) já as aplicava; o follow-up ignorava por completo.
  let variaveisDaCampanha: { key: string; value: string }[] = [];
  try {
    const cru = (campaign as any).variables;
    if (cru) {
      const lista = typeof cru === "string" ? JSON.parse(cru) : cru;
      if (Array.isArray(lista)) variaveisDaCampanha = lista;
    }
  } catch { /* campanha sem variáveis válidas: segue sem elas */ }

  // Mídia global (campanha) — usada apenas no primeiro slot quando não há mídia per-message nem template
  let followUpMedia: any = null;
  let mediaType: any = "text";
  if (hasMedia) {
    const mediaFilePath = path.resolve(
      "public",
      `company${campaign.companyId}`,
      campaign.mediaPath
    );
    const ext = campaign.mediaPath.split(".").pop()?.toLowerCase();
    let mimetype = "application/octet-stream";
    if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      mimetype = `image/${ext === "jpg" ? "jpeg" : ext}`;
      mediaType = "image";
    } else if (["mp4", "3gp", "webm"].includes(ext)) {
      mimetype = `video/${ext}`;
      mediaType = "video";
    } else if (["mp3", "ogg", "wav", "m4a"].includes(ext)) {
      mimetype = `audio/${ext}`;
      mediaType = "audio";
    } else {
      mediaType = "document";
    }
    followUpMedia = {
      path: mediaFilePath,
      mimetype,
      originalname: campaign.mediaName || `file.${ext}`,
      filename: campaign.mediaName || `file.${ext}`
    };
  }

  const defaultDelayMs = (campaign.followUpDelay || 3) * 1000;
  let parsedDelays: Record<string, number> = {};
  try {
    if (campaign.messageDelays) parsedDelays = JSON.parse(campaign.messageDelays);
  } catch (e) {}

  let parsedMedias: Record<string, { path: string; name: string }> = {};
  try {
    if ((campaign as any).messageMedias)
      parsedMedias = JSON.parse((campaign as any).messageMedias);
  } catch (e) {}

  // Cache local de templates para evitar refetch
  const templateCache: Record<number, any> = {};
  const loadTemplate = async (id: number) => {
    if (templateCache[id]) return templateCache[id];
    const t = await QuickMessage.findByPk(id, {
      include: [{ model: QuickMessageComponent, as: "components" }]
    });
    templateCache[id] = t;
    return t;
  };

  for (let i = 0; i < activeSlots.length; i++) {
    const msgKey = activeSlots[i];
    const delayMs = parsedDelays[msgKey]
      ? parsedDelays[msgKey] * 1000
      : defaultDelayMs;
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const slotTemplate = parsedTemplates[msgKey];

    // ── Modo TEMPLATE APROVADO ─────────────────────────────────────────────
    if (slotTemplate && slotTemplate.templateId) {
      try {
        const tpl = await loadTemplate(slotTemplate.templateId);
        if (!tpl) {
          logger.warn(
            `[CAMPAIGN-FOLLOWUP] Template ${slotTemplate.templateId} (slot ${msgKey}) não encontrado. Pulando.`
          );
          continue;
        }

        const templateData: any = {
          name: tpl.shortcode,
          language: { code: tpl.language || "pt_BR" }
        };
        // NÃO enviamos components aqui — UI restringe seleção a templates sem variáveis.

        logger.info(
          `[CAMPAIGN-FOLLOWUP] Enviando template "${tpl.shortcode}" (${i + 1}/${activeSlots.length}) para ${contactNumber}`
        );

        await SendWhatsAppOficialMessage({
          body: "",
          ticket,
          type: "template",
          template: templateData,
          quotedMsg: null,
          media: null,
          vCard: null
        });
      } catch (err: any) {
        logger.error(
          `[CAMPAIGN-FOLLOWUP] Falha no envio do template (slot ${msgKey}) para ${contactNumber}: ${err?.message || err}`
        );
      }
      continue;
    }

    // ── Modo TEXTO LIVRE (com mídia opcional) ──────────────────────────────
    // Antes eram quatro substituições feitas à mão aqui, e apenas na forma de
    // chave simples. Quem usasse {greeting}, {atendente}, {protocol}, uma
    // variável personalizada da campanha, ou escrevesse com chave dupla
    // ({{nome}}) — como o resto da plataforma usa — recebia o texto cru no
    // follow-up, mesmo tendo funcionado no primeiro disparo.
    //
    // Agora usa o MESMO resolvedor do disparo normal (helpers/
    // VariaveisDeCampanha), então as duas telas não podem mais divergir.
    const msg = aplicarVariaveisDeCampanha(
      messageTexts[msgKey] || "",
      {
        name: contactName,
        number: contactNumber,
        email: contactEmail,
        id: (campaignShipping as any).contact?.id,
        userName: (ticket as any)?.user?.name
      },
      variaveisDaCampanha
    );

    let sendMedia: any = null;
    let sendType: any = "text";
    const perMsgMedia = parsedMedias[msgKey];

    if (perMsgMedia) {
      const mediaFilePath = path.resolve(
        "public",
        `company${campaign.companyId}`,
        perMsgMedia.path
      );
      const ext = perMsgMedia.path.split(".").pop()?.toLowerCase();
      let mimetype = "application/octet-stream";
      if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
        mimetype = `image/${ext === "jpg" ? "jpeg" : ext}`;
        sendType = "image";
      } else if (["mp4", "3gp", "webm"].includes(ext)) {
        mimetype = `video/${ext}`;
        sendType = "video";
      } else if (["mp3", "ogg", "wav", "m4a"].includes(ext)) {
        mimetype = `audio/${ext}`;
        sendType = "audio";
      } else {
        sendType = "document";
      }
      sendMedia = {
        path: mediaFilePath,
        mimetype,
        originalname: perMsgMedia.name || `file.${ext}`,
        filename: perMsgMedia.name || `file.${ext}`
      };
    } else if (i === 0 && hasMedia) {
      // Apenas o primeiro slot herda a mídia global da campanha
      sendMedia = followUpMedia;
      sendType = mediaType;
    }

    logger.info(
      `[CAMPAIGN-FOLLOWUP] Enviando ${i + 1}/${activeSlots.length} (${msgKey}, ${sendType}) para ${contactNumber}: ${msg.substring(0, 80)}`
    );

    try {
      await SendWhatsAppOficialMessage({
        body: msg,
        ticket,
        type: sendType,
        template: null,
        quotedMsg: null,
        media: sendMedia,
        vCard: null
      });
    } catch (err: any) {
      logger.error(
        `[CAMPAIGN-FOLLOWUP] Falha no envio ${i + 1}/${activeSlots.length} para ${contactNumber}: ${err?.message || err}`
      );
      const errMsg = String(err?.message || "");
      if (
        errMsg.includes("131047") ||
        errMsg.includes("131026") ||
        errMsg.toLowerCase().includes("re-engagement")
      ) {
        logger.warn(
          `[CAMPAIGN-FOLLOWUP] Janela de 24h fechada para ${contactNumber}. Abortando demais follow-ups.`
        );
        break;
      }
    }
  }

  // Caso só haja mídia global, sem texto e sem templates
  if (activeSlots.length === 0 && hasMedia) {
    await new Promise(resolve => setTimeout(resolve, defaultDelayMs));
    try {
      await SendWhatsAppOficialMessage({
        body: "",
        ticket,
        type: mediaType,
        template: null,
        quotedMsg: null,
        media: followUpMedia,
        vCard: null
      });
    } catch (err: any) {
      logger.error(
        `[CAMPAIGN-FOLLOWUP] Falha no envio de mídia para ${contactNumber}: ${err?.message || err}`
      );
    }
  }

  // Marca como enviado
  try {
    await campaignShipping.update({ followUpSentAt: new Date() } as any);
  } catch (e) {}
};

export default SendCampaignFollowUps;
