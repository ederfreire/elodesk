import moment from "moment";
import * as Sentry from "@sentry/node";
import { Op } from "sequelize";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import { getIO } from "../../libs/socket";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import ShowTicketService from "./ShowTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import FindOrCreateATicketTrakingService from "./FindOrCreateATicketTrakingService";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import { verifyMessage } from "../WbotServices/wbotMessageListener";
import { isNil } from "lodash";
import { sendFacebookMessage } from "../FacebookServices/sendFacebookMessage";
import { verifyMessageFace } from "../FacebookServices/facebookMessageListener";
import { sendTelegramMessage } from "../TelegramServices/sendTelegramMessage";
import ShowUserService from "../UserServices/ShowUserService";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import CompaniesSettings from "../../models/CompaniesSettings";
import CreateLogTicketService from "./CreateLogTicketService";
import TicketTag from "../../models/TicketTag";
import Tag from "../../models/Tag";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "./FindOrCreateTicketService";
import formatBody from "../../helpers/Mustache";
import { Mutex } from "async-mutex";
import { getJidOf } from "../WbotServices/getJidOf";
import logger from "../../utils/logger";
import ListUserQueueImmediateService from "../UserQueueServices/ListUserQueueImmediateService";
import SendWhatsAppOficialMessage from "../WhatsAppOficial/SendWhatsAppOficialMessage";
import { sendTextByChannel, detectChannel } from "../../helpers/SendGreetingMessage";
import { findLeadByPhone } from "../LeadServices/UpsertLeadService";
import { sendCapiEvent } from "../LeadServices/MetaCapiService";
import NotifyPendingTicketToUsers from "../UserServices/NotifyPendingTicketToUsers";

interface TicketData {
  status?: string;
  userId?: number | null;
  queueId?: number | null;
  whatsappId?: number | null;
  isBot?: boolean;
  queueOptionId?: number;
  sendFarewellMessage?: boolean;
  sendRatingMessage?: boolean;
  amountUsedBotQueues?: number;
  lastMessage?: string;
  integrationId?: number;
  useIntegration?: boolean;
  unreadMessages?: number;
  msgTransfer?: string;
  isTransfered?: boolean;
  valorVenda?: number;
  motivoNaoVenda?: string;
  motivoFinalizacao?: string;
  finalizadoComVenda?: boolean;
  closingSubject?: string;
  closingSummary?: string;
  flowWebhook?: boolean;
  flowStopped?: boolean;
  dataWebhook?: any;
  lastFlowId?: string;
  hashFlowId?: string;
}

interface Request {
  ticketData: TicketData;
  ticketId: string | number;
  companyId: number;
}

interface Response {
  ticket: Ticket;
  oldStatus: string;
  oldUserId: number | undefined;
}

const stripInvisibleText = (value?: string | null): string =>
  (value || "").replace(/[\u200B-\u200F\uFEFF]/g, "").trim();

const hasVisibleText = (value?: string | null): boolean =>
  stripInvisibleText(value).length > 0;

const sendUserAcceptanceGreeting = async (ticket: Ticket): Promise<void> => {
  try {
    if (!ticket?.userId) {
      logger.info(`[TICKET ACCEPTED] Skip: ticket sem userId (${ticket?.id})`);
      return;
    }
    if (ticket.isGroup) {
      logger.info(`[TICKET ACCEPTED] Skip: ticket ${ticket.id} é grupo`);
      return;
    }

    const user = await User.findByPk(ticket.userId);
    if (!user) {
      logger.warn(`[TICKET ACCEPTED] Skip: user ${ticket.userId} não encontrado`);
      return;
    }
    if (!hasVisibleText(user.acceptanceMessage)) {
      logger.info(`[TICKET ACCEPTED] Skip: user ${ticket.userId} sem acceptanceMessage cadastrada`);
      return;
    }

    const whatsapp = ticket.whatsappId
      ? await ShowWhatsAppService(ticket.whatsappId, ticket.companyId)
      : null;
    if (!whatsapp) {
      logger.warn(`[TICKET ACCEPTED] Skip: ticket ${ticket.id} sem whatsapp associado`);
      return;
    }

    const body = formatBody(`\u200e${user.acceptanceMessage}`, ticket);
    const channel = detectChannel(whatsapp);
    await sendTextByChannel(channel, body, ticket, whatsapp);
    logger.info(`[TICKET ACCEPTED] ✅ Saudação personalizada do usuário ${ticket.userId} enviada no ticket ${ticket.id}`);
  } catch (err: any) {
    logger.error(`[TICKET ACCEPTED] Erro ao enviar saudação personalizada: ${err?.message}`);
  }
};

const UpdateTicketService = async ({
  ticketData,
  ticketId,
  companyId
}: Request): Promise<Response> => {
  try {

    let {
      queueId,
      userId,
      whatsappId: newWhatsappId,
      sendFarewellMessage = true,
      sendRatingMessage,
      amountUsedBotQueues,
      lastMessage,
      integrationId,
      useIntegration,
      unreadMessages,
      msgTransfer,
      isTransfered = false,
      status,
      valorVenda,
      motivoNaoVenda,
      motivoFinalizacao,
      finalizadoComVenda,
      closingSubject,
      closingSummary
    } = ticketData;

    // ASSUNTO DO ENCERRAMENTO
    //
    // A operação encerra pela tela de venda (valor/motivo) e muitas vezes não
    // preenche o campo "assunto" — por isso o relatório vinha quase todo com
    // "-". O motivo é a informação que de fato existe, então ele é gravado
    // como assunto quando o campo próprio vem vazio. Assunto preenchido
    // continua tendo prioridade.
    const assuntoParaGravar =
      closingSubject !== undefined && String(closingSubject || "").trim() !== ""
        ? closingSubject
        : motivoFinalizacao !== undefined && String(motivoFinalizacao || "").trim() !== ""
          ? motivoFinalizacao
          : closingSubject;

    let isBot: boolean | null = ticketData.isBot || false;
    let queueOptionId: number | null = ticketData.queueOptionId || null;

    const io = getIO();

    const settings = await CompaniesSettings.findOne({
      where: {
        companyId: companyId
      }
    });

    let ticket = await ShowTicketService(ticketId, companyId);

    if (ticket.channel === "whatsapp" && ticket.whatsappId) {
      SetTicketMessagesAsRead(ticket);
    }

    const oldStatus = ticket?.status;
    const oldUserId = ticket.user?.id;
    const oldQueueId = ticket?.queueId;

    if (isNil(ticket.whatsappId) && status === "closed") {
      await CreateLogTicketService({
        userId,
        queueId: ticket.queueId,
        ticketId,
        type: "closed"
      });

      await ticket.update({
        status: "closed"
      });

      io.of(String(companyId))
        // .to(oldStatus)
        // .to(ticketId.toString())
        .emit(`company-${ticket.companyId}-ticket`, {
          action: "delete",
          ticketId: ticket.id
        });
      return { ticket, oldStatus, oldUserId };
    }

    if (oldStatus === "closed") {
      let otherTicket = await Ticket.findOne({
        where: {
          contactId: ticket.contactId,
          status: { [Op.or]: ["open", "pending", "group"] },
          whatsappId: ticket.whatsappId
        }
      });
      if (otherTicket) {
        if (otherTicket.id !== ticket.id) {
          otherTicket = await ShowTicketService(otherTicket.id, companyId);
          return { ticket: otherTicket, oldStatus, oldUserId };
        }
      }

      // await CheckContactOpenTickets(ticket.contactId, ticket.whatsappId );
      isBot = false;
    }

    // ✅ CORRIGIDO: Desabilitar integração quando ticket é aceito por um usuário
    if (userId && userId !== oldUserId && status === "open") {
      // TRAVA DE PERMISSÃO NO BACKEND
      //
      // A permissão allowSeeMessagesInPendingTickets só ofuscava as mensagens no
      // frontend (blur), mas NÃO impedia aceitar: pela notificação, um usuário
      // sem permissão conseguia aceitar o ticket em aguardando mesmo assim,
      // porque a checagem era só visual. Agora o backend recusa.
      //
      // Só bloqueia quando o ticket está saindo de "pending" (aguardando) para
      // "open" — que é o ato de aceitar. Não afeta transferências entre
      // atendentes já em atendimento, nem admins.
      if (oldStatus === "pending") {
        const aceitante = await User.findByPk(userId);
        const ehAdmin =
          aceitante &&
          (aceitante.profile === "admin" || (aceitante as any).super === true);
        const semPermissao =
          aceitante &&
          (aceitante as any).allowSeeMessagesInPendingTickets === "disabled";

        if (aceitante && !ehAdmin && semPermissao) {
          logger.warn(
            `[TICKET ACCEPT BLOCKED] Usuário ${userId} sem permissão ` +
            `(allowSeeMessagesInPendingTickets) tentou aceitar o ticket ${ticketId} em aguardando.`
          );
          throw new AppError("ERR_NO_PERMISSION_ACCEPT_PENDING", 403);
        }
      }

      logger.info(`[TICKET ACCEPTED] Ticket ${ticketId} aceito por usuário ${userId} - desabilitando integração`);
      isBot = false;
      useIntegration = false;
    }

    const ticketTraking = await FindOrCreateATicketTrakingService({
      ticketId,
      companyId,
      whatsappId: ticket?.whatsappId,
      userId: ticket.userId
    });
    const hasQueueIdField = Object.prototype.hasOwnProperty.call(ticketData, "queueId");
    const whatsapp = await ShowWhatsAppService(ticket?.whatsappId, companyId);
    const { complationMessage, ratingMessage, groupAsTicket } = whatsapp;

    if (!hasQueueIdField && status === "open" && !isNil(userId)) {
      const fallbackQueueId = ticket.queueId ?? whatsapp.sendIdQueue ?? null;

      if (!isNil(fallbackQueueId)) {
        queueId = fallbackQueueId;
        logger.info(`[TICKET ACCEPTED] Preservando fila ${queueId} ao aceitar ticket ${ticketId}`);
      }
    }

    if (status !== undefined && ["closed"].indexOf(status) > -1) {
      const _userId = ticket.userId || userId;
      let user;
      if (_userId) {
        user = await User.findByPk(_userId);
      }

      // Permite escolher fechar com ou sem avaliação:
      // - sendRatingMessage indefinido => mantém comportamento antigo (segue sendFarewellMessage)
      // - sendRatingMessage true/false => controla o envio da avaliação de forma independente
      const shouldSendRating =
        sendRatingMessage === undefined
          ? sendFarewellMessage || sendFarewellMessage === undefined
          : sendRatingMessage === true;

      if (
        settings.userRating === "enabled" &&
        shouldSendRating &&
        !isNil(ratingMessage) &&
        ratingMessage !== "" &&
        !ticket.isGroup
      ) {
        if (ticketTraking.ratingAt == null) {
          const ratingTxt = ratingMessage || "";
          let bodyRatingMessage = `\u200e${ratingTxt}\n`;

          if (
            ticket.channel === "whatsapp" &&
            ticket.whatsapp.status === "CONNECTED"
          ) {
            const msg = await SendWhatsAppMessage({
              body: bodyRatingMessage,
              ticket,
              isForwarded: false
            });
            await verifyMessage(msg, ticket, ticket.contact);
          } else if (["facebook", "instagram"].includes(ticket.channel)) {
            const msg = await sendFacebookMessage({
              body: bodyRatingMessage,
              ticket
            });
            await verifyMessageFace(
              msg,
              bodyRatingMessage,
              ticket,
              ticket.contact
            );
          } else if (ticket.channel === "whatsapp_oficial") {
            await SendWhatsAppOficialMessage({
              body: bodyRatingMessage,
              ticket: ticket,
              quotedMsg: null,
              type: 'text',
              media: null,
              vCard: null
            });
          } else if (ticket.channel === "telegram") {
            await sendTelegramMessage({ body: bodyRatingMessage, ticket });
          } else if (ticket.channel === "wacalls") {
            try {
              if (!ticket.contact) {
                await ticket.reload({ include: [{ association: "contact" }, { association: "whatsapp" }] });
              }
              const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
              await SendWacallsText({ body: bodyRatingMessage, ticket });
            } catch (err: any) {
              logger.error(`[RATING][wacalls] Falha ao enviar saudação da avaliação p/ ticket ${ticket.id}: ${err?.message}`);
            }
          }

          await ticketTraking.update({
            userId: ticket.userId,
            closedAt: moment().toDate()
          });

          await CreateLogTicketService({
            userId: ticket.userId,
            queueId: ticket.queueId,
            ticketId,
            type: "nps"
          });

          // try {
          //   // Retrieve tagIds associated with the provided ticketId from TicketTags
          //   const ticketTags = await TicketTag.findAll({ where: { ticketId } });
          //   const tagIds = ticketTags.map((ticketTag) => ticketTag.tagId);

          //   // Find the tagIds with kanban = 1 in the Tags table
          //   const tagsWithKanbanOne = await Tag.findAll({
          //     where: {
          //       id: tagIds,
          //       kanban: 1,
          //     },
          //   });

          //   // Remove the tagIds with kanban = 1 from TicketTags
          //   const tagIdsWithKanbanOne = tagsWithKanbanOne.map((tag) => tag.id);
          //   if (tagIdsWithKanbanOne)
          //     await TicketTag.destroy({ where: { ticketId, tagId: tagIdsWithKanbanOne } });
          // } catch (error) {
          //   Sentry.captureException(error);
          // }

          await ticket.update({
            status: "nps",
            amountUsedBotQueuesNPS: 1
          });

          io.of(String(companyId))
            // .to(oldStatus)
            // .to(ticketId.toString())
            .emit(`company-${ticket.companyId}-ticket`, {
              action: "delete",
              ticketId: ticket.id
            });

          return { ticket, oldStatus, oldUserId };
        }
      }

      if (
        ((!isNil(user?.farewellMessage) && user?.farewellMessage !== "") ||
          (!isNil(complationMessage) && complationMessage !== "")) &&
        (sendFarewellMessage || sendFarewellMessage === undefined)
      ) {
        let body: any;

        if (
          ticket.status !== "pending" ||
          (ticket.status === "pending" &&
            settings.sendFarewellWaitingTicket === "enabled")
        ) {
          if (
            !isNil(user) &&
            !isNil(user?.farewellMessage) &&
            user?.farewellMessage !== ""
          ) {
            body = formatBody(`\u200e${user.farewellMessage}`, ticket);
          } else {
            body = formatBody(`\u200e${complationMessage}`, ticket);
          }
          if (
            ticket.channel === "whatsapp" &&
            (!ticket.isGroup || groupAsTicket === "enabled") &&
            ticket.whatsapp.status === "CONNECTED"
          ) {
            const sentMessage = await SendWhatsAppMessage({
              body,
              ticket,
              isForwarded: false
            });

            await verifyMessage(sentMessage, ticket, ticket.contact);
          }

          if (
            ["facebook", "instagram"].includes(ticket.channel) &&
            (!ticket.isGroup || groupAsTicket === "enabled")
          ) {
            const sentMessage = await sendFacebookMessage({ body, ticket });

            // await verifyMessageFace(sentMessage, body, ticket, ticket.contact );
          }

          if (ticket.channel === "whatsapp_oficial") {
            await SendWhatsAppOficialMessage({
              body: body,
              ticket: ticket,
              quotedMsg: null,
              type: 'text',
              media: null,
              vCard: null
            });
          }

          if (ticket.channel === "telegram") {
            await sendTelegramMessage({ body, ticket });
          }

          if (ticket.channel === "wacalls") {
            try {
              const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
              await SendWacallsText({ body, ticket });
            } catch (err) {
              logger.error(`Erro ao enviar farewell do wacalls: ${err}`);
            }
          }

          if (ticket.channel === "webchat") {
            try {
              const { saveWebchatMessage } = require("../WebchatServices/WebchatHelpers");
              await saveWebchatMessage({
                ticket,
                contact: ticket.contact,
                body: body.replace(/^\u200e/, ""),
                fromMe: true
              });
            } catch (err) {
              logger.error(`Erro ao enviar farewell do webchat: ${err}`);
            }
          }

        }
      }

      ticketTraking.finishedAt = moment().toDate();
      ticketTraking.closedAt = moment().toDate();
      ticketTraking.whatsappId = ticket?.whatsappId;
      ticketTraking.userId = ticket.userId;

      // queueId = null;
      // userId = null;
      //loga fim de atendimento
      await CreateLogTicketService({
        userId,
        queueId: ticket.queueId,
        ticketId,
        type: "closed"
      });

      // try {
      //   // Retrieve tagIds associated with the provided ticketId from TicketTags
      //   const ticketTags = await TicketTag.findAll({ where: { ticketId } });
      //   const tagIds = ticketTags.map((ticketTag) => ticketTag.tagId);

      //   // Find the tagIds with kanban = 1 in the Tags table
      //   const tagsWithKanbanOne = await Tag.findAll({
      //     where: {
      //       id: tagIds,
      //       kanban: 1,
      //     },
      //   });

      //   // Remove the tagIds with kanban = 1 from TicketTags
      //   const tagIdsWithKanbanOne = tagsWithKanbanOne.map((tag) => tag.id);
      //   if (tagIdsWithKanbanOne)
      //     await TicketTag.destroy({ where: { ticketId, tagId: tagIdsWithKanbanOne } });
      // } catch (error) {
      //   Sentry.captureException(error);
      // }

      await ticketTraking.save();

      await ticket.update({
        status: "closed",
        lastFlowId: null,
        dataWebhook: null,
        hashFlowId: null,
        valorVenda,
        motivoNaoVenda,
        motivoFinalizacao,
        finalizadoComVenda:
          finalizadoComVenda === undefined || finalizadoComVenda === null
            ? false
            : finalizadoComVenda,
        ...(assuntoParaGravar !== undefined ? { closingSubject: assuntoParaGravar } : {}),
        ...(closingSummary !== undefined ? { closingSummary } : {})
      });

      // ✅ Meta CAPI: dispara conversão se ticket veio de anúncio CTWA
      try {
        const phone = ticket?.contact?.number;
        if (phone) {
          const lead = await findLeadByPhone(phone, companyId);
          if (lead?.ctwa_clid) {
            const isSale = !!finalizadoComVenda;
            const value =
              typeof valorVenda === "number" && valorVenda > 0
                ? valorVenda
                : Number(valorVenda) || undefined;
            if (isSale) {
              await sendCapiEvent(lead, "Purchase", {
                value,
                currency: "BRL",
                eventId: `ticket_${ticketId}_purchase`
              });
            } else {
              await sendCapiEvent(lead, "QualifiedLead", {
                eventId: `ticket_${ticketId}_qlead`
              });
            }
          }
        }
      } catch (e: any) {
        logger.error(`[META CAPI] erro no fechamento do ticket ${ticketId}: ${e?.message}`);
      }

      io.of(String(companyId))
        // .to(oldStatus)
        // .to(ticketId.toString())
        .emit(`company-${ticket.companyId}-ticket`, {
          action: "delete",
          ticketId: ticket.id
        });
      return { ticket, oldStatus, oldUserId };
    }
    let queue;
    if (!isNil(queueId)) {
      queue = await Queue.findByPk(queueId);
      if (queue) {
        ticketTraking.queuedAt = moment().toDate();
      } else {
        logger.warn(`[TICKET UPDATE] Fila ${queueId} não encontrada no banco. Tratando como transferência sem fila.`);
        queueId = null;
      }
    }

    // ✅ CORRIGIDO: NUNCA randomizar quando isTransfered = true (transferência manual)
    // A randomização automática só deve ocorrer em OUTROS fluxos, não em transferências
    if (!isTransfered && !isNil(queueId) && queue) {
      // Só aplicar randomização se NÃO for uma transferência E não há usuário fornecido
      if (isNil(userId) && queue.randomizeImmediate && queue.ativarRoteador) {
        logger.info(
          `[AUTO ASSIGN] Aplicando randomização imediata da fila ${queueId}`,
          { ticketId, queueId, oldQueueId }
        );

        try {
          const randomizationResult = await ListUserQueueImmediateService(queueId, Number(ticketId));

          if (randomizationResult && randomizationResult.userId) {
            userId = randomizationResult.userId;

            logger.info(
              `[AUTO ASSIGN] Usuário atribuído pela randomização imediata`,
              {
                ticketId,
                queueId,
                newUserId: userId,
                typeRandomMode: queue.typeRandomMode
              }
            );

            // Se um usuário foi atribuído pela randomização, o status deve ser
            // "open" (ou "group" para grupos). Antes estava sendo definido como
            // "pending", o que fazia o ticket "voltar para aguardando" mesmo
            // após o atendente ter sido atribuído automaticamente.
            // ✅ EXCEÇÃO: se o ticket está DENTRO de um fluxo do FlowBuilder
            // (flowStopped/flowWebhook/lastFlowId ativos) ou a fila tem
            // integração (flow vinculado), NÃO forçar "open" — manter
            // "pending" para o fluxo continuar rodando normalmente.
            const inActiveFlow = !!(ticket.flowStopped || ticket.flowWebhook || ticket.lastFlowId);
            const queueHasFlow = !!(queue && (queue as any).integrationId);
            if (!isNil(userId) && !inActiveFlow && !queueHasFlow) {
              status = ticket.isGroup ? "group" : "open";
            } else if (!isNil(userId) && (inActiveFlow || queueHasFlow)) {
              logger.info(
                `[AUTO ASSIGN] Ticket ${ticketId} em fluxo ativo - mantendo status "pending" após randomização para não interromper o FlowBuilder`
              );
              status = ticket.isGroup ? "group" : "pending";
            }
          }
        } catch (error) {
          logger.error(
            `[AUTO ASSIGN] Erro ao aplicar randomização imediata`,
            { ticketId, queueId, error: error.message }
          );
        }
      }
    }

    // Log para transferências manuais
    if (isTransfered) {
      logger.info(
        `[TICKET TRANSFER] Transferência manual - IGNORANDO randomização automática`,
        {
          ticketId,
          queueId,
          userId: userId || 'null (sem usuário específico)',
          isTransfered
        }
      );
    }

    if (isTransfered) {
      if (settings.closeTicketOnTransfer) {
        let newTicketTransfer = ticket;
        if (oldQueueId !== queueId) {
          await ticket.update({
            status: "closed"
          });

          await ticket.reload();

          io.of(String(companyId))
            // .to(oldStatus)
            // .to(ticketId.toString())
            .emit(`company-${ticket.companyId}-ticket`, {
              action: "delete",
              ticketId: ticket.id
            });

          newTicketTransfer = await FindOrCreateTicketService(
            ticket.contact,
            ticket.whatsapp,
            1,
            ticket.companyId,
            queueId,
            userId,
            null,
            ticket.channel,
            false,
            false,
            settings,
            isTransfered
          );

          await FindOrCreateATicketTrakingService({
            ticketId: newTicketTransfer.id,
            companyId,
            whatsappId: ticket.whatsapp.id,
            userId
          });
        }

        if (!isNil(msgTransfer)) {
          const messageData = {
            wid: `PVT${newTicketTransfer.updatedAt
              .toString()
              .replace(" ", "")}`,
            ticketId: newTicketTransfer.id,
            body: msgTransfer,
            fromMe: true,
            mediaType: "extendedTextMessage",
            read: true,
            ack: 2,
            isPrivate: true
          };

          await CreateMessageService({
            messageData,
            companyId: ticket.companyId
          });
        }

        await newTicketTransfer.update({
          queueId,
          userId,
          status
        });

        await newTicketTransfer.reload();

        if (settings.sendMsgTransfTicket === "enabled") {
          // Mensagem de transferencia da FILA
          if (
            (oldQueueId !== queueId || oldUserId !== userId) &&
            !isNil(queueId) &&
            queue &&
            ticket.whatsapp?.status === "CONNECTED"
          ) {

            const rawTransferMsg = (settings.transferMessage || "").replace(
              "${queue.name}",
              queue?.name || ""
            );
            const transferMsgClean = rawTransferMsg
              .replace(/[\u200e\u200f\u200b\u200c\u200d\uFEFF]/g, "")
              .trim();
            const msgtxt = transferMsgClean.length > 0
              ? formatBody(`\u200e ${rawTransferMsg}`, ticket, { queue: queue?.name || "" })
              : "";

            if (transferMsgClean.length > 0 && msgtxt.length > 0) {

              if (ticket.channel === "whatsapp") {
                const wbot = await GetTicketWbot(ticket);
                const queueChangedMessage = await wbot.sendMessage(
                  getJidOf(ticket),
                  {
                    text: msgtxt
                  }
                );

                await verifyMessage(
                  queueChangedMessage,
                  ticket,
                  ticket.contact,
                  ticketTraking
                );
              }

              if (ticket.channel === "whatsapp_oficial") {
                await SendWhatsAppOficialMessage({
                  body: msgtxt,
                  ticket: ticket,
                  quotedMsg: null,
                  type: 'text',
                  media: null,
                  vCard: null
                });
              }

              if (ticket.channel === "wacalls") {
                try {
                  const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
                  await SendWacallsText({ body: msgtxt, ticket });
                } catch (err) {
                  logger.error(`Erro ao enviar mensagem de transferência via wacalls: ${err}`);
                }
              }

              // Z-API: enviar mensagem de transferência
              if (ticket.whatsapp?.zapiInstanceId) {
                const channel = detectChannel(ticket.whatsapp);
                if (channel === "zapi") {
                  await sendTextByChannel(channel, msgtxt, ticket, ticket.whatsapp);
                }
              }
            }

          }
          // else
          //   // Mensagem de transferencia do ATENDENTE
          //   if (oldUserId !== userId && oldQueueId === queueId && !isNil(oldUserId) && !isNil(userId) && (!ticket.isGroup || groupAsTicket === "enabled")) {
          //     const wbot = await GetTicketWbot(ticket);
          //     const nome = await ShowUserService(ticketData.userId, companyId);
          //     const msgtxt = `\u200e*Mensagem Automática*:\nVocê foi transferido(a) para o atendente *${nome.name}*\nAguarde um momento, iremos atende-lo(a)!`;

          //     const queueChangedMessage = await wbot.sendMessage(
          //       `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          //       {
          //         text: msgtxt
          //       }
          //     );
          //     await verifyMessage(queueChangedMessage, ticket, ticket.contact, ticketTraking);
          //   }
          //   else
          //     // Mensagem de transferencia do ATENDENTE e da FILA
          //     if (oldUserId !== userId && oldQueueId !== queueId && !isNil(oldUserId) && !isNil(userId) && (!ticket.isGroup || groupAsTicket === "enabled")) {
          //       const wbot = await GetTicketWbot(ticket);
          //       const nome = await ShowUserService(ticketData.userId, companyId);
          //       const msgtxt = `\u200e*Mensagem Automática*:\nVocê foi transferido(a) para o departamento *${queue?.name}* e será atendido por *${nome.name}*\nAguarde um momento, iremos atende-lo(a)!`;

          //       const queueChangedMessage = await wbot.sendMessage(
          //         `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          //         {
          //           text: msgtxt
          //         }
          //       );
          //       await verifyMessage(queueChangedMessage, ticket, ticket.contact);
          //     } else
          //       if (oldUserId !== undefined && isNil(userId) && oldQueueId !== queueId && !isNil(queueId)) {

          //         const wbot = await GetTicketWbot(ticket);
          //         const msgtxt = "\u200e*Mensagem Automática*:\nVocê foi transferido(a) para o departamento *" + queue?.name + "*\nAguarde um momento, iremos atende-lo(a)!";

          //         const queueChangedMessage = await wbot.sendMessage(
          //           `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          //           {
          //             text: msgtxt
          //           }
          //         );
          //         await verifyMessage(queueChangedMessage, ticket, ticket.contact);
          //       }
        }

        if (
          oldUserId !== userId &&
          oldQueueId === queueId &&
          !isNil(oldUserId) &&
          !isNil(userId)
        ) {
          //transferiu o atendimento para fila
          await CreateLogTicketService({
            userId: oldUserId,
            queueId: oldQueueId,
            ticketId,
            type: "transfered"
          });
        } else if (
          oldUserId !== userId &&
          oldQueueId === queueId &&
          !isNil(oldUserId) &&
          !isNil(userId)
        ) {
          //transferiu o atendimento para atendente na mesma fila
          await CreateLogTicketService({
            userId: oldUserId,
            queueId: oldQueueId,
            ticketId,
            type: "transfered"
          });
          //recebeu atendimento
          await CreateLogTicketService({
            userId,
            queueId: oldQueueId,
            ticketId: newTicketTransfer.id,
            type: "receivedTransfer"
          });
        } else if (
          oldUserId !== userId &&
          oldQueueId !== queueId &&
          !isNil(oldUserId) &&
          !isNil(userId)
        ) {
          //transferiu o atendimento para fila e atendente

          await CreateLogTicketService({
            userId: oldUserId,
            queueId: oldQueueId,
            ticketId,
            type: "transfered"
          });
          //recebeu atendimento
          await CreateLogTicketService({
            userId,
            queueId,
            ticketId: newTicketTransfer.id,
            type: "receivedTransfer"
          });
        } else if (
          oldUserId !== undefined &&
          isNil(userId) &&
          oldQueueId !== queueId &&
          !isNil(queueId)
        ) {
          await CreateLogTicketService({
            userId: oldUserId,
            queueId: oldQueueId,
            ticketId,
            type: "transfered"
          });
        }

        if (
          newTicketTransfer.status !== oldStatus ||
          newTicketTransfer.user?.id !== oldUserId
        ) {
          await ticketTraking.update({
            userId: newTicketTransfer.userId
          });
          io.of(String(companyId))
            // .to(oldStatus)
            .emit(`company-${companyId}-ticket`, {
              action: "delete",
              ticketId: newTicketTransfer.id
            });
        }

        io.of(String(companyId))
          // .to(newTicketTransfer.status)
          // .to("notification")
          // .to(newTicketTransfer.id.toString())
          .emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket: newTicketTransfer
          });

        return { ticket: newTicketTransfer, oldStatus, oldUserId };
      } else {
        if (settings.sendMsgTransfTicket === "enabled") {
          // Mensagem de transferencia da FILA
          if (
            (oldQueueId !== queueId || oldUserId !== userId) &&
            !isNil(queueId) &&
            queue &&
            ticket.whatsapp?.status === "CONNECTED"
          ) {

            const rawTransferMsg = (settings.transferMessage || "").replace(
              "${queue.name}",
              queue?.name || ""
            );
            const msgtxt = hasVisibleText(rawTransferMsg)
              ? formatBody(`\u200e ${rawTransferMsg}`, ticket, { queue: queue?.name || "" })
              : "";
            // const msgtxt = `\u200e*Mensagem Automática*:\nVocê foi transferido(a) para o departamento *${queue?.name}"*\nAguarde um momento, iremos atende-lo(a)!`;

            if (hasVisibleText(msgtxt)) {

              if (ticket.channel === "whatsapp") {
                const wbot = await GetTicketWbot(ticket);
                const queueChangedMessage = await wbot.sendMessage(
                  `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
                  }`,
                  {
                    text: msgtxt
                  }
                );
                await verifyMessage(
                  queueChangedMessage,
                  ticket,
                  ticket.contact,
                  ticketTraking
                );
              }

              if (ticket.channel === "whatsapp_oficial") {
                await SendWhatsAppOficialMessage({
                  body: msgtxt,
                  ticket: ticket,
                  quotedMsg: null,
                  type: 'text',
                  media: null,
                  vCard: null
                });
              }

              if (ticket.channel === "wacalls") {
                try {
                  const { SendWacallsText } = await import("../WacallsServices/SendWacallsMessageService");
                  await SendWacallsText({ body: msgtxt, ticket });
                } catch (err) {
                  logger.error(`Erro ao enviar mensagem de transferência via wacalls: ${err}`);
                }
              }

              // Z-API: enviar mensagem de transferência
              if (ticket.whatsapp?.zapiInstanceId) {
                const channel = detectChannel(ticket.whatsapp);
                if (channel === "zapi") {
                  await sendTextByChannel(channel, msgtxt, ticket, ticket.whatsapp);
                }
              }
            }
          }
          // else
          //   // Mensagem de transferencia do ATENDENTE
          //   if (oldUserId !== userId && oldQueueId === queueId && !isNil(oldUserId) && !isNil(userId) && (!ticket.isGroup || groupAsTicket === "enabled")) {
          //     const wbot = await GetTicketWbot(ticket);
          //     const nome = await ShowUserService(ticketData.userId, companyId);
          //     const msgtxt = `\u200e*Mensagem Automática*:\nVocê foi transferido(a) para o atendente *${nome.name}*\nAguarde um momento, iremos atende-lo(a)!`;

          //     const queueChangedMessage = await wbot.sendMessage(
          //       `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          //       {
          //         text: msgtxt
          //       }
          //     );
          //     await verifyMessage(queueChangedMessage, ticket, ticket.contact, ticketTraking);
          //   }
          //   else
          //     // Mensagem de transferencia do ATENDENTE e da FILA
          //     if (oldUserId !== userId && oldQueueId !== queueId && !isNil(oldUserId) && !isNil(userId) && (!ticket.isGroup || groupAsTicket === "enabled")) {
          //       const wbot = await GetTicketWbot(ticket);
          //       const nome = await ShowUserService(ticketData.userId, companyId);
          //       const msgtxt = `\u200e*Mensagem Automática*:\nVocê foi transferido(a) para o departamento *${queue?.name}* e será atendido por *${nome.name}*\nAguarde um momento, iremos atende-lo(a)!`;

          //       const queueChangedMessage = await wbot.sendMessage(
          //         `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          //         {
          //           text: msgtxt
          //         }
          //       );
          //       await verifyMessage(queueChangedMessage, ticket, ticket.contact);
          //     } else
          //       if (oldUserId !== undefined && isNil(userId) && oldQueueId !== queueId && !isNil(queueId)) {

          //         const wbot = await GetTicketWbot(ticket);
          //         const msgtxt = "\u200e*Mensagem Automática*:\nVocê foi transferido(a) para o departamento *" + queue?.name + "*\nAguarde um momento, iremos atende-lo(a)!";

          //         const queueChangedMessage = await wbot.sendMessage(
          //           `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          //           {
          //             text: msgtxt
          //           }
          //         );
          //         await verifyMessage(queueChangedMessage, ticket, ticket.contact);
          //       }
        }

        if (!isNil(msgTransfer)) {
          const messageData = {
            wid: `PVT${ticket.updatedAt.toString().replace(" ", "")}`,
            ticketId: ticket.id,
            body: msgTransfer,
            fromMe: true,
            mediaType: "extendedTextMessage",
            read: true,
            ack: 2,
            isPrivate: true
          };

          await CreateMessageService({
            messageData,
            companyId: ticket.companyId
          });
        }

        if (
          oldUserId !== userId &&
          oldQueueId === queueId &&
          !isNil(oldUserId) &&
          !isNil(userId)
        ) {
          //transferiu o atendimento para fila
          await CreateLogTicketService({
            userId: oldUserId,
            queueId: oldQueueId,
            ticketId,
            type: "transfered"
          });
        } else if (
          oldUserId !== userId &&
          oldQueueId === queueId &&
          !isNil(oldUserId) &&
          !isNil(userId)
        ) {
          //transferiu o atendimento para atendente na mesma fila
          await CreateLogTicketService({
            userId: oldUserId,
            queueId: oldQueueId,
            ticketId,
            type: "transfered"
          });
          //recebeu atendimento
          await CreateLogTicketService({
            userId,
            queueId: oldQueueId,
            ticketId: ticket.id,
            type: "receivedTransfer"
          });
        } else if (
          oldUserId !== userId &&
          oldQueueId !== queueId &&
          !isNil(oldUserId) &&
          !isNil(userId)
        ) {
          //transferiu o atendimento para fila e atendente

          await CreateLogTicketService({
            userId: oldUserId,
            queueId: oldQueueId,
            ticketId,
            type: "transfered"
          });
          //recebeu atendimento
          await CreateLogTicketService({
            userId,
            queueId,
            ticketId: ticket.id,
            type: "receivedTransfer"
          });
        } else if (
          oldUserId !== undefined &&
          isNil(userId) &&
          oldQueueId !== queueId &&
          !isNil(queueId)
        ) {
          await CreateLogTicketService({
            userId: oldUserId,
            queueId: oldQueueId,
            ticketId,
            type: "transfered"
          });
        }

        // if (ticket.status !== oldStatus || ticket.user?.id !== oldUserId) {
        //   await ticketTraking.update({
        //     userId: ticket.userId
        //   })

        //   io.to(oldStatus).emit(`company-${companyId}-ticket`, {
        //     action: "delete",
        //     ticketId: ticket.id
        //   });
        // }

        // io.to(ticket.status)
        //   .to("notification")
        //   .to(ticket.id.toString())
        //   .emit(`company-${companyId}-ticket`, {
        //     action: "update",
        //     ticket: ticket
        //   });

        // return { ticket, oldStatus, oldUserId };
      }
    }

    status = queue && queue.closeTicket ? "closed" : status;

    // ✅ CORRIGIDO: Tickets de grupo devem permanecer como "group", mesmo sem fila
    if (!status && isNil(queueId)) {
      // Considera o usuário atual do ticket como fallback, para não rebaixar
      // um ticket "atendendo" para "aguardando" em updates parciais
      // (ex.: PUT apenas com { unreadMessages: 0 } ao clicar no ticket).
      const effectiveUserId = !isNil(userId) ? userId : ticket.userId;
      status = ticket.isGroup ? "group" : (!isNil(effectiveUserId) ? "open" : "pending");
      logger.info(`[TICKET UPDATE] Ticket ${ticketId} sem fila - status determinado automaticamente: ${status}`);
    }

    // Preserva valores atuais quando o payload não enviar esses campos,
    // evitando que updates parciais (ex.: zerar unreadMessages ao clicar)
    // apaguem userId/queueId e voltem o ticket para "aguardando".
    const finalStatus = status ?? ticket.status;
    const finalUserId = userId !== undefined ? userId : ticket.userId;
    const finalQueueId = queueId !== undefined ? queueId : ticket.queueId;

    await ticket.update({
      status: finalStatus,
      queueId: finalQueueId,
      userId: finalUserId,
      isBot,
      queueOptionId,
      ...(newWhatsappId !== undefined ? { whatsappId: newWhatsappId } : {}),
      amountUsedBotQueues:
        status === "closed"
          ? 0
          : amountUsedBotQueues
            ? amountUsedBotQueues
            : ticket.amountUsedBotQueues,
      lastMessage: lastMessage ? lastMessage : ticket.lastMessage,
      useIntegration,
      integrationId,
      typebotSessionId: !useIntegration ? null : ticket.typebotSessionId,
      typebotStatus: useIntegration,
      unreadMessages,
      valorVenda,
      motivoNaoVenda,
      motivoFinalizacao,
      finalizadoComVenda,
      ...(assuntoParaGravar !== undefined ? { closingSubject: assuntoParaGravar } : {}),
      ...(closingSummary !== undefined ? { closingSummary } : {})
    });

    ticketTraking.queuedAt = moment().toDate();
    ticketTraking.queueId = finalQueueId;

    await ticket.reload();

    // ticket = await ShowTicketService(ticket.id, companyId)

    if (status !== undefined && ["pending"].indexOf(status) > -1) {
      //ticket voltou para fila
      await CreateLogTicketService({
        userId: oldUserId,
        ticketId,
        type: "pending"
      });

      await ticketTraking.update({
        whatsappId: ticket.whatsappId,
        startedAt: null,
        userId: null
      });

      // Notificar usuários da fila quando o ticket entra em pendente
      // (transferência de volta à fila, reabertura, etc.)
      if (oldStatus !== "pending") {
        NotifyPendingTicketToUsers(ticket, { type: "pending" }).catch(err =>
          logger.error(`[NotifyTicket:pending] erro: ${err?.message}`)
        );
      }
    }

    // Notificar quando a fila é atribuída tardiamente a um ticket pending
    // que foi criado sem fila (FindOrCreateTicket não dispara nesse caso).
    const queueWasAssigned =
      (oldQueueId === null || oldQueueId === undefined) &&
      !!finalQueueId &&
      finalStatus === "pending";
    if (queueWasAssigned) {
      NotifyPendingTicketToUsers(ticket, { type: "pending" }).catch(err =>
        logger.error(
          `[NotifyTicket:pending-queueAssigned] erro: ${err?.message}`
        )
      );
    }

    if (status !== undefined && ["open"].indexOf(status) > -1) {
      await ticketTraking.update({
        startedAt: moment().toDate(),
        ratingAt: null,
        rated: false,
        whatsappId: ticket.whatsappId,
        userId: ticket.userId,
        queueId: ticket.queueId
      });

      //loga inicio de atendimento
      await CreateLogTicketService({
        userId: userId,
        queueId: ticket.queueId,
        ticketId,
        type: oldStatus === "pending" ? "open" : "reopen"
      });

      // Envia a saudação personalizada do atendente sempre que o ticket for
      // atribuído a um novo usuário e passar para "open" (aceite manual, transferência
      // direta a atendente, nó Atendente do fluxo, etc.).
      if (ticket.userId && ticket.userId !== oldUserId) {
        logger.info(`[TICKET ACCEPTED] Ticket ${ticket.id} atribuído a novo usuário ${ticket.userId} (anterior=${oldUserId || "nenhum"}) - disparando saudação`);
        await sendUserAcceptanceGreeting(ticket);
      }

      // Notificar usuários da fila quando o ticket entra em atendimento
      if (oldStatus !== "open") {
        NotifyPendingTicketToUsers(ticket, { type: "open" }).catch(err =>
          logger.error(`[NotifyTicket:open] erro: ${err?.message}`)
        );
      }
    }

    await ticketTraking.save();

    ticket = await ShowTicketService(ticket.id, companyId);

    if (
      ticket.status !== oldStatus ||
      ticket.user?.id !== oldUserId ||
      ticket.queueId !== oldQueueId
    ) {

      io.of(String(companyId))
        // .to(oldStatus)
        .emit(`company-${companyId}-ticket`, {
          action: "delete",
          ticketId: ticket.id
        });
    }

    io.of(String(companyId))
      // .to(ticket.status)
      // .to("notification")
      // .to(ticketId.toString())
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });

    return { ticket, oldStatus, oldUserId };
  } catch (err) {
    Sentry.captureException(err);
    throw err;
  }
};

export default UpdateTicketService;
