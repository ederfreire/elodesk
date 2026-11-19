import { WAMessage } from "@whiskeysockets/baileys";
import * as Sentry from "@sentry/node";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import CreateMessageService from "../MessageServices/CreateMessageService";
import formatBody from "../../helpers/Mustache";
import logger from "../../utils/logger";
import { normalizeJid } from "../../utils";
import {
  sendInteractiveButtons,
  sendInteractiveList,
  sendInteractiveCTAUrl,
  sendInteractiveCTACall,
  sendInteractiveCTACopy,
  sendInteractivePixCopyWithQrCode,
  sendInteractivePixWithDocument,
  sendInteractiveCobrancaWithDocument,
  sendInteractivePaymentInfo,
  sendInteractiveReviewAndPay,
  sendInteractiveCarousel,
} from "../../helpers/SendInteractiveMsg";
import SendWhatsAppOficialMessage from "../WhatsAppOficial/SendWhatsAppOficialMessage";
import { getCompanyCurrency, getCurrencyInfo } from "../../helpers/GetCompanyCurrency";
import { IMetaMessageinteractive } from "../../libs/whatsAppOficial/IWhatsAppOficial.interfaces";
import fs from "fs";
import path from "path";


interface InteractiveButton {
  displayText: string;
  id: string;
}

interface InteractiveListRow {
  header?: string;
  title: string;
  description?: string;
  id: string;
}

interface InteractiveSection {
  title: string;
  rows: InteractiveListRow[];
}

interface InteractiveRequest {
  ticket: Ticket;
  interactiveType: "button" | "list" | "poll" | "location" | "url" | "call" | "pix" | "offer" | "carousel" | "catalog" | "cobranca";
  bodyText: string;
  footerText?: string;
  headerText?: string;
  headerImage?: string;
  buttons?: InteractiveButton[];
  listButtonText?: string;
  sections?: InteractiveSection[];
  latitude?: number;
  longitude?: number;
  locationName?: string;
  locationAddress?: string;
  urlText?: string;
  url?: string;
  callText?: string;
  callNumber?: string;
  pixKey?: string;
  pixName?: string;
  pixCity?: string;
  pixAmount?: number;
  pixCopyPaste?: string;
  pixButtonText?: string;
  pixIncludeQrCode?: boolean;
  pixDocumentUrl?: string;
  pixDocumentPath?: string;
  pixDocumentName?: string;
  pixTotal?: string;
  pollQuestion?: string;
  pollOptions?: string[];
  offerTitle?: string;
  offerPrice?: string;
  offerDescription?: string;
  offerImageUrl?: string;
  carouselCards?: {
    title: string;
    body: string;
    imageUrl?: string;
    buttons?: InteractiveButton[];
  }[];
  // Cobrança
  cobrancaNumber?: string;
  cobrancaDescription?: string;
  cobrancaQuantity?: number;
  cobrancaAmount?: number;
  cobrancaMessage?: string;
  cobrancaPaymentUrl?: string;
  cobrancaButtonText?: string;
  cobrancaPdfPath?: string;
}

// Resolve uma fonte de mídia (imagem/documento) para o formato aceito pelo
// Baileys. Aceita URL http(s) ou caminho relativo à pasta public. Retorna
// undefined quando vazio ou inexistente.
const resolveMediaSource = (ref?: string): { url: string } | undefined => {
  const value = (ref || "").trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) {
    return { url: value };
  }
  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  const fullPath = path.resolve(publicFolder, value);
  if (fs.existsSync(fullPath)) {
    return { url: fullPath };
  }
  logger.warn(`[INTERACTIVE] Mídia não encontrada: ${fullPath}`);
  return undefined;
};

/**
 * Resolve o nome da fila para as variáveis {{queue}} / {{setor}}.
 *
 * POR QUE PRECISA DISTO
 *
 * O formatBody (helpers/Mustache.ts) é SÍNCRONO — ele não pode consultar o
 * banco. Para montar {{queue}} ele depende da associação `ticket.queue` já
 * estar carregada, ou de encontrar a fila na lista `ticket.whatsapp.queues`.
 *
 * A mensagem interativa costuma ser enviada a partir de um ticket que veio de
 * um listener, com só o essencial carregado: tem `queueId`, mas não tem a
 * associação `queue` nem a lista de filas da conexão. Nesse caso as duas
 * tentativas do formatBody falham e {{queue}} sai VAZIO — enquanto {{ms}} e
 * {{protocol}}, que não dependem de associação, funcionam normalmente. Era
 * exatamente esse o sintoma: "1. Bom dia / 2. 20260819001376 / 3." em branco.
 *
 * Aqui podemos consultar o banco (a função é async), então buscamos o nome uma
 * vez e passamos pronto para o formatBody como variável extra.
 *
 * IMPORTANTE: se o ticket ainda NÃO TEM fila, não há o que preencher. É o caso
 * da mensagem que pergunta o setor ("Vendas / Suporte / Financeiro") — nesse
 * momento o cliente ainda não escolheu, e {{queue}} vazio é o correto.
 */
const resolverVariaveisDeFila = async (ticket: Ticket): Promise<Record<string, string>> => {
  const t: any = ticket as any;

  let nomeDaFila: string =
    t?.queue?.name || t?.queue?.dataValues?.name || t?.dataValues?.queue?.name || "";

  if (!nomeDaFila && t?.queueId) {
    // Lista de filas da conexão, quando veio carregada.
    const filasDaConexao = t?.whatsapp?.queues || t?.whatsapp?.dataValues?.queues || [];
    const achada = Array.isArray(filasDaConexao)
      ? filasDaConexao.find((q: any) => Number(q?.id) === Number(t.queueId))
      : null;
    nomeDaFila = achada?.name || achada?.dataValues?.name || "";
  }

  let queueIdParaBuscar = t?.queueId || null;

  if (!nomeDaFila && !queueIdParaBuscar && t?.id) {
    // O ticket em memória pode estar defasado (ex.: a fila foi definida em
    // outro ponto do fluxo depois desta instância ser carregada). Relê o
    // queueId direto do banco antes de desistir.
    try {
      const atual = await Ticket.findByPk(t.id, { attributes: ["id", "queueId", "whatsappId"] });
      queueIdParaBuscar = (atual as any)?.queueId || null;
    } catch (err: any) {
      logger.warn(`[INTERACTIVE] Falha ao recarregar o ticket ${t?.id}: ${err?.message}`);
    }
  }

  if (!nomeDaFila && queueIdParaBuscar) {
    // Último recurso: busca no banco. Uma consulta por envio de interativa,
    // só quando o nome não veio de graça.
    try {
      const fila = await Queue.findByPk(queueIdParaBuscar, { attributes: ["id", "name"] });
      nomeDaFila = fila?.name || "";
      if (nomeDaFila) {
        logger.debug(
          `[INTERACTIVE] Nome da fila ${queueIdParaBuscar} carregado do banco para as variáveis: "${nomeDaFila}"`
        );
      }
    } catch (err: any) {
      logger.warn(`[INTERACTIVE] Falha ao carregar a fila ${queueIdParaBuscar}: ${err?.message}`);
    }
  }

  if (!nomeDaFila && (t?.whatsappId || t?.dataValues?.whatsappId)) {
    // Ticket ainda sem fila (ex.: a própria mensagem que pergunta o setor).
    // Se a conexão tem apenas uma fila, ela é a fila efetiva do atendimento,
    // então {{queue}} pode ser preenchido com ela.
    try {
      const conexao = await Whatsapp.findByPk(t?.whatsappId || t?.dataValues?.whatsappId, {
        include: [{ model: Queue, as: "queues", attributes: ["id", "name"] }]
      });
      const filas = (conexao as any)?.queues || [];
      if (Array.isArray(filas) && filas.length === 1) {
        nomeDaFila = filas[0]?.name || "";
      }
    } catch (err: any) {
      logger.warn(`[INTERACTIVE] Falha ao carregar filas da conexão: ${err?.message}`);
    }
  }

  if (!nomeDaFila) return {};


  // Mesmos apelidos que o formatBody já aceita, para {{queue}}, {{setor}},
  // {{sector}} e o {{queueu}} (erro de digitação histórico mantido por
  // compatibilidade) funcionarem igual.
  return {
    queue: nomeDaFila,
    queueu: nomeDaFila,
    setor: nomeDaFila,
    sector: nomeDaFila
  };
};

const SendWhatsAppInteractive = async (request: InteractiveRequest): Promise<any> => {
  const { ticket, interactiveType, bodyText, footerText } = request;

  const contact = await Contact.findByPk(ticket.contactId);
  if (!contact) {
    throw new AppError("Contato do ticket não encontrado");
  }

  const variaveisDeFila = await resolverVariaveisDeFila(ticket);

  // ========== BAILEYS ==========
  if (ticket.channel === "whatsapp") {
    const wbot = await GetTicketWbot(ticket);
    let jid = `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
    jid = normalizeJid(jid);

    const formattedBody = formatBody(bodyText, ticket, variaveisDeFila);
    const formattedFooter = footerText ? formatBody(footerText, ticket, variaveisDeFila) : undefined;
    let sentMsg: WAMessage;
    let mediaType = "interactive";
    let bodyToSave = formattedBody;

    try {
      switch (interactiveType) {
        case "button": {
          const btns = (request.buttons || []).slice(0, 3).map((b, i) => ({
            displayText: b.displayText,
            id: b.id || String(i + 1),
          }));
          sentMsg = await sendInteractiveButtons({
            wbot, jid, bodyText: formattedBody, footerText: formattedFooter, buttons: btns,
          });
          bodyToSave = `${formattedBody}\n\n${btns.map((b, i) => `*[ ${i + 1} ]* - ${b.displayText}`).join("\n")}`;
          break;
        }

        case "list": {
          const secs = (request.sections || []).map(sec => ({
            title: sec.title,
            rows: sec.rows.map(r => ({
              title: r.title,
              description: r.description || "",
              id: r.id,
            })),
          }));
          sentMsg = await sendInteractiveList({
            wbot, jid, bodyText: formattedBody, footerText: formattedFooter,
            buttonText: request.listButtonText || "Selecionar", sections: secs,
          });
          const allRows = secs.flatMap(s => s.rows);
          bodyToSave = `${formattedBody}\n\n${allRows.map((r, i) => `*[ ${i + 1} ]* - ${r.title}`).join("\n")}`;
          break;
        }

        case "url": {
          const urlDisplayText = request.urlText || "Acessar link";
          sentMsg = await sendInteractiveCTAUrl({
            wbot, jid, bodyText: formattedBody, footerText: formattedFooter,
            displayText: urlDisplayText, url: request.url || "",
          });
          bodyToSave = `${formattedBody}\n\n🔗 ${urlDisplayText}: ${request.url}`;
          break;
        }

        case "call": {
          const callDisplayText = request.callText || "Ligar";
          sentMsg = await sendInteractiveCTACall({
            wbot, jid, bodyText: formattedBody, footerText: formattedFooter,
            displayText: callDisplayText, phoneNumber: request.callNumber || "",
          });
          bodyToSave = `${formattedBody}\n\n📞 ${callDisplayText}: ${request.callNumber}`;
          break;
        }

        case "pix": {
          // PIX "copia e cola": botão nativo cta_copy (mais confiável no Baileys QR).
          if (request.pixCopyPaste && request.pixCopyPaste.trim()) {
            // Resolve placeholders Mustache ({{name}}, {{protocol}}...) nos campos do PIX
            const pixCode = formatBody(request.pixCopyPaste, ticket, variaveisDeFila).trim();
            const copyButtonText = request.pixButtonText
              ? formatBody(request.pixButtonText, ticket, variaveisDeFila)
              : "Copiar código PIX";
            const resolvedTotal = request.pixTotal ? formatBody(request.pixTotal, ticket, variaveisDeFila).trim() : "";
            const resolvedName = request.pixName ? formatBody(request.pixName, ticket, variaveisDeFila) : "";
            const resolvedDocUrl = request.pixDocumentUrl
              ? formatBody(request.pixDocumentUrl, ticket, variaveisDeFila).trim()
              : "";
            const resolvedDocPath = (request.pixDocumentPath || "").trim();
            const resolvedDocName = request.pixDocumentName
              ? formatBody(request.pixDocumentName, ticket, variaveisDeFila)
              : undefined;
            const pixBodyParts = [formattedBody].filter(Boolean);
            if (resolvedName) pixBodyParts.push(`👤 *Nome:* ${resolvedName}`);
            if (resolvedTotal) {
              pixBodyParts.push(`*Total:* ${resolvedTotal}`);
            } else if (request.pixAmount) {
              pixBodyParts.push(`💵 *Valor:* R$ ${request.pixAmount.toFixed(2)}`);
            }
            const pixCopyBody = pixBodyParts.join("\n\n") || "Clique no botão abaixo para copiar o código PIX:";

            if (resolvedDocUrl || resolvedDocPath) {
              // PDF (boleto/fatura) como cabeçalho + botão "Copiar chave Pix" no mesmo balão.
              // Aceita arquivo enviado por upload (caminho local) ou URL externa.
              sentMsg = await sendInteractivePixWithDocument({
                wbot, jid,
                bodyText: pixCopyBody,
                footerText: formattedFooter,
                displayText: copyButtonText,
                copyCode: pixCode,
                documentUrl: resolvedDocUrl,
                documentPath: resolvedDocPath
                  ? path.resolve(__dirname, "..", "..", "..", "public", resolvedDocPath)
                  : undefined,
                fileName: resolvedDocName,
              });
              bodyToSave = `📄 ${resolvedDocName || "Documento"}\n\n${pixCopyBody}\n\n📋 ${copyButtonText}:\n${pixCode}`;
            } else if (request.pixIncludeQrCode) {
              sentMsg = await sendInteractivePixCopyWithQrCode({
                wbot, jid,
                bodyText: pixCopyBody,
                footerText: formattedFooter,
                displayText: copyButtonText,
                copyCode: pixCode,
              });
              bodyToSave = `${pixCopyBody}\n\n🔳 QR Code PIX\n📋 ${copyButtonText}:\n${pixCode}`;
            } else {
              sentMsg = await sendInteractiveCTACopy({
                wbot, jid,
                bodyText: pixCopyBody,
                footerText: formattedFooter,
                displayText: copyButtonText,
                copyCode: pixCode,
              });
              bodyToSave = `${pixCopyBody}\n\n📋 ${copyButtonText}:\n${pixCode}`;
            }
            break;
          }

          const pixBodyText = `${formattedBody}\n\n💰 *Chave PIX:* ${request.pixKey}\n👤 *Nome:* ${request.pixName || ""}\n🏙️ *Cidade:* ${request.pixCity || ""}\n💵 *Valor:* R$ ${request.pixAmount ? request.pixAmount.toFixed(2) : "A definir"}`;

          sentMsg = await sendInteractivePaymentInfo({
            wbot, jid,
            bodyText: pixBodyText,
            footerText: formattedFooter,
            pixKey: request.pixKey || "",
            pixMerchantName: request.pixName || "Pagamento",
          });
          bodyToSave = pixBodyText;
          break;
        }

        case "location": {
          sentMsg = await (wbot as any).sendMessage(jid, {
            location: {
              degreesLatitude: request.latitude || 0,
              degreesLongitude: request.longitude || 0,
              name: request.locationName || "",
              address: request.locationAddress || "",
            },
          }) as WAMessage;
          mediaType = "location";
          bodyToSave = `📍 ${request.locationName || "Localização"}\n${request.locationAddress || ""}`;
          break;
        }

        case "poll": {
          const pollOpts = (request.pollOptions || []).filter(o => o.trim());
          const pollName = request.pollQuestion || formattedBody || "Enquete";

          if (pollOpts.length < 2) {
            throw new AppError("A enquete precisa de pelo menos 2 opções");
          }

          try {
            sentMsg = await (wbot as any).sendMessage(jid, {
              poll: {
                name: pollName,
                values: pollOpts,
                selectableCount: 1,
              },
            }) as WAMessage;
            mediaType = "pollCreationMessage";
          } catch (pollErr: any) {
            // Alguns forks do Baileys não suportam o envio de enquete nativa.
            // Garante a entrega caindo para uma mensagem de texto formatada.
            logger.warn(
              `[INTERACTIVE] Falha ao enviar enquete nativa (${pollErr?.message}). Caindo para texto.`
            );
            const pollText = `📊 *${pollName}*\n\n${pollOpts
              .map((o, i) => `${i + 1}. ${o}`)
              .join("\n")}`;
            sentMsg = await (wbot as any).sendMessage(jid, { text: pollText }) as WAMessage;
            mediaType = "extendedTextMessage";
          }
          bodyToSave = `📊 ${pollName}\n${pollOpts.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
          break;
        }


        case "offer": {
          const offerBody = `🛍️ *OFERTA*\n\n${request.offerTitle ? `*${request.offerTitle}*\n` : ""}${formattedBody}\n\n💰 *Preço:* ${request.offerPrice || "Consulte"}${request.offerDescription ? `\n📝 ${request.offerDescription}` : ""}`;

          // Envio CONFIÁVEL: o native_flow "review_and_pay" é descartado pelo
          // WhatsApp em conexões via QR. Enviamos a oferta como mensagem
          // (imagem + legenda, ou texto) garantindo a entrega no celular.
          const offerImg = resolveMediaSource(request.offerImageUrl);
          if (offerImg) {
            sentMsg = await (wbot as any).sendMessage(jid, {
              image: offerImg,
              caption: offerBody,
            }) as WAMessage;
          } else {
            sentMsg = await (wbot as any).sendMessage(jid, {
              text: formattedFooter ? `${offerBody}\n\n_${formattedFooter}_` : offerBody,
            }) as WAMessage;
          }
          bodyToSave = offerBody;
          break;
        }

        case "carousel":
        case "catalog": {
          const cards = request.carouselCards || [];
          if (!cards.length) {
            sentMsg = { key: { id: `carousel_${Date.now()}` } } as WAMessage;
            bodyToSave = formattedBody;
            break;
          }

          sentMsg = await sendInteractiveCarousel({
            wbot,
            jid,
            bodyText: formattedBody || (interactiveType === "catalog" ? "Confira nosso catálogo" : "Confira as opções"),
            footerText: formattedFooter,
            cards: cards.map((card, index) => {
              const cardImg = resolveMediaSource(card.imageUrl);
              return {
                title: card.title || "",
                bodyText: card.body || "",
                imageUrl: cardImg?.url,
                buttons: (card.buttons || [])
                  .filter(b => b?.displayText?.trim())
                  .slice(0, 3)
                  .map((b, btnIndex) => ({
                    type: "quick_reply" as const,
                    text: b.displayText,
                    id: b.id || `${interactiveType}_${index + 1}_${btnIndex + 1}`,
                  })),
              };
            }),
          });
          bodyToSave = cards.map(c => `*${c.title}*\n${c.body}`).join("\n---\n");
          break;
        }

        case "cobranca": {
          const cNum = request.cobrancaNumber || "";
          const cDesc = request.cobrancaDescription || "";
          const cQty = request.cobrancaQuantity || 1;
          const cAmount = request.cobrancaAmount || 0;
          const cMsg = request.cobrancaMessage || formattedBody;
          const cUrl = request.cobrancaPaymentUrl || "";
          const cBtnText = request.cobrancaButtonText || "Revisar e pagar";
          const cPdfPath = request.cobrancaPdfPath || "";
          const cCurrency = getCurrencyInfo(await getCompanyCurrency(ticket.companyId)).code;

          const cobrancaBody = `💳 *COBRANÇA*\n\n*Nº DA COBRANÇA:* ${cNum}\n\n${cDesc}\nQuantidade: ${cQty}\n\n*Total*          *${cCurrency} ${cAmount.toFixed(2).replace(".", ",")}*\n\n${cMsg}`;

          // Resolve o caminho absoluto do PDF (se houver) para enviar JUNTO com o botão.
          let pdfFullPath: string | undefined;
          if (cPdfPath) {
            const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
            const candidate = path.resolve(publicFolder, cPdfPath);
            if (fs.existsSync(candidate)) {
              pdfFullPath = candidate;
            } else {
              logger.warn(`[INTERACTIVE-TICKET] PDF de cobrança não encontrado: ${candidate}`);
            }
          }

          // Envia TUDO JUNTO (igual ao PIX + QR Code): PDF como header + botão de
          // pagamento + corpo da cobrança no MESMO balão. Sempre vai com botão
          // quando há URL; sem URL e sem PDF, vira texto.
          if (pdfFullPath || cUrl) {
            sentMsg = await sendInteractiveCobrancaWithDocument({
              wbot,
              jid,
              bodyText: cobrancaBody,
              footerText: formattedFooter,
              displayText: cBtnText,
              url: cUrl || undefined,
              documentPath: pdfFullPath,
              fileName: cNum ? `cobranca_${cNum}` : "cobranca",
            });
            bodyToSave = cUrl ? `${cobrancaBody}\n\n🔗 ${cBtnText}: ${cUrl}` : cobrancaBody;
          } else {
            sentMsg = await (wbot as any).sendMessage(jid, {
              text: formattedFooter ? `${cobrancaBody}\n\n_${formattedFooter}_` : cobrancaBody,
            }) as WAMessage;
            bodyToSave = cobrancaBody;
          }
          break;
        }

        default:
          throw new AppError(`Tipo interativo '${interactiveType}' não suportado`);
      }

      // Save message
      const messageData = {
        wid: sentMsg?.key?.id || `interactive_${Date.now()}`,
        ticketId: ticket.id,
        contactId: contact.id,
        body: bodyToSave,
        fromMe: true,
        mediaType,
        read: true,
        quotedMsgId: null,
        ack: 2,
        remoteJid: jid,
        participant: null,
        dataJson: null,
        ticketTrakingId: null,
        isPrivate: false,
      };

      await CreateMessageService({ messageData, companyId: ticket.companyId });
      await ticket.update({ lastMessage: bodyToSave, unreadMessages: 0 });

      logger.info(`[INTERACTIVE-TICKET] ${interactiveType} enviado para ${jid} no ticket ${ticket.id}`);
      return sentMsg;

    } catch (err) {
      logger.error(`[INTERACTIVE-TICKET] Erro ao enviar ${interactiveType}: ${err?.message}`);
      Sentry.captureException(err);
      throw new AppError(err?.message || "ERR_SENDING_INTERACTIVE_MSG");
    }
  }

  // ========== API OFICIAL ==========
  if (ticket.channel === "whatsapp_oficial") {
    try {
      switch (interactiveType) {
        case "button": {
          const btns = (request.buttons || []).slice(0, 3);
          const interative: IMetaMessageinteractive = {
            type: "button",
            body: { text: bodyText },
            footer: footerText ? { text: footerText } : undefined,
            action: {
              buttons: btns.map((b, i) => ({
                type: "reply",
                reply: { id: b.id || String(i + 1), title: b.displayText.substring(0, 20) },
              })),
            },
          } as any;
          const bodyToSave = `${bodyText}\n\n${btns.map((b, i) => `*[ ${i + 1} ]* - ${b.displayText}`).join("\n")}`;
          return await SendWhatsAppOficialMessage({
            body: bodyText, ticket, type: "interactive", media: null, interative, bodyToSave,
          });
        }

        case "list": {
          const secs = (request.sections || []).map(sec => ({
            title: sec.title,
            rows: sec.rows.map(r => ({
              id: r.id,
              title: r.title.substring(0, 24),
              description: (r.description || "").substring(0, 72),
            })),
          }));
          const interative: IMetaMessageinteractive = {
            type: "list",
            body: { text: bodyText },
            footer: footerText ? { text: footerText } : undefined,
            action: {
              button: request.listButtonText || "Selecionar",
              sections: secs,
            },
          } as any;
          const allRows = secs.flatMap(s => s.rows);
          const bodyToSave = `${bodyText}\n\n${allRows.map((r, i) => `*[ ${i + 1} ]* - ${r.title}`).join("\n")}`;
          return await SendWhatsAppOficialMessage({
            body: bodyText, ticket, type: "interactive", media: null, interative, bodyToSave,
          });
        }

        case "url": {
          const interative: IMetaMessageinteractive = {
            type: "cta_url",
            body: { text: bodyText },
            footer: footerText ? { text: footerText } : undefined,
            action: {
              name: "cta_url",
              parameters: {
                display_text: request.urlText || "Acessar link",
                url: request.url || "",
              },
            },
          } as any;
          return await SendWhatsAppOficialMessage({
            body: bodyText, ticket, type: "interactive", media: null, interative,
            bodyToSave: `${bodyText}\n\n🔗 ${request.urlText || request.url}\n${request.url}`,
          });
        }

        case "location": {
          const locBody = `📍 *${request.locationName || "Localização"}*\n${request.locationAddress || ""}\nhttps://maps.google.com/?q=${request.latitude},${request.longitude}`;
          return await SendWhatsAppOficialMessage({
            body: locBody, ticket, type: "text", media: null,
          });
        }

        case "cobranca": {
          const cNum = request.cobrancaNumber || "";
          const cDesc = request.cobrancaDescription || "";
          const cQty = request.cobrancaQuantity || 1;
          const cAmount = request.cobrancaAmount || 0;
          const cMsg = request.cobrancaMessage || bodyText;
          const cUrl = request.cobrancaPaymentUrl || "";
          const cBtnText = request.cobrancaButtonText || "Revisar e pagar";
          const cCurrencyOf = getCurrencyInfo(await getCompanyCurrency(ticket.companyId)).code;

          const cobrancaBody = `*Nº DA COBRANÇA:* ${cNum}\n\n${cDesc}\nQuantidade: ${cQty}\n\n*Total*          *${cCurrencyOf} ${cAmount.toFixed(2).replace(".", ",")}*\n\n${cMsg}`;

          if (cUrl) {
            const interative: IMetaMessageinteractive = {
              type: "cta_url",
              body: { text: cobrancaBody },
              footer: footerText ? { text: footerText } : undefined,
              action: {
                name: "cta_url",
                parameters: { display_text: cBtnText, url: cUrl },
              },
            } as any;
            return await SendWhatsAppOficialMessage({
              body: bodyText, ticket, type: "interactive", media: null, interative,
              bodyToSave: `${cobrancaBody}\n\n🔗 ${cBtnText}: ${cUrl}`,
            });
          }
          return await SendWhatsAppOficialMessage({
            body: cobrancaBody, ticket, type: "text", media: null,
          });
        }

        default: {
          let fallbackBody = bodyText;
          if (interactiveType === "call") {
            fallbackBody = `${bodyText}\n\n📞 ${request.callText || "Ligar"}: ${request.callNumber}`;
          } else if (interactiveType === "pix") {
            fallbackBody = `${bodyText}\n\n💰 *Chave PIX:* ${request.pixKey}\n👤 *Nome:* ${request.pixName || ""}\n🏙️ *Cidade:* ${request.pixCity || ""}\n💵 *Valor:* R$ ${request.pixAmount ? request.pixAmount.toFixed(2) : "A definir"}`;
          } else if (interactiveType === "poll") {
            const opts = (request.pollOptions || []).filter(o => o.trim());
            fallbackBody = `📊 *${request.pollQuestion || bodyText}*\n\n${opts.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
          } else if (interactiveType === "offer") {
            fallbackBody = `${request.offerTitle ? `*${request.offerTitle}*\n` : ""}${bodyText}\n\n💰 *Preço:* ${request.offerPrice || "Consulte"}`;
          }
          return await SendWhatsAppOficialMessage({
            body: fallbackBody, ticket, type: "text", media: null,
          });
        }
      }
    } catch (err) {
      logger.error(`[INTERACTIVE-OFICIAL] Erro: ${err?.message}`);
      Sentry.captureException(err);
      throw new AppError(err?.message || "ERR_SENDING_INTERACTIVE_OFICIAL");
    }
  }

  // ========== WACALLS (WhatsApp Plus - Voz + Msg) ==========
  // O bridge Go/whatsmeow não expõe native_flow/list/buttons hoje. Para não
  // quebrar o atendimento, convertemos a mensagem interativa em texto
  // formatado (mesmo padrão do fallback default da API Oficial).
  if (ticket.channel === "wacalls") {
    try {
      const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
      const formattedBody = formatBody(bodyText, ticket, variaveisDeFila);
      const formattedFooter = footerText ? formatBody(footerText, ticket, variaveisDeFila) : "";
      let text = formattedBody;

      // ── BOTÕES E LISTAS DE VERDADE ──────────────────────────────────────
      //
      // Até aqui TODO tipo interativo virava texto numerado neste canal, com
      // a justificativa de que o bridge Go não expunha botões. A capacidade
      // existia (SendWhatsAppButtons/SendWhatsAppList em flowbridge.go), mas
      // só era usada pelo executor de fluxo interno do Go — o endpoint que
      // este backend chama aceitava apenas "text". Agora aceita.
      //
      // Só botão e lista passam por aqui: os outros tipos (PIX, carrossel,
      // catálogo, CTA) continuam no fallback de texto logo abaixo, porque o
      // bridge não tem equivalente para eles.
      //
      // Se qualquer coisa falhar, cai no fallback de texto — o cliente
      // recebe a mensagem de um jeito ou de outro.
      const conexao = await Whatsapp.findByPk(ticket.whatsappId);
      const sessaoWacalls = (conexao as any)?.wacallsChatSessionId;

      if (sessaoWacalls && (interactiveType === "button" || interactiveType === "list")) {
        try {
          const { sendChatButtons, sendChatList, buildJid } =
            await import("../WacallsServices/WacallsChatMessageService");
          const jidDestino =
            (contact as any).remoteJid || buildJid(contact.number, !!ticket.isGroup);

          if (interactiveType === "button") {
            const btns = (request.buttons || []).slice(0, 3).map((b, i) => ({
              id: b.id || String(i + 1),
              title: b.displayText
            }));
            if (btns.length > 0) {
              await sendChatButtons(sessaoWacalls, jidDestino, formattedBody, btns, formattedFooter);
              logger.info(`[INTERACTIVE][wacalls] ${btns.length} botão(ões) nativo(s) enviado(s) no ticket ${ticket.id}`);
              await ticket.update({ lastMessage: formattedBody });
              return { key: { id: `wacalls-${Date.now()}`, remoteJid: jidDestino, fromMe: true } } as any;
            }
          } else {
            const secoes = (request.sections || []).map(sec => ({
              title: sec.title,
              rows: (sec.rows || []).map((rw, i) => ({
                id: rw.id || String(i + 1),
                title: rw.title,
                description: rw.description
              }))
            }));
            if (secoes.length > 0) {
              await sendChatList(
                sessaoWacalls,
                jidDestino,
                formattedBody,
                secoes,
                request.listButtonText,
                formattedFooter
              );
              logger.info(`[INTERACTIVE][wacalls] lista nativa enviada no ticket ${ticket.id}`);
              await ticket.update({ lastMessage: formattedBody });
              return { key: { id: `wacalls-${Date.now()}`, remoteJid: jidDestino, fromMe: true } } as any;
            }
          }
        } catch (errInterativo: any) {
          logger.warn(
            `[INTERACTIVE][wacalls] Envio nativo falhou (${errInterativo?.message}). ` +
              `Caindo para o texto numerado.`
          );
        }
      }

      switch (interactiveType) {
        case "button": {
          const btns = (request.buttons || []).slice(0, 3);
          text = `${formattedBody}\n\n${btns.map((b, i) => `*[ ${i + 1} ]* - ${b.displayText}`).join("\n")}`;
          break;
        }
        case "list": {
          const allRows = (request.sections || []).flatMap(s => s.rows);
          text = `${formattedBody}\n\n${allRows.map((r, i) => `*[ ${i + 1} ]* - ${r.title}`).join("\n")}`;
          break;
        }
        case "url":
          text = `${formattedBody}\n\n🔗 ${request.urlText || "Acessar link"}: ${request.url || ""}`;
          break;
        case "call":
          text = `${formattedBody}\n\n📞 ${request.callText || "Ligar"}: ${request.callNumber || ""}`;
          break;
        case "pix": {
          if (request.pixCopyPaste && request.pixCopyPaste.trim()) {
            const pixCode = formatBody(request.pixCopyPaste, ticket, variaveisDeFila).trim();
            text = `${formattedBody}\n\n📋 *Chave PIX (copia e cola):*\n${pixCode}`;
          } else {
            text = `${formattedBody}\n\n💰 *Chave PIX:* ${request.pixKey || ""}\n👤 *Nome:* ${request.pixName || ""}\n🏙️ *Cidade:* ${request.pixCity || ""}\n💵 *Valor:* R$ ${request.pixAmount ? request.pixAmount.toFixed(2) : "A definir"}`;
          }
          break;
        }
        case "location":
          text = `📍 *${request.locationName || "Localização"}*\n${request.locationAddress || ""}\nhttps://maps.google.com/?q=${request.latitude},${request.longitude}`;
          break;
        case "poll": {
          const opts = (request.pollOptions || []).filter(o => o.trim());
          text = `📊 *${request.pollQuestion || formattedBody}*\n\n${opts.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;
          break;
        }
        case "offer":
          text = `🛍️ *OFERTA*\n\n${request.offerTitle ? `*${request.offerTitle}*\n` : ""}${formattedBody}\n\n💰 *Preço:* ${request.offerPrice || "Consulte"}${request.offerDescription ? `\n📝 ${request.offerDescription}` : ""}`;
          break;
        case "carousel":
        case "catalog": {
          const cards = request.carouselCards || [];
          text = cards.length
            ? cards.map(c => `*${c.title}*\n${c.body}`).join("\n---\n")
            : formattedBody;
          break;
        }
        case "cobranca": {
          const cAmount = request.cobrancaAmount || 0;
          const cCurrency = getCurrencyInfo(await getCompanyCurrency(ticket.companyId)).code;
          text = `💳 *COBRANÇA*\n\n*Nº:* ${request.cobrancaNumber || ""}\n\n${request.cobrancaDescription || ""}\nQuantidade: ${request.cobrancaQuantity || 1}\n\n*Total*  *${cCurrency} ${cAmount.toFixed(2).replace(".", ",")}*\n\n${request.cobrancaMessage || formattedBody}${request.cobrancaPaymentUrl ? `\n\n🔗 ${request.cobrancaButtonText || "Pagar"}: ${request.cobrancaPaymentUrl}` : ""}`;
          break;
        }
        default:
          text = formattedBody;
      }

      if (formattedFooter) text = `${text}\n\n_${formattedFooter}_`;

      return await SendWacallsText({ ticket, body: text });
    } catch (err: any) {
      logger.error(`[INTERACTIVE-WACALLS] Erro: ${err?.message}`);
      Sentry.captureException(err);
      throw new AppError(err?.message || "ERR_SENDING_INTERACTIVE_WACALLS");
    }
  }

  throw new AppError("Canal não suportado para mensagens interativas");
};

export default SendWhatsAppInteractive;
