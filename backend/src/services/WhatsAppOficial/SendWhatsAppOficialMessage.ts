import * as Sentry from "@sentry/node";
import fs from "fs";
import path from "path";
import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import { isNil } from "lodash";
import { sendMessageWhatsAppOficial } from "../../libs/whatsAppOficial/whatsAppOficial.service";
import { IMetaMessageTemplate, IMetaMessageinteractive, IReturnMessageMeta, ISendMessageOficial } from "../../libs/whatsAppOficial/IWhatsAppOficial.interfaces";
import CreateMessageService from "../MessageServices/CreateMessageService";
import formatBody from "../../helpers/Mustache";
import { convertToCloudApiOpus, convertToMp3Sibling } from "../../utils/AudioUtils";
import logger from "../../utils/logger";

const stripInvisibleText = (value?: string | null): string =>
  (value || "").replace(/[\u200B-\u200F\uFEFF]/g, "").trim();

interface Request {
  body: string;
  ticket: Ticket;
  type: 'text' | 'reaction' | 'audio' | 'document' | 'image' | 'sticker' | 'video' | 'location' | 'contacts' | 'interactive' | 'template',
  quotedMsg?: Message;
  msdelay?: number;
  media?: Express.Multer.File,
  vCard?: Contact;
  template?: IMetaMessageTemplate,
  interative?: IMetaMessageinteractive,
  bodyToSave?: string
}

const getTypeMessage = (type: string): 'text' | 'reaction' | 'audio' | 'document' | 'image' | 'sticker' | 'video' | 'location' | 'contacts' | 'interactive' | 'template' => {
  switch (type) {
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'image':
      return 'image'
    case 'application':
      return 'document'
    case 'document':
      return 'document'
    case 'text':
      return 'text'
    case 'interactive':
      return 'interactive'
    case 'contacts':
      return 'contacts'
    case 'location':
      return 'location'
    case 'template':
      return 'template'
    case 'reaction':
      return 'reaction'
    default:
      return null
  }
}

const SendWhatsAppOficialMessage = async ({
  body,
  ticket,
  media,
  type,
  vCard,
  template,
  interative,
  quotedMsg,
  bodyToSave
}: Request): Promise<IReturnMessageMeta> => {

  const pathMedia = !!media ? media.path : null;
  let options: ISendMessageOficial = {} as ISendMessageOficial;
  const typeMessage = !!media ? media.mimetype.split("/")[0] : null;
  let bodyTicket = "";
  let mediaType: string;

  const bodyMsg = body ? formatBody(body, ticket) : null;

  // Quando existe mídia, o body é legenda/descrição e não pode transformar
  // a mensagem em texto. Isso bloqueava áudio gravado na API Oficial.
  type = !type ? (!!media ? getTypeMessage(typeMessage) : (bodyMsg ? 'text' : getTypeMessage(typeMessage))) : type;

  if (type === 'text' && !stripInvisibleText(bodyMsg)) {
    throw new AppError(`Mensagem de texto vazia bloqueada para o ticket ${ticket.id}`);
  }

  switch (type) {
    case 'video':
      options.body_video = { caption: bodyMsg };
      options.type = 'video';
      options.fileName = media.originalname.replace('/', '-');
      bodyTicket = "🎥 Arquivo de vídeo";
      mediaType = 'video';
      break;
    case 'audio':
      options.type = 'audio';
      // ✅ WhatsApp Cloud API (WA Plus/Oficial) só aceita áudio como
      // audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg (codec Opus).
      // Áudios gravados no navegador vêm como audio/webm (ou audio/mp4 no
      // iOS), o que a Meta aceita no upload mas depois falha ao entregar
      // ("Este áudio não está mais disponível"). Convertemos para
      // OGG/Opus antes de enviar — mesmo tratamento do path Baileys.
      try {
        const convertedPath = await convertToCloudApiOpus(
          media.path,
          path.dirname(media.path)
        );
        // Publica a versão convertida sobre o mesmo diretório público e
        // atualiza o media/multer para que o filename salvo no banco e o
        // upload para a Meta usem o .ogg — assim o player web também
        // toca corretamente depois.
        try {
          if (fs.existsSync(media.path) && convertedPath !== media.path) {
            fs.unlinkSync(media.path);
          }
        } catch {}
        media.path = convertedPath;
        media.filename = path.basename(convertedPath);
        media.mimetype = "audio/ogg";
        media.originalname = media.originalname
          ? media.originalname.replace(/\.[^.]+$/, ".ogg")
          : "audio.ogg";
        // Gera um .mp3 irmão para reprodução no iPhone/Safari.
        try {
          await convertToMp3Sibling(convertedPath);
        } catch (mp3Err) {
          logger.warn(
            `[SendWhatsAppOficialMessage] Falha ao gerar mp3 sibling: ${(mp3Err as Error)?.message}`
          );
        }
      } catch (audioErr) {
        logger.error(
          `[SendWhatsAppOficialMessage] Falha ao converter áudio para OGG/Opus: ${(audioErr as Error)?.message}`
        );
        throw new AppError(
          "Não foi possível processar o áudio para envio pela API Oficial do WhatsApp. Verifique se o ffmpeg está instalado no servidor."
        );
      }
      options.fileName = media.originalname.replace('/', '-');
      bodyTicket = "🎵 Arquivo de áudio";
      mediaType = 'audio';
      break;
    case 'document':
      options.type = 'document';
      options.body_document = { caption: bodyMsg }; 
      options.fileName = media.originalname.replace('/', '-');
      bodyTicket = "📂 Arquivo de Documento";
      mediaType = 'document';
      break;
    case 'image':
      options.type = 'image';
      options.body_image = { caption: bodyMsg };
      options.fileName = media.originalname.replace('/', '-');
      bodyTicket = "📷 Arquivo de Imagem";
      mediaType = 'image';
      break;
    case 'text':
      options.type = 'text';
      options.body_text = { body: bodyMsg };
      mediaType = 'conversation';
      break;
    case 'interactive':
      options.type = 'interactive';
      mediaType = interative.type == 'button' ? 'interative' : 'listMessage';
      options.body_interactive = interative;
      break;
    case 'contacts':
      options.type = 'contacts';
      mediaType = 'contactMessage';
      const first_name = vCard?.name?.split(' ')[0];
      const last_name = String(vCard?.name).replace(vCard?.name?.split(' ')[0], '');
      options.body_contacts = {
        name: { first_name: first_name, last_name: last_name, formatted_name: `${first_name} ${last_name}`.trim() },
        phones: [{ phone: `+${vCard?.number}`, wa_id: +vCard?.number, type: 'CELL' }],
        emails: [{ email: vCard?.email }]
      }
      break;
    case 'location':
      throw new Error(`Tipo ${type} não configurado para enviar mensagem a Meta`);
    case 'template':
      options.body_template = template;
      mediaType = 'template';
      break;
    case 'reaction':
      throw new Error(`Tipo ${type} não configurado para enviar mensagem a Meta`)
    default:
      throw new Error(`Tipo ${type} não configurado para enviar mensagem a Meta`);
  }

  const contact = await Contact.findByPk(ticket.contactId)
  if (!contact) {
    // Sem isso, "contact.number" logo abaixo derrubava a função com
    // TypeError cru (fora do try/catch de envio) se o contato do ticket
    // tivesse sido apagado ou o contactId estivesse desatualizado.
    throw new AppError(
      `Contato não encontrado para o ticket ${ticket.id} (contactId=${ticket.contactId}).`
    );
  }

  let vcard;

  if (!isNil(vCard)) {
    const numberContact = vCard.number;
    const firstName = vCard.name.split(' ')[0];
    const lastName = String(vCard.name).replace(vCard.name.split(' ')[0], '')
    vcard = `BEGIN:VCARD\n`
      + `VERSION:3.0\n`
      + `N:${lastName};${firstName};;;\n`
      + `FN:${vCard.name}\n`
      + `TEL;type=CELL;waid=${numberContact}:+${numberContact}\n`
      + `END:VCARD`;
  }

  options.to = `+${contact.number}`;
  options.type = type;
  options.quotedId = quotedMsg?.wid;

  try {
    const whatsappToken = ticket.whatsapp?.token;
    if (!whatsappToken) {
      console.error(`[SendWhatsAppOficialMessage] ERRO: ticket.whatsapp.token ausente. ticket.whatsappId=${ticket.whatsappId}, whatsapp carregado=${!!ticket.whatsapp}`);
      throw new Error(`Token da conexão WhatsApp Oficial não encontrado para o ticket ${ticket.id}. Verifique se o whatsapp está carregado no ticket.`);
    }
    const sendMessage = await sendMessageWhatsAppOficial(
      media ? media.path : null,
      whatsappToken,
      options
    )

    // ── Vínculo do wa_id devolvido pela Meta ────────────────────────────────
    //
    // Ao aceitar o envio, a Meta responde com `contacts[0].wa_id`: o
    // identificador com que ELA vai apresentar esse contato nos webhooks
    // seguintes. Quando esse valor difere do número que enviamos (o caso do
    // LID), a resposta do cliente chegava com um identificador que o backend
    // nunca tinha visto — e um contato NOVO era criado, duplicando a pessoa e
    // abrindo um segundo atendimento.
    //
    // Gravando o vínculo agora, no momento do ENVIO, a resposta já encontra o
    // contato certo quando chegar. É a correção da causa raiz; as buscas
    // extras no recebimento são a rede de segurança para o que já está
    // duplicado no banco.
    //
    // Nunca derruba o envio: a mensagem já saiu, e falhar aqui só custaria o
    // mapeamento.
    try {
      const metaWaId = (sendMessage as any)?.wa_id;
      if (metaWaId && metaWaId !== contact.number) {
        if (contact.lid !== metaWaId) {
          await contact.update({ lid: metaWaId });
        }
        await WhatsappLidMap.findOrCreate({
          where: { companyId: ticket.companyId, lid: metaWaId, contactId: contact.id },
          defaults: { companyId: ticket.companyId, lid: metaWaId, contactId: contact.id } as any
        });
        logger.info(
          `[WHATSAPP OFICIAL][LID] wa_id ${metaWaId} vinculado ao contato ${contact.id} (${contact.number})`
        );
      }
    } catch (lidErr: any) {
      logger.error(
        `[WHATSAPP OFICIAL][LID] Falha ao mapear wa_id retornado pela Meta: ${lidErr?.message || lidErr}`
      );
    }

    // ✅ Descrição amigável para mídias enviadas
    const mediaDescriptions: Record<string, string> = {
      image: "📷 Imagem", video: "🎥 Vídeo", audio: "🎵 Áudio",
      document: "📄 Documento", sticker: "🏷️ Figurinha", location: "📍 Localização",
      contacts: "👤 Contato",
    };
    let lastMsg = !bodyMsg && !!media ? bodyTicket : bodyMsg;
    if (!lastMsg && mediaType in mediaDescriptions) {
      lastMsg = mediaDescriptions[mediaType];
    }
    await ticket.update({ lastMessage: lastMsg || bodyMsg, imported: null, unreadMessages: 0 });

    const wid: any = sendMessage;
    const sentMessageId =
      wid?.messages?.[0]?.id ||
      wid?.idMessageWhatsApp?.[0] ||
      wid?.id ||
      `oficial-${Date.now()}`;

    const bodyMessage = !isNil(vCard) ? vcard : !bodyMsg ? '' : bodyMsg;
    const messageData = {
      wid: sentMessageId,
      ticketId: ticket.id,
      contactId: contact.id,
      body: type === 'interactive' ? (bodyToSave || bodyMessage) : bodyMessage,
      fromMe: true,
      mediaType: mediaType,
      mediaUrl: !!media ? media.filename : null,
      read: true,
      quotedMsgId: quotedMsg?.id || null,
      ack: 2,
      channel: 'whatsapp_oficial',
      remoteJid: `${contact.number}@s.whatsapp.net`,
      participant: null,
      dataJson: JSON.stringify(body),
      ticketTrakingId: null,
      isPrivate: false,
      createdAt: new Date().toISOString(),
      ticketImported: ticket.imported,
      isForwarded: false,
      originalName: !!media ? media.filename : null
    };

    await CreateMessageService({ messageData, companyId: ticket.companyId });

    return sendMessage;
  } catch (err) {
    const errDetail = err?.response?.data
      ? JSON.stringify(err.response.data)
      : err?.message || String(err);
    // Loga o erro completo da Meta (ex: 131047 Re-engagement message - fora da janela de 24h)
    console.error(
      `[SendWhatsAppOficialMessage] Falha ao enviar (ticket ${ticket?.id}, type=${type}). Detalhe Meta: ${errDetail}`
    );
    Sentry.captureException(err);
    // Propaga o detalhe da Meta para facilitar diagnóstico nas camadas superiores
    throw new AppError(errDetail || err?.message || "ERR_SENDING_WAPP_MSG");
  }

}

export default SendWhatsAppOficialMessage;
