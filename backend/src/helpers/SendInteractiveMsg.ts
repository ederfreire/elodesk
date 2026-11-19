import type { WAMessage, AnyMessageContent } from "@whiskeysockets/baileys";
import { proto, generateWAMessageFromContent } from "../compat/baileys";
import { Session } from "../libs/wbot";
import logger from "../utils/logger";

/**
 * Mensagens interativas (botões/listas/CTAs/PIX) no WhatsApp moderno.
 *
 * Fork: @itsliaaa/baileys — expõe uma API de ALTO NÍVEL que monta os nós
 * native_flow/biz_bot internamente. Não precisamos mais montar binary nodes
 * nem chamar relayMessage manualmente para botões/listas.
 *
 *   // Botões
 *   sock.sendMessage(jid, { text, footer, buttons: [{ text, id }] })
 *   // Lista (apenas chat privado @s.whatsapp.net)
 *   sock.sendMessage(jid, { text, footer, buttonText, title, sections: [...] })
 *   // CTAs / mistos
 *   sock.sendMessage(jid, { text, footer, nativeFlow: [{ text, id|url|call|copy }] })
 *
 * Para tipos avançados (payment_info, review_and_pay, carousel) que o fork não
 * expõe em alto nível, mantemos o relay manual via generateWAMessageFromContent.
 */

// ==================== Fallback em texto ====================

const shouldSendTextFallback = () =>
  process.env.BAILEYS_INTERACTIVE_TEXT_FALLBACK !== "false";

const sendTextFallback = async (
  wbot: Session,
  jid: string,
  text: string,
  label: string
): Promise<WAMessage | null> => {
  if (!shouldSendTextFallback() || !text.trim()) return null;

  try {
    const fb = await (wbot as any).sendMessage(jid, { text });
    logger.info(`[INTERACTIVE] Fallback em texto enviado para ${jid} (${label})`);
    return fb as WAMessage;
  } catch (fallbackErr: any) {
    logger.warn(
      `[INTERACTIVE] Falha no fallback em texto (${label}) para ${jid}: ${fallbackErr?.message}`
    );
    return null;
  }
};

// ==================== BOTÕES (quick_reply) ====================

export const sendInteractiveButtons = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  buttons: { displayText: string; id: string }[];
  headerImageUrl?: string;
  headerImageFullPath?: string;
}): Promise<WAMessage> => {
  const {
    wbot,
    jid,
    bodyText,
    footerText,
    buttons,
    headerImageUrl,
    headerImageFullPath,
  } = params;

  // ⚠️ O WhatsApp DESCARTA a mensagem interativa inteira se algum botão tiver
  // texto vazio — por isso sanitizamos (botões sem texto viram "Opção N").
  const normalizedButtons = buttons
    .map((btn, i) => ({
      text: (btn.displayText || "").trim() || `Opção ${i + 1}`,
      id: btn.id || String(i + 1),
    }))
    .slice(0, 3);

  if (!normalizedButtons.length) {
    throw new Error("Botões interativos sem opções válidas para envio");
  }

  // Resolve caminho/URL de imagem do header (opcional)
  let imagePath: string | undefined;
  let imageRemoteUrl: string | undefined;
  const imageRef = headerImageFullPath || headerImageUrl;
  if (imageRef) {
    // URL http(s): usa direto (Baileys baixa a imagem)
    if (/^https?:\/\//i.test(imageRef)) {
      imageRemoteUrl = imageRef;
      logger.info(`[INTERACTIVE] Header image (URL): ${imageRef}`);
    } else {
      try {
        const fs = await import("fs");
        const path = await import("path");
        let filePath: string;
        if (headerImageFullPath) {
          filePath = headerImageFullPath;
        } else {
          const publicDir = path.default.resolve(__dirname, "..", "..", "public");
          filePath = path.default.resolve(publicDir, headerImageUrl!);
        }
        if (fs.default.existsSync(filePath)) {
          imagePath = filePath;
          logger.info(`[INTERACTIVE] Header image carregada: ${filePath}`);
        } else {
          logger.warn(`[INTERACTIVE] Header image não encontrada: ${filePath}`);
        }
      } catch (imgErr: any) {
        logger.error(`[INTERACTIVE] Erro ao carregar header image: ${imgErr?.message}`);
      }
    }
  }

  try {
    const content: any = {
      buttons: normalizedButtons,
    };
    if (footerText) content.footer = footerText;

    if (imagePath || imageRemoteUrl) {
      content.image = { url: imagePath || imageRemoteUrl };
      content.caption = bodyText || " ";
    } else {
      content.text = bodyText || " ";
    }

    const msg = await (wbot as any).sendMessage(jid, content);

    logger.info(
      `[INTERACTIVE] Botões enviados para ${jid} (${normalizedButtons.length} botões${imagePath || imageRemoteUrl ? ", com imagem" : ""})`
    );
    return msg as WAMessage;
  } catch (err: any) {
    logger.error(`[INTERACTIVE] Falha ao enviar botões para ${jid}: ${err?.message}`);
    // Só agora (envio interativo falhou de verdade) caímos para texto puro.
    const fb = await sendTextFallback(
      wbot,
      jid,
      `${bodyText || ""}\n\n${normalizedButtons
        .map((btn, idx) => `*[ ${idx + 1} ]* - ${btn.text}`)
        .join("\n")}`,
      "buttons"
    );
    // Se o fallback em texto foi entregue, consideramos sucesso (cliente recebeu).
    if (fb) return fb;
    throw new Error(`Não foi possível enviar botões interativos para ${jid}`);
  }
};

// ==================== BOTÕES MISTOS (quick_reply + cta_url + cta_copy etc.) ====================

export const sendInteractiveMixedButtons = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  buttons: {
    type: "quick_reply" | "cta_url" | "cta_copy" | "cta_call";
    text: string;
    id?: string;
    url?: string;
    copyCode?: string;
    phoneNumber?: string;
  }[];
  // Imagem opcional exibida como header NA MESMA mensagem dos botões.
  headerImagePath?: string;
  headerImageUrl?: string;
}): Promise<WAMessage> => {
  const { wbot, jid, bodyText, footerText, buttons, headerImagePath, headerImageUrl } = params;

  if (!buttons?.length) {
    throw new Error("É necessário informar pelo menos um botão");
  }

  // Formato nativeFlow do fork @itsliaaa: { text, id|url|call|copy }
  const nativeFlow = buttons.slice(0, 5).map((btn, i) => {
    switch (btn.type) {
      case "cta_url":
        return { text: btn.text || "Abrir link", url: btn.url || "" };
      case "cta_copy":
        return { text: btn.text || "Copiar", copy: btn.copyCode || "" };
      case "cta_call":
        return { text: btn.text || "Ligar", call: btn.phoneNumber || "" };
      case "quick_reply":
      default:
        return { text: btn.text || `Opção ${i + 1}`, id: btn.id || String(i + 1) };
    }
  });

  const imageRef = headerImagePath || headerImageUrl;

  try {
    const content: any = {
      nativeFlow,
    };
    if (footerText) content.footer = footerText;

    if (imageRef) {
      // Imagem como header + botões na MESMA mensagem (mesmo balão).
      content.image = { url: imageRef };
      content.caption = bodyText || " ";
    } else {
      content.text = bodyText || " ";
    }

    const msg = await (wbot as any).sendMessage(jid, content);

    logger.info(`[INTERACTIVE] Mixed buttons enviados para ${jid} (${nativeFlow.length} botões)`);
    return msg as WAMessage;
  } catch (err: any) {
    logger.error(`[INTERACTIVE] Falha ao enviar mixed buttons para ${jid}: ${err?.message}`);
    // Fallback em texto: monta uma lista legível com links/códigos/telefones.
    const fbText = `${bodyText || ""}\n\n${nativeFlow
      .map((btn: any, idx: number) => {
        if (btn.url) return `${btn.text}: ${btn.url}`;
        if (btn.copy) return `${btn.text}: ${btn.copy}`;
        if (btn.call) return `${btn.text}: ${btn.call}`;
        return `*[ ${idx + 1} ]* - ${btn.text}`;
      })
      .join("\n")}`;
    const fb = await sendTextFallback(wbot, jid, fbText, "mixed");
    if (fb) return fb;
    throw new Error(`Não foi possível enviar botões mistos para ${jid}`);
  }
};

// ==================== LISTA (single_select) ====================

export const sendInteractiveList = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  buttonText: string;
  sections: {
    title: string;
    rows: { title: string; description?: string; id: string }[];
  }[];
}): Promise<WAMessage> => {
  const { wbot, jid, bodyText, footerText, buttonText, sections } = params;

  const safeBodyText = (bodyText || "Selecione uma opção:").trim().slice(0, 1024);
  const safeFooterTextRaw = footerText?.trim().slice(0, 60) || undefined;
  const safeFooterText =
    safeFooterTextRaw &&
    safeFooterTextRaw.toLowerCase() !== safeBodyText.toLowerCase()
      ? safeFooterTextRaw
      : undefined;
  const safeButtonText = (buttonText || "Selecionar").trim().slice(0, 20);

  // WhatsApp lista: até 10 linhas no total
  let rowsCount = 0;
  const normalizedSections = sections
    .filter((sec) => sec?.rows?.length)
    .map((sec) => {
      const sectionTitle = (sec.title || "Opções").trim().slice(0, 24);
      const rows = sec.rows
        .filter((row) => row?.id && row?.title)
        .slice(0, Math.max(0, 10 - rowsCount))
        .map((row, idx) => {
          rowsCount += 1;
          return {
            title: row.title.trim().slice(0, 24),
            description: (row.description || "").trim().slice(0, 72),
            // O fork @itsliaaa usa `rowId` (não `id`) nas linhas da lista.
            rowId: String(row.id).trim().slice(0, 200) || `row_${rowsCount}_${idx + 1}`,
          };
        });

      return { title: sectionTitle || "Opções", rows };
    })
    .filter((sec) => sec.rows.length > 0)
    .slice(0, 10);

  if (!normalizedSections.length) {
    throw new Error("Lista interativa sem opções válidas para envio");
  }

  const flatRows = normalizedSections.flatMap((s) => s.rows);

  try {
    const content: any = {
      text: safeBodyText,
      buttonText: safeButtonText,
      title: "",
      sections: normalizedSections,
    };
    if (safeFooterText) content.footer = safeFooterText;

    const msg = await (wbot as any).sendMessage(jid, content);

    logger.info(`[INTERACTIVE] Lista enviada para ${jid} (${flatRows.length} opções)`);
    return msg as WAMessage;
  } catch (err: any) {
    logger.error(`[INTERACTIVE] Falha ao enviar lista para ${jid}: ${err?.message}`);
    // Só caímos para texto puro quando o envio interativo falha de verdade.
    await sendTextFallback(
      wbot,
      jid,
      `${safeBodyText}\n\n${flatRows
        .map((row, idx) => `*[ ${idx + 1} ]* - ${row.title}`)
        .join("\n")}`,
      "list"
    );
    throw new Error(`Não foi possível enviar lista interativa para ${jid}`);
  }
};

// ==================== CTA URL ====================

export const sendInteractiveCTAUrl = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  displayText: string;
  url: string;
}): Promise<WAMessage> => {
  const { wbot, jid, bodyText, footerText, displayText, url } = params;

  return sendInteractiveMixedButtons({
    wbot,
    jid,
    bodyText,
    footerText,
    buttons: [{ type: "cta_url", text: displayText, url }],
  });
};

// ==================== CTA CALL ====================

export const sendInteractiveCTACall = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  displayText: string;
  phoneNumber: string;
}): Promise<WAMessage> => {
  const { wbot, jid, bodyText, footerText, displayText, phoneNumber } = params;

  return sendInteractiveMixedButtons({
    wbot,
    jid,
    bodyText,
    footerText,
    buttons: [{ type: "cta_call", text: displayText, phoneNumber }],
  });
};

// ==================== CTA COPY (PIX copy code) ====================

export const sendInteractiveCTACopy = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  displayText: string;
  copyCode: string;
}): Promise<WAMessage> => {
  const { wbot, jid, bodyText, footerText, displayText, copyCode } = params;

  return sendInteractiveMixedButtons({
    wbot,
    jid,
    bodyText,
    footerText,
    buttons: [{ type: "cta_copy", text: displayText, copyCode }],
  });
};

// ==================== PIX COPY + QR CODE (imagem) ====================
// Gera um QR Code (imagem PNG) a partir do código copia-e-cola e envia junto
// com o botão nativo "Copiar código PIX". Tenta enviar em uma única mensagem
// (imagem como header + botão cta_copy). Se o fork não suportar a combinação,
// cai para duas mensagens: imagem do QR Code primeiro e, em seguida, o botão.
export const sendInteractivePixCopyWithQrCode = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  displayText: string;
  copyCode: string;
}): Promise<WAMessage> => {
  const { wbot, jid, bodyText, footerText, displayText, copyCode } = params;

  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const QRCode = require("qrcode");

  const tmpFile = path.default.join(
    os.default.tmpdir(),
    `pixqr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`
  );

  let qrGenerated = false;
  try {
    await QRCode.toFile(tmpFile, copyCode, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    qrGenerated = true;
    logger.info(`[INTERACTIVE] QR Code PIX gerado: ${tmpFile}`);
  } catch (qrErr: any) {
    logger.error(`[INTERACTIVE] Falha ao gerar QR Code PIX: ${qrErr?.message}`);
  }

  // Estratégia: enviar a imagem do QR Code (como header) JUNTO com o botão
  // nativo "Copiar código PIX" na MESMA mensagem (mesmo balão).
  if (qrGenerated) {
    // Inclui o código "copia e cola" JUNTO com o QR Code, na mesma legenda,
    // para o cliente poder escanear OU copiar o código diretamente.
    const captionParts = [bodyText && bodyText.trim() ? bodyText.trim() : ""].filter(Boolean);
    captionParts.push("📲 *Escaneie o QR Code acima* ou copie o código abaixo:");
    if (copyCode) captionParts.push(`📋 *PIX Copia e Cola:*\n${copyCode}`);
    const qrCaption = captionParts.join("\n\n");

    try {
      const msg = await sendInteractiveMixedButtons({
        wbot,
        jid,
        bodyText: qrCaption || " ",
        footerText,
        buttons: [{ type: "cta_copy", text: displayText, copyCode }],
        headerImagePath: tmpFile,
      });
      logger.info(`[INTERACTIVE] QR Code PIX + botão enviados no mesmo balão para ${jid}`);
      return msg;
    } catch (combinedErr: any) {
      logger.warn(
        `[INTERACTIVE] Falha ao enviar QR Code + botão juntos (${combinedErr?.message}). Caindo para mensagens separadas.`
      );
      // Fallback: imagem do QR Code e depois o botão como mensagens separadas.
      try {
        await (wbot as any).sendMessage(jid, {
          image: { url: tmpFile },
          caption: qrCaption || " ",
        });
      } catch (imgErr: any) {
        logger.error(`[INTERACTIVE] Falha ao enviar imagem do QR Code PIX: ${imgErr?.message}`);
      }
      return sendInteractiveCTACopy({
        wbot,
        jid,
        bodyText: " ",
        footerText,
        displayText,
        copyCode,
      });
    } finally {
      try {
        fs.default.unlinkSync(tmpFile);
      } catch (_) {
        /* noop */
      }
    }
  }

  // Sem QR Code, envia apenas o botão de copiar com o corpo completo.
  return sendInteractiveCTACopy({ wbot, jid, bodyText, footerText, displayText, copyCode });
};

// ==================== PIX COPY + DOCUMENTO (PDF como header) ====================
// Envia o PDF (boleto/fatura) como CABEÇALHO (documento) seguido do botão
// "Copiar chave Pix". O PDF pode vir de um caminho LOCAL (upload) ou de uma URL
// externa. Envia documento e botão como mensagens separadas (mais confiável).
export const sendInteractivePixWithDocument = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  displayText: string;
  copyCode: string;
  documentUrl?: string;
  documentPath?: string;
  fileName?: string;
}): Promise<WAMessage> => {
  const { wbot, jid, bodyText, footerText, displayText, copyCode, documentUrl, documentPath, fileName } =
    params;

  const fsMod = await import("fs");

  // Nome do arquivo (sempre .pdf)
  const rawName = (fileName || "documento").trim() || "documento";
  const safeName = rawName.replace(/[^\w.\-]/g, "_");
  const finalName = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;

  // 1) Obtém o buffer do PDF (arquivo local OU download da URL)
  let buffer: Buffer;
  try {
    if (documentPath && fsMod.default.existsSync(documentPath)) {
      buffer = fsMod.default.readFileSync(documentPath);
      logger.info(`[INTERACTIVE] PDF PIX lido do arquivo local (${buffer.length} bytes): ${documentPath}`);
    } else if (documentUrl) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const axios = (await import("axios")).default;
      const resp = await axios.get(documentUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024,
      });
      buffer = Buffer.from(resp.data);
      logger.info(`[INTERACTIVE] PDF PIX baixado (${buffer.length} bytes) de ${documentUrl}`);
    } else {
      throw new Error("Nenhuma fonte de documento (path/url) informada");
    }
  } catch (dlErr: any) {
    logger.error(`[INTERACTIVE] Falha ao obter PDF PIX: ${dlErr?.message}`);
    // Sem PDF, envia apenas o botão de copiar.
    return sendInteractiveCTACopy({ wbot, jid, bodyText, footerText, displayText, copyCode });
  }

  // 2) Envia o documento primeiro
  try {
    await (wbot as any).sendMessage(jid, {
      document: buffer,
      mimetype: "application/pdf",
      fileName: finalName,
      caption: bodyText || " ",
    });
    logger.info(`[INTERACTIVE] Documento PIX enviado para ${jid}`);
  } catch (docErr: any) {
    logger.error(`[INTERACTIVE] Falha ao enviar documento PIX: ${docErr?.message}`);
  }

  // 3) Botão de copiar como mensagem separada garantida.
  return sendInteractiveCTACopy({ wbot, jid, bodyText: " ", footerText, displayText, copyCode });
};

// ==================== COBRANÇA: PDF (header) + BOTÃO no MESMO balão ====================
// Igual ao PIX+QR: tenta enviar o documento (boleto/comprovante) JUNTO com o
// botão de pagamento (cta_url) na MESMA mensagem. Se o fork não suportar a
// combinação documento+botão, cai para documento com legenda e botão no mesmo
// balão de texto via fallback de mensagens encadeadas.
export const sendInteractiveCobrancaWithDocument = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  displayText: string;
  url?: string;
  documentUrl?: string;
  documentPath?: string;
  fileName?: string;
}): Promise<WAMessage> => {
  const {
    wbot,
    jid,
    bodyText,
    footerText,
    displayText,
    url,
    documentUrl,
    documentPath,
    fileName,
  } = params;

  const fsMod = await import("fs");

  const rawName = (fileName || "cobranca").trim() || "cobranca";
  const safeName = rawName.replace(/[^\w.\-]/g, "_");
  const finalName = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;

  // 1) Obtém o buffer do PDF (arquivo local OU download da URL)
  let buffer: Buffer | undefined;
  try {
    if (documentPath && fsMod.default.existsSync(documentPath)) {
      buffer = fsMod.default.readFileSync(documentPath);
      logger.info(`[INTERACTIVE] PDF cobrança lido do arquivo local (${buffer.length} bytes): ${documentPath}`);
    } else if (documentUrl) {
      const axios = (await import("axios")).default;
      const resp = await axios.get(documentUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024,
      });
      buffer = Buffer.from(resp.data);
      logger.info(`[INTERACTIVE] PDF cobrança baixado (${buffer.length} bytes) de ${documentUrl}`);
    }
  } catch (dlErr: any) {
    logger.error(`[INTERACTIVE] Falha ao obter PDF cobrança: ${dlErr?.message}`);
    buffer = undefined;
  }

  // Sem PDF: cai para o botão simples (cta_url) ou texto puro.
  if (!buffer) {
    if (url) {
      return sendInteractiveCTAUrl({ wbot, jid, bodyText, footerText, displayText, url });
    }
    return (await (wbot as any).sendMessage(jid, {
      text: footerText ? `${bodyText}\n\n_${footerText}_` : bodyText,
    })) as WAMessage;
  }

  // 2) Tenta enviar o DOCUMENTO + BOTÃO no MESMO balão (documento como header).
  if (url) {
    try {
      const content: any = {
        document: buffer,
        mimetype: "application/pdf",
        fileName: finalName,
        caption: bodyText || " ",
        nativeFlow: [{ text: displayText || "Pagar agora", url }],
      };
      if (footerText) content.footer = footerText;

      const msg = (await (wbot as any).sendMessage(jid, content)) as WAMessage;
      logger.info(`[INTERACTIVE] Cobrança (PDF + botão) enviada no mesmo balão para ${jid}`);
      return msg;
    } catch (combinedErr: any) {
      logger.warn(
        `[INTERACTIVE] Falha ao enviar PDF + botão de cobrança juntos (${combinedErr?.message}). Caindo para mensagens encadeadas.`
      );
    }
  }

  // 3) Fallback: documento com a legenda (corpo da cobrança) e, em seguida, o botão.
  try {
    await (wbot as any).sendMessage(jid, {
      document: buffer,
      mimetype: "application/pdf",
      fileName: finalName,
      caption: bodyText || " ",
    });
    logger.info(`[INTERACTIVE] Documento de cobrança enviado para ${jid}`);
  } catch (docErr: any) {
    logger.error(`[INTERACTIVE] Falha ao enviar documento de cobrança: ${docErr?.message}`);
  }

  if (url) {
    return sendInteractiveCTAUrl({ wbot, jid, bodyText: " ", footerText, displayText, url });
  }
  return (await (wbot as any).sendMessage(jid, { text: " " })) as WAMessage;
};

// ==================== RELAY MANUAL (tipos avançados de pagamento/carousel) ====================
// O fork @itsliaaa não expõe payment_info / review_and_pay / carousel em alto
// nível, então mantemos o caminho manual via generateWAMessageFromContent.

const relayInteractive = async (
  wbot: Session,
  jid: string,
  interactivePayload: any
): Promise<WAMessage> => {
  const normalizedInteractive = {
    ...interactivePayload,
    header:
      interactivePayload?.header ?? { title: "", hasMediaAttachment: false },
  };

  const interactiveMessage =
    typeof (proto as any)?.Message?.InteractiveMessage?.create === "function"
      ? (proto as any).Message.InteractiveMessage.create(normalizedInteractive)
      : normalizedInteractive;

  const contentObject = {
    messageContextInfo: {
      deviceListMetadataVersion: 2,
      deviceListMetadata: {},
    },
    interactiveMessage,
  };

  const content =
    typeof (proto as any)?.Message?.fromObject === "function"
      ? (proto as any).Message.fromObject(contentObject)
      : contentObject;

  const msg = generateWAMessageFromContent(jid, content as any, {
    userJid: (wbot as any).user?.id,
  } as any);

  const firstButtonName =
    normalizedInteractive?.nativeFlowMessage?.buttons?.[0]?.name;
  const isGroup = typeof jid === "string" && jid.endsWith("@g.us");
  const nativeFlowAdditionalNodes = buildNativeFlowAdditionalNodes(
    firstButtonName,
    isGroup
  );

  await (wbot as any).relayMessage(jid, msg.message!, {
    messageId: msg.key.id!,
    additionalNodes: nativeFlowAdditionalNodes,
  });

  return msg as WAMessage;
};

const buildNativeFlowAdditionalNodes = (buttonName?: string, isGroup = false) => {
  let flowName = "mixed";
  let flowVersion = "9";
  if (buttonName === "review_and_pay") {
    flowName = "order_details";
    flowVersion = "1";
  } else if (buttonName === "payment_info") {
    flowName = "payment_info";
    flowVersion = "1";
  }

  const bizNode = {
    tag: "biz",
    attrs: {},
    content: [
      {
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [
          {
            tag: "native_flow",
            attrs: { name: flowName, v: flowVersion },
          },
        ],
      },
    ],
  };

  if (isGroup) {
    return [bizNode];
  }

  return [bizNode, { tag: "bot", attrs: { biz_bot: "1" } }];
};

// ==================== PAYMENT INFO (PIX) ====================

const detectPixKeyType = (key: string): string => {
  if (!key) return "EVP";
  const cleaned = key.replace(/[.\-/]/g, "");
  if (/^\d{11}$/.test(cleaned)) return "CPF";
  if (/^\d{14}$/.test(cleaned)) return "CNPJ";
  if (/^\+?\d{10,13}$/.test(cleaned)) return "PHONE";
  if (key.includes("@")) return "EMAIL";
  return "EVP";
};

export const sendInteractivePaymentInfo = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  pixKey: string;
  pixKeyType?: string;
  pixMerchantName?: string;
}): Promise<WAMessage> => {
  const { wbot, jid, bodyText, footerText, pixKey, pixKeyType, pixMerchantName } =
    params;
  const keyType = pixKeyType || detectPixKeyType(pixKey);

  const paymentInfoParams = JSON.stringify({
    payment_settings: [
      {
        type: "pix_static_code",
        pix_static_code: {
          merchant_name: pixMerchantName || "Pagamento",
          key: pixKey,
          key_type: keyType,
        },
      },
    ],
  });

  try {
    const msg = await relayInteractive(wbot, jid, {
      body: { text: bodyText || " " },
      footer: footerText ? { text: footerText } : undefined,
      nativeFlowMessage: {
        buttons: [
          {
            name: "payment_info",
            buttonParamsJson: paymentInfoParams,
          },
        ],
      },
    });

    logger.info(`[INTERACTIVE] Payment Info PIX (relay) enviado para ${jid}`);
    return msg;
  } catch (err: any) {
    logger.error(`[INTERACTIVE] Falha ao enviar Payment Info para ${jid}: ${err?.message}`);
    throw new Error(`Não foi possível enviar Payment Info para ${jid}`);
  }
};

// ==================== REVIEW AND PAY (Cobrança / Offer) ====================

export const sendInteractiveReviewAndPay = async (params: {
  wbot: Session;
  jid: string;
  bodyText: string;
  footerText?: string;
  currency?: string;
  totalAmountValue: number;
  referenceId: string;
  type?: string;
  orderStatus?: string;
  items: {
    retailer_id: string;
    name: string;
    amount: { value: number; offset: number };
    quantity: number;
  }[];
  additionalNote?: string;
}): Promise<WAMessage> => {
  const {
    wbot, jid, bodyText, footerText,
    currency = "BRL", totalAmountValue, referenceId,
    type = "digital-goods", orderStatus = "pending",
    items, additionalNote,
  } = params;

  const reviewAndPayParams = JSON.stringify({
    currency,
    payment_configuration: "",
    payment_type: "",
    total_amount: {
      value: String(totalAmountValue),
      offset: "100",
    },
    reference_id: referenceId,
    type,
    payment_method: "confirm",
    payment_status: "captured",
    payment_timestamp: Math.floor(Date.now() / 1000),
    order: {
      status: orderStatus,
      description: "",
      subtotal: {
        value: String(totalAmountValue),
        offset: "100",
      },
      order_type: "PAYMENT_REQUEST",
      items: items.map((item) => ({
        retailer_id: item.retailer_id,
        name: item.name,
        amount: {
          value: String(item.amount.value),
          offset: String(item.amount.offset),
        },
        quantity: String(item.quantity),
      })),
    },
    additional_note: additionalNote || "",
    native_payment_methods: [],
    share_payment_status: false,
  });

  try {
    const msg = await relayInteractive(wbot, jid, {
      body: { text: bodyText || " " },
      footer: footerText ? { text: footerText } : undefined,
      nativeFlowMessage: {
        buttons: [
          {
            name: "review_and_pay",
            buttonParamsJson: reviewAndPayParams,
          },
        ],
      },
    });

    logger.info(`[INTERACTIVE] Review and Pay (relay) enviado para ${jid}`);
    return msg;
  } catch (err: any) {
    logger.error(`[INTERACTIVE] Falha ao enviar Review and Pay para ${jid}: ${err?.message}`);
    throw new Error(`Não foi possível enviar Review and Pay para ${jid}`);
  }
};

// ==================== CAROUSEL ====================

export const sendInteractiveCarousel = async (params: {
  wbot: Session;
  jid: string;
  bodyText?: string;
  footerText?: string;
  cards: {
    title?: string;
    bodyText: string;
    imageUrl?: string;
    footerText?: string;
    buttons?: {
      type?: "quick_reply" | "cta_url" | "cta_copy" | "cta_call";
      text: string;
      id?: string;
      url?: string;
      copyCode?: string;
      phoneNumber?: string;
    }[];
  }[];
}): Promise<WAMessage> => {
  const { wbot, jid, bodyText, footerText, cards } = params;

  const normalizedCards = cards
    .filter((card) => card?.bodyText || card?.title || card?.imageUrl)
    .slice(0, 10)
    .map((card, idx) => {
      const cardText = [card.title ? `*${card.title}*` : "", card.bodyText || ""]
        .filter(Boolean)
        .join("\n") || `Card ${idx + 1}`;

      const nativeFlow = (card.buttons?.length
        ? card.buttons
        : [{ type: "quick_reply" as const, text: "Ver detalhes", id: `card_${idx + 1}` }]
      ).slice(0, 3).map((btn, btnIdx) => {
        if (btn.type === "cta_url") return { text: btn.text || "Abrir", url: btn.url || "" };
        if (btn.type === "cta_copy") return { text: btn.text || "Copiar", copy: btn.copyCode || "" };
        if (btn.type === "cta_call") return { text: btn.text || "Ligar", call: btn.phoneNumber || "" };
        return { text: btn.text || `Opção ${btnIdx + 1}`, id: btn.id || `card_${idx + 1}_${btnIdx + 1}` };
      });

      return {
        ...(card.imageUrl ? { image: { url: card.imageUrl } } : {}),
        caption: cardText,
        footer: card.footerText || footerText || undefined,
        nativeFlow,
      };
    });

  if (!normalizedCards.length) {
    throw new Error("Carrossel sem cards válidos para envio");
  }

  try {
    const content: any = {
      text: bodyText || " ",
      cards: normalizedCards,
    };
    if (footerText) content.footer = footerText;

    const msg = (await (wbot as any).sendMessage(jid, content)) as WAMessage;

    logger.info(`[INTERACTIVE] Carousel enviado via @itsliaaa/baileys para ${jid} (${normalizedCards.length} cards)`);
    return msg;
  } catch (err: any) {
    logger.warn(`[INTERACTIVE] Falha ao enviar carousel nativo (${err?.message}). Enviando cards separados.`);

    let lastMsg: WAMessage | undefined;
    for (const card of normalizedCards) {
      if (card.image && card.nativeFlow?.length) {
        lastMsg = await sendInteractiveMixedButtons({
          wbot,
          jid,
          bodyText: card.caption || " ",
          footerText: card.footer,
          buttons: card.nativeFlow.map((btn: any) => ({
            type: (btn.url ? "cta_url" : btn.copy ? "cta_copy" : btn.call ? "cta_call" : "quick_reply") as any,
            text: btn.text,
            id: btn.id,
            url: btn.url,
            copyCode: btn.copy,
            phoneNumber: btn.call,
          })),
          headerImagePath: /^https?:\/\//i.test(card.image.url) ? undefined : card.image.url,
          headerImageUrl: /^https?:\/\//i.test(card.image.url) ? card.image.url : undefined,
        });
      } else if (card.image) {
        lastMsg = (await (wbot as any).sendMessage(jid, {
          image: card.image,
          caption: card.caption || " ",
        })) as WAMessage;
      } else if (card.nativeFlow?.length) {
        lastMsg = await sendInteractiveMixedButtons({
          wbot,
          jid,
          bodyText: card.caption || " ",
          footerText: card.footer,
          buttons: card.nativeFlow.map((btn: any) => ({
            type: (btn.url ? "cta_url" : btn.copy ? "cta_copy" : btn.call ? "cta_call" : "quick_reply") as any,
            text: btn.text,
            id: btn.id,
            url: btn.url,
            copyCode: btn.copy,
            phoneNumber: btn.call,
          })),
        });
      } else {
        lastMsg = (await (wbot as any).sendMessage(jid, { text: card.caption || " " })) as WAMessage;
      }
    }

    return lastMsg || ({ key: { id: `carousel_${Date.now()}` } } as WAMessage);
  }
};

// ==================== LOCALIZAÇÃO (estática) ====================

export const sendLocation = async (params: {
  wbot: Session;
  jid: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  bodyText?: string;
}): Promise<WAMessage> => {
  const { wbot, jid, latitude, longitude, name, address, bodyText } = params;

  try {
    const content: AnyMessageContent = {
      location: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        name: name || undefined,
        address: address || undefined,
      },
    };

    if (bodyText) {
      await (wbot as any).sendMessage(jid, { text: bodyText });
    }

    const msg = await (wbot as any).sendMessage(jid, content);

    logger.info(`[INTERACTIVE] Localização enviada para ${jid} (${latitude}, ${longitude})`);
    return msg as WAMessage;
  } catch (err: any) {
    logger.error(`[INTERACTIVE] Falha ao enviar localização para ${jid}: ${err?.message}`);
    throw new Error(`Não foi possível enviar localização para ${jid}`);
  }
};

// ==================== LOCALIZAÇÃO EM TEMPO REAL (live location) ====================

export const sendLiveLocation = async (params: {
  wbot: Session;
  jid: string;
  latitude: number;
  longitude: number;
  accuracyInMeters?: number;
  speed?: number;
  degreesClockwiseFromMagneticNorth?: number;
  sequenceNumber?: number;
  caption?: string;
  bodyText?: string;
}): Promise<WAMessage> => {
  const {
    wbot, jid, latitude, longitude,
    accuracyInMeters = 50,
    speed = 0,
    degreesClockwiseFromMagneticNorth = 0,
    sequenceNumber,
    caption,
    bodyText,
  } = params;

  try {
    if (bodyText) {
      await (wbot as any).sendMessage(jid, { text: bodyText });
    }

    const msg = await (wbot as any).sendMessage(jid, {
      liveLocationMessage: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        accuracyInMeters,
        speedInMps: speed,
        degreesClockwiseFromMagneticNorth,
        caption: caption || `📍 Localização em tempo real`,
        sequenceNumber: sequenceNumber || Date.now(),
        timeOffset: 0,
      },
    });

    logger.info(`[INTERACTIVE] Live Location enviada para ${jid} (${latitude}, ${longitude})`);
    return msg as WAMessage;
  } catch (err: any) {
    logger.error(`[INTERACTIVE] Falha ao enviar Live Location para ${jid}: ${err?.message}`);
    throw new Error(`Não foi possível enviar localização em tempo real para ${jid}`);
  }
};
