import { Request, Response } from "express";
import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";
import logger from "../utils/logger";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import CompaniesSettings from "../models/CompaniesSettings";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import axios from "axios";
import fs from "fs";
import path from "path";
import Message from "../models/Message";
import Queue from "../models/Queue";
import Ticket from "../models/Ticket";
import FindOrCreateATicketTrakingService from "../services/TicketServices/FindOrCreateATicketTrakingService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import CreateLogTicketService from "../services/TicketServices/CreateLogTicketService";
import formatBody from "../helpers/Mustache";
import ShowFileService from "../services/FileServices/ShowService";
import {
  sendConnectionGreeting,
  sendGreetingWithQueueMenu,
  sendQueueGreeting,
  sendTextByChannel,
  detectChannel
} from "../helpers/SendGreetingMessage";

const downloadMedia = async (url: string, companyId: number, filename: string): Promise<string> => {
  const publicFolder = path.join(__dirname, "..", "..", "public", `company${companyId}`);

  if (!fs.existsSync(publicFolder)) {
    fs.mkdirSync(publicFolder, { recursive: true });
  }

  const filePath = path.join(publicFolder, filename);
  const response = await axios.get(url, { responseType: "stream" });
  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(`company${companyId}/${filename}`));
    writer.on("error", reject);
  });
};

/**
 * Executa o fluxo completo ao associar uma fila (fileList, closeTicket, queuePosition).
 * Espelha o comportamento de verifyQueue do Baileys.
 */
const processQueueAssignment = async (
  ticket: Ticket,
  whatsapp: Whatsapp,
  queue: Queue,
  companyId: number,
  settings: any
): Promise<void> => {
  // 1. Saudação da fila (se tiver chatbots, envia com submenu)
  if (queue.greetingMessage && queue.greetingMessage.trim().length > 0) {
    const body = formatBody(`\u200e${queue.greetingMessage}`, ticket, { queue: queue.name });
    const channel = detectChannel(whatsapp);
    await sendTextByChannel(channel, body, ticket, whatsapp);
  }

  // 2. File list da fila
  if (queue.fileListId) {
    try {
      const files = await ShowFileService(queue.fileListId, companyId);
      const publicFolder = path.resolve(__dirname, "..", "..", "public");
      const folder = path.resolve(publicFolder, `company${companyId}`, "fileList", String(files.id));

      for (const file of files.options) {
        const filePath = path.resolve(folder, file.path);
        if (fs.existsSync(filePath)) {
          // Para Z-API enviamos como texto com nome do arquivo (sem mídia nativa por simplicidade)
          const channel = detectChannel(whatsapp);
          await sendTextByChannel(channel, `\u200e📎 ${file.name}`, ticket, whatsapp);
        }
      }
    } catch (error) {
      logger.info(`[Z-API] Erro ao enviar fileList da fila: ${error}`);
    }
  }

  // 3. Se fila está parametrizada para fechar ticket automaticamente
  if (queue.closeTicket) {
    await UpdateTicketService({
      ticketData: {
        status: "closed",
        queueId: queue.id,
        sendFarewellMessage: false
      },
      ticketId: ticket.id,
      companyId
    });
    return;
  }

  // 4. Posição na fila
  const enableQueuePosition = settings?.sendQueuePosition === "enabled";
  if (enableQueuePosition) {
    const count = await Ticket.findAndCountAll({
      where: {
        userId: null,
        status: "pending",
        companyId,
        queueId: queue.id,
        isGroup: false
      }
    });
    const qtd = count.count === 0 ? 1 : count.count;
    const msgFila = `${settings.sendQueuePositionMessage || "Sua posição na fila:"} *${qtd}*`;
    const bodyFila = formatBody(`${msgFila}`, ticket);
    const channel = detectChannel(whatsapp);
    await sendTextByChannel(channel, bodyFila, ticket, whatsapp);
  }
};

export const ZApiWebhookController = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { instanceId } = req.params;
  const payload = req.body;
  const traceId = `zapi_${instanceId}_${Date.now()}`;

  logger.info(`[Z-API Webhook][${traceId}] Evento recebido para instância ${instanceId}: ${JSON.stringify(payload).substring(0, 500)}`);

  try {
    const whatsapp = await Whatsapp.findOne({
      where: { zapiInstanceId: instanceId }
    });

    if (!whatsapp) {
      logger.warn(`[Z-API Webhook] Instância ${instanceId} não encontrada no banco`);
      return res.status(404).json({ error: "Instance not found" });
    }

    const fullWhatsapp = await ShowWhatsAppService(whatsapp.id, whatsapp.companyId);

    const companyId = fullWhatsapp.companyId;
    const io = getIO();

    // ✅ Detectar MENSAGENS primeiro, antes de status/ACK.
    const hasText = payload.text !== undefined && payload.text !== null;
    const hasImage = payload.image !== undefined && payload.image !== null;
    const hasVideo = payload.video !== undefined && payload.video !== null;
    const hasAudio = payload.audio !== undefined && payload.audio !== null;
    const hasDocument = payload.document !== undefined && payload.document !== null;
    const isMessagePayload = hasText || hasImage || hasVideo || hasAudio || hasDocument;

    // Se tem conteúdo de mensagem, processar como mensagem (não como status)
    if (!isMessagePayload) {
      // ACK / delivery events (sem conteúdo de mensagem)
      if (payload.ack !== undefined || payload.status === "DELIVERED" || payload.status === "READ") {
        const messageId = payload.id?.id || payload.messageId || payload.ids?.[0]?.id;
        if (messageId) {
          const ackValue = payload.ack ?? (payload.status === "READ" ? 4 : 3);
          const msg = await Message.findOne({ where: { wid: messageId } });
          if (msg) {
            await msg.update({ ack: ackValue });
            io.of(String(companyId)).emit(`company-${companyId}-appMessage`, {
              action: "update",
              message: msg
            });
          }
        }
        return res.status(200).json({ status: "ok" });
      }

      // Status/connection events
      if (payload.connected !== undefined || payload.type === "ConnectedCallback" || payload.type === "DisconnectedCallback") {
        const connected = payload.connected === true || payload.status === "connected";
        const newStatus = connected ? "CONNECTED" : "DISCONNECTED";

        await fullWhatsapp.update({ status: newStatus });

        io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
          action: "update",
          whatsapp: fullWhatsapp
        });

        logger.info(`[Z-API Webhook] Status atualizado: ${newStatus}`);
        return res.status(200).json({ status: "ok" });
      }
    }

    // Message events
    if (hasText || hasImage || hasVideo || hasAudio || hasDocument) {
      const isFromMe = payload.fromMe || false;

      if (isFromMe) {
        return res.status(200).json({ status: "ok" });
      }

      const remoteJid = payload.phone || payload.chatId || payload.from;
      if (!remoteJid) {
        return res.status(200).json({ status: "ok" });
      }

      const contactNumber = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      const contactName = payload.senderName || payload.chatName || contactNumber;

      const settings = await CompaniesSettings.findOne({ where: { companyId } });

      const contact = await CreateOrUpdateContactService({
        name: contactName,
        number: contactNumber,
        isGroup: false,
        companyId,
        channel: "whatsapp"
      });

      const queues = fullWhatsapp.queues || [];

      const ticket = await FindOrCreateTicketService(
        contact,
        fullWhatsapp,
        1,
        companyId,
        null,
        null,
        null,
        "whatsapp",
        null,
        false,
        settings
      );

      // ===== LÓGICA DE SAUDAÇÃO + SELEÇÃO DE FILA (alinhada com 1812) =====
      const ticketTraking = await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId,
        whatsappId: whatsapp.id,
        userId: null
      });

      if (!ticket.queueId) {
        // Ticket sem fila — verificar se está aguardando escolha ou é novo
        const sendGreetingMessageOneQueues =
          settings?.sendGreetingMessageOneQueues === "enabled" || false;

        if (queues.length === 0) {
          // Sem filas — envia apenas a saudação da conexão
          if (!ticketTraking.chatbotAt) {
            await sendConnectionGreeting(ticket, fullWhatsapp);
            await ticketTraking.update({ chatbotAt: new Date() });
          }
        } else if (queues.length === 1) {
          // 1 fila — envia saudação se habilitado e associa à fila
          if (!ticketTraking.chatbotAt) {
            if (sendGreetingMessageOneQueues) {
              await sendConnectionGreeting(ticket, fullWhatsapp);
            }

            // Associar fila
            await UpdateTicketService({
              ticketData: {
                queueId: queues[0].id,
                status: ticket.status === "lgpd" ? "pending" : ticket.status
              },
              ticketId: ticket.id,
              companyId
            });

            // Processar fluxo completo da fila (greeting, fileList, closeTicket, queuePosition)
            await processQueueAssignment(ticket, fullWhatsapp, queues[0], companyId, settings);

            await ticketTraking.update({ chatbotAt: new Date() });
          }
        } else {
          // 2+ filas — verificar se está aguardando resposta do menu
          if (ticketTraking.chatbotAt) {
            // Já enviou o menu, interpretar resposta do cliente
            let bodyText = payload.text?.message || payload.text || "";
            if (typeof bodyText === "object") bodyText = JSON.stringify(bodyText);
            const trimmed = bodyText.trim().toLowerCase();

            if (trimmed === "sair" || trimmed === "exit" || trimmed === "0") {
              // Encerrar atendimento
              await UpdateTicketService({
                ticketData: { status: "closed", amountUsedBotQueues: 0, sendFarewellMessage: false },
                ticketId: ticket.id,
                companyId
              });

              await ticketTraking.update({ chatbotAt: null });

              await CreateLogTicketService({
                ticketId: ticket.id,
                type: "closed"
              });

              logger.info(`[Z-API Webhook] Ticket ${ticket.id} encerrado pelo cliente (Sair)`);
            } else if (trimmed === "#") {
              // Voltar ao menu principal
              await sendGreetingWithQueueMenu(ticket, fullWhatsapp, queues);
              logger.info(`[Z-API Webhook] Ticket ${ticket.id} — reenviou menu (#)`);
            } else {
              const chosenIndex = parseInt(trimmed, 10) - 1;
              if (!isNaN(chosenIndex) && chosenIndex >= 0 && chosenIndex < queues.length) {
                const chosenQueue = queues[chosenIndex];

                // Buscar a fila completa com chatbots
                const fullQueue = await Queue.findByPk(chosenQueue.id);

                await UpdateTicketService({
                  ticketData: { queueId: chosenQueue.id, amountUsedBotQueues: 0 },
                  ticketId: ticket.id,
                  companyId
                });

                await ticketTraking.update({ chatbotAt: null });

                // Processar fluxo completo da fila escolhida
                if (fullQueue) {
                  await processQueueAssignment(ticket, fullWhatsapp, fullQueue, companyId, settings);
                }

                await CreateLogTicketService({
                  ticketId: ticket.id,
                  type: "queue"
                });

                logger.info(`[Z-API Webhook] Ticket ${ticket.id} atribuído à fila ${chosenQueue.name}`);
              } else {
                // Resposta inválida — reenviar menu
                await sendGreetingWithQueueMenu(ticket, fullWhatsapp, queues);
                logger.info(`[Z-API Webhook] Resposta inválida "${trimmed}" — reenviou menu`);
              }
            }
          } else {
            // Primeiro contato — enviar saudação + menu
            await sendGreetingWithQueueMenu(ticket, fullWhatsapp, queues);

            await ticketTraking.update({
              chatbotAt: new Date()
            });

            await CreateLogTicketService({
              ticketId: ticket.id,
              type: "chatBot"
            });
          }
        }
      }

      // ===== Salvar a mensagem recebida =====
      let body = payload.text?.message || payload.text || "";
      if (typeof body === "object") body = JSON.stringify(body);
      let mediaUrl = null;
      let mediaType = "extendedTextMessage";
      const messageId = payload.messageId || payload.id?.id || `zapi_in_${Date.now()}`;

      // Handle media messages
      if (payload.image) {
        mediaType = "imageMessage";
        body = payload.image.caption || body || "";
        const imageUrl = payload.image.imageUrl || payload.image.url;
        if (imageUrl) {
          const ext = "jpg";
          const filename = `${messageId}.${ext}`;
          mediaUrl = await downloadMedia(imageUrl, companyId, filename);
        }
      } else if (payload.video) {
        mediaType = "videoMessage";
        body = payload.video.caption || body || "";
        const videoUrl = payload.video.videoUrl || payload.video.url;
        if (videoUrl) {
          const ext = "mp4";
          const filename = `${messageId}.${ext}`;
          mediaUrl = await downloadMedia(videoUrl, companyId, filename);
        }
      } else if (payload.audio) {
        mediaType = "audioMessage";
        const audioUrl = payload.audio.audioUrl || payload.audio.url;
        if (audioUrl) {
          const ext = "ogg";
          const filename = `${messageId}.${ext}`;
          mediaUrl = await downloadMedia(audioUrl, companyId, filename);
        }
      } else if (payload.document) {
        mediaType = "documentMessage";
        body = payload.document.fileName || body || "";
        const docUrl = payload.document.documentUrl || payload.document.url;
        if (docUrl) {
          const ext = path.extname(payload.document.fileName || ".pdf").replace(".", "");
          const filename = `${messageId}.${ext}`;
          mediaUrl = await downloadMedia(docUrl, companyId, filename);
        }
      }

      const messageData = {
        wid: messageId,
        ticketId: ticket.id,
        contactId: contact.id,
        body,
        fromMe: false,
        mediaType,
        mediaUrl,
        read: false,
        ack: 0,
        isPrivate: false
      };

      await CreateMessageService({ messageData, companyId });
    }

    return res.status(200).json({ status: "ok" });
  } catch (error: any) {
    logger.error(`[Z-API Webhook][${traceId}] Erro: ${error.message}`);
    return res.status(500).json({ error: error.message, traceId });
  }
};
