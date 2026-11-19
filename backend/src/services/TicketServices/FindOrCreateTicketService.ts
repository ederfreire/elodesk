import { Op } from "sequelize";
import { sub } from "date-fns";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import { isNil } from "lodash";
import { getIO } from "../../libs/socket";
import Whatsapp from "../../models/Whatsapp";
import CreateLogTicketService from "./CreateLogTicketService";
import AppError from "../../errors/AppError";
import ContactWallet from "../../models/ContactWallet";
import ShowContactService from "../ContactServices/ShowContactService";
import logger from "../../utils/logger";
import { withLock } from "../../utils/redisLock";
import NotifyPendingTicketToUsers from "../UserServices/NotifyPendingTicketToUsers";


const FindOrCreateTicketService = async (
  contact: Contact,
  whatsapp: Whatsapp,
  unreadMessages: number,
  companyId: number,
  queueId: number = null,
  userId: number = null,
  groupContact?: Contact,
  channel?: string,
  isImported?: boolean,
  isForward?: boolean,
  settings?: any,
  isTransfered?: boolean,
  isCampaign: boolean = false
): Promise<Ticket> => {
  const lockKey = `ticket:lock:${companyId}:${groupContact ? groupContact.id : contact.id}`;

  return withLock(lockKey, async () => {

  // await new Promise(resolve => setTimeout(resolve, 3000));

  let openAsLGPD = false
  if (settings.enableLGPD) { //adicionar lgpdMessage

    openAsLGPD = !isCampaign &&
      !isTransfered &&
      settings.enableLGPD === "enabled" &&
      settings.lgpdMessage !== "" &&
      (settings.lgpdConsent === "enabled" ||
        (settings.lgpdConsent === "disabled" && isNil(contact?.lgpdAcceptedAt)))
  }

  const io = getIO();

  const DirectTicketsToWallets = settings.DirectTicketsToWallets;

  const contactId = groupContact ? groupContact.id : contact.id;

  // Fonte única da verdade sobre "isto é um grupo?": só é grupo quando existe
  // um `groupContact` (o próprio grupo) OU quando o contato dono do ticket está
  // marcado como grupo / tem remoteJid @g.us. Sem essa normalização, tickets
  // comuns herdavam `status: "group"`/`isGroup: true` de reaberturas antigas e
  // apareciam na aba Grupos — e grupos com a flag perdida caíam em Aguardando.
  const ticketOwnerContact: any = groupContact || contact;
  const isGroupTicket =
    !!groupContact ||
    ticketOwnerContact?.isGroup === true ||
    String(ticketOwnerContact?.remoteJid || "").endsWith("@g.us");

  logger.debug(`[RDS-TICKET] Buscando tickets existentes para contactId=${contactId}, companyId=${companyId}, whatsappId=${whatsapp.id}, queueId=${queueId}, userId=${userId}, channel=${channel}`);

  let ticket = await Ticket.findOne({
    where: {
      status: {
        [Op.or]: ["open", "pending", "group", "chatbot", "nps", "lgpd"]
      },
      contactId: contactId,
      companyId,
      whatsappId: whatsapp.id
    },
    order: [["updatedAt", "DESC"]]
  });

  // ✅ INDEPENDÊNCIA POR CONEXÃO: Cada conexão (whatsappId) mantém seus próprios tickets.
  // Se o contato escrever para dois números diferentes, terá tickets separados em cada um.

  if (ticket) {
    logger.debug(`[RDS-TICKET] Ticket existente encontrado: ID=${ticket.id}, status=${ticket.status}, updatedAt=${ticket.updatedAt}`);
  } else {
    logger.debug(`[RDS-TICKET] Nenhum ticket existente para contactId=${contactId}`);
  }

  if (ticket) {
    logger.debug(`[RDS-TICKET] Atualizando ticket existente ID=${ticket.id}, antigo status=${ticket.status}`);

    if (isCampaign) {
      await ticket.update({
        userId: userId !== ticket.userId ? ticket.userId : userId,
        queueId: queueId !== ticket.queueId ? ticket.queueId : queueId,
      })
    } else {
      const newUnreadCount = ticket.unreadMessages + unreadMessages;

      const updateData: any = {
        unreadMessages: newUnreadCount,
        isBot: false
      };

      // ✅ CORRIGIDO: Preservar modo IA permanente
      const dataWebhook = ticket.dataWebhook as any;
      const isAIPermanentMode = dataWebhook?.type === "openai" || dataWebhook?.type === "gemini";
      if (isAIPermanentMode && dataWebhook?.mode === "permanent") {
        updateData.isBot = true; // Manter isBot = true para IA permanente
        logger.info(`[AI PERMANENT] Preservando modo IA permanente para ticket ${ticket.id}`);
      }

      if (!ticket.whatsappId && whatsapp?.id) {
        updateData.whatsappId = whatsapp.id;
      }

      const canApplyConnectionQueue =
        queueId !== 0 &&
        queueId !== null &&
        queueId !== undefined &&
        (isNil(ticket.queueId) || Number(ticket.queueId) === 0);

      if (canApplyConnectionQueue) {
        updateData.queueId = queueId;
        logger.info(`[RDS-TICKET] Aplicando fila da conexão ao ticket existente ${ticket.id}: queueId=${queueId}`);
      }

      // Mantém a flag do ticket coerente com a natureza real do contato.
      if (ticket.isGroup !== isGroupTicket) {
        updateData.isGroup = isGroupTicket;
      }
      // Ticket comum que ficou preso com status "group" volta para "pending":
      // senão ele some das abas normais e polui a aba Grupos.
      if (!isGroupTicket && ticket.status === "group") {
        updateData.status = "pending";
      }

      if (!["open", "pending", "chatbot", "nps"].includes(ticket.status)) {
        if (isGroupTicket) {
          // Para tickets de grupo, precisamos verificar a configuração groupAsTicket
          logger.debug(`[RDS-TICKET] Ticket ${ticket.id} identificado como grupo, verificando configuração groupAsTicket`);

          // Tickets de grupo SEMPRE permanecem com status "group" para ficarem visíveis
          // apenas na aba "Grupos" (e não em "Aguardando"/"Atendendo") após reload.
          logger.debug(`[RDS-TICKET] Mantendo ticket ${ticket.id} como 'group' (regra: grupos sempre na aba Grupos)`);
          if (ticket.status !== "group") {
            updateData.status = "group";
          }
        } else {
          // Para tickets normais (não de grupo), reativar normalmente
          logger.debug(`[RDS-TICKET] Reativando ticket ${ticket.id} de status '${ticket.status}' para 'pending'`);
          updateData.status = "pending";
        }
      }

      await ticket.update(updateData);
    }

    ticket = await ShowTicketService(ticket.id, companyId);
    logger.debug(`[RDS-TICKET] Ticket atualizado ID=${ticket.id}, novo status=${ticket.status}`);


    if (!isCampaign && !isForward) {
      // @ts-ignore: Unreachable code error
      if ((Number(ticket?.userId) !== Number(userId) && userId !== 0 && userId !== "" && userId !== "0" && !isNil(userId) && !ticket.isGroup)
        // @ts-ignore: Unreachable code error
        || (queueId !== 0 && Number(ticket?.queueId) !== Number(queueId) && queueId !== "" && queueId !== "0" && !isNil(queueId))) {
        throw new AppError(`Ticket em outro atendimento. ${"Atendente: " + ticket?.user?.name} - ${"Fila: " + ticket?.queue?.name}`);
      }
    }

    return ticket
  }

  const timeCreateNewTicket = whatsapp.timeCreateNewTicket;

  if (!ticket && timeCreateNewTicket !== 0) {
    logger.debug(`[RDS-TICKET] Verificando tickets recentes nos últimos ${timeCreateNewTicket} minutos`);

    if (Number(timeCreateNewTicket) !== 0) {
      // Primeiro buscar na mesma conexão
      ticket = await Ticket.findOne({
        where: {
          updatedAt: {
            [Op.between]: [
              +sub(new Date(), {
                minutes: Number(timeCreateNewTicket)
              }),
              +new Date()
            ]
          },
          contactId: contactId,
          companyId,
          whatsappId: whatsapp.id
        },
        order: [["updatedAt", "DESC"]]
      });

      // ✅ INDEPENDÊNCIA POR CONEXÃO: Não buscar tickets em outras conexões.
      // Cada whatsappId tem seu próprio ciclo de vida de tickets.

      if (ticket) {
        logger.debug(`[RDS-TICKET] Ticket recente encontrado: ID=${ticket.id}, status=${ticket.status}, updatedAt=${ticket.updatedAt}`);
      }
    }

    if (ticket && ticket.status !== "nps") {
      const reopenStatus = isGroupTicket ? "group" : "pending";
      logger.debug(`[RDS-TICKET] Reativando ticket recente ID=${ticket.id} como '${reopenStatus}'`);
      await ticket.update({
        status: reopenStatus,
        unreadMessages,
        companyId,
      });

    }
  }

  if (!ticket) {
    // ✅ TRIPLE-CHECK: Buscar com TODOS os status (incluindo closed recente) para evitar duplicação
    ticket = await Ticket.findOne({
      where: {
        status: {
          [Op.or]: ["open", "pending", "group", "chatbot", "nps", "lgpd"]
        },
        contactId: contactId,
        companyId,
        whatsappId: whatsapp.id
      },
      order: [["updatedAt", "DESC"]]
    });

    if (ticket) {
      logger.warn(`[RDS-TICKET] Ticket encontrado no double-check (race condition evitada): ID=${ticket.id}`);
      await ticket.update({ unreadMessages: ticket.unreadMessages + unreadMessages });
    } else {
      // ✅ CHECK ADICIONAL: Buscar ticket criado nos últimos 5 segundos (mesmo fechado) para evitar duplicação
      const recentTicket = await Ticket.findOne({
        where: {
          contactId: contactId,
          companyId,
          whatsappId: whatsapp.id,
          createdAt: {
            [Op.gte]: sub(new Date(), { seconds: 5 })
          }
        },
        order: [["createdAt", "DESC"]]
      });

      if (recentTicket) {
        logger.warn(`[RDS-TICKET] Ticket muito recente encontrado (criado há <5s), reusando: ID=${recentTicket.id}, status=${recentTicket.status}`);
        if (["closed"].includes(recentTicket.status)) {
          const reopenStatus = isGroupTicket ? "group" : "pending";
          await recentTicket.update({ status: reopenStatus, unreadMessages });
        } else {
          await recentTicket.update({ unreadMessages: recentTicket.unreadMessages + unreadMessages });
        }
        ticket = recentTicket;
      } else {
        logger.debug(`[RDS-TICKET] Criando novo ticket para contactId=${contactId}, companyId=${companyId}`);

        const ticketData: any = {
          contactId: contactId,
          status: (!isImported && !isNil(settings.enableLGPD)
            && openAsLGPD && !groupContact) ?
            "lgpd" :
            // Grupos sempre vão para a aba "Grupos" (status "group"),
            // independente do groupAsTicket — evita que reapareçam em Aguardando/Atendendo após reload.
            (isGroupTicket ? "group" : "pending"),
          isGroup: isGroupTicket,
          unreadMessages,
          whatsappId: whatsapp.id,
          companyId,
          isBot: groupContact ? false : true,
          channel,
          imported: isImported ? new Date() : null,
          isActiveDemand: false
        };

        const contactWallet = await ShowContactService(contact.id, companyId)

        if (DirectTicketsToWallets && ((contact.id && !groupContact) || (groupContact && groupContact)) && contactWallet.contactWallets.length > 0) {
          const wallets = await ContactWallet.findOne({
            where: {
              contactId: groupContact ? groupContact.id : contact.id,
              companyId: companyId
            }
          })

          try {
            if (wallets?.walletId && wallets?.queueId) {
              const userId = contactWallet.wallets[0].id

              if (wallets && wallets?.id) {
                ticketData.status = (!isImported && !isNil(settings.enableLGPD)
                  && openAsLGPD && !groupContact) ?
                  "lgpd" :
                  // Grupos sempre permanecem na aba "Grupos"
                  (isGroupTicket ? "group" : "pending"),
                  ticketData.userId = userId;
                ticketData.queueId = wallets.queueId;
                ticketData.isBot = false;
                ticketData.startBot = false;
                ticketData.useIntegration = false;
                ticketData.integrationId = null;
                ticketData.isGroup = isGroupTicket;
              }
            }
          } catch (error) {
            logger.error("[RDS-TICKET] error wallet", error);
          }
        }

        ticket = await Ticket.create(
          ticketData
        );
      }
    }
  }


  if (queueId != 0 && !isNil(queueId)) {
    await ticket.update({ queueId: queueId });
  }

  if (userId != 0 && !isNil(userId)) {
    await ticket.update({ userId: userId });
  }

  ticket = await ShowTicketService(ticket.id, companyId);

  await CreateLogTicketService({
    ticketId: ticket.id,
    type: openAsLGPD ? "lgpd" : "create"
  });

  if (ticket.status === "pending" && ticket.queueId && !isImported) {
    logger.info(`[FindOrCreateTicket] Ticket pending com fila - ticketId=${ticket.id}, queueId=${ticket.queueId}`);
    NotifyPendingTicketToUsers(ticket).catch(err =>
      logger.error(`[FindOrCreateTicket] Falha ao notificar usuários: ${err.message}`)
    );
  } else {
    logger.info(`[NotifyUser] Notificação NÃO disparada - status=${ticket.status}, queueId=${ticket.queueId || 'null'}, isImported=${isImported}`);
  }

  logger.debug(`[RDS-TICKET] Ticket final: ID=${ticket.id}, status=${ticket.status}, contactId=${ticket.contactId}`);
  return ticket;
  }, { ttlSeconds: 20, maxRetries: 12, retryDelayMs: 400 }); // withLock
};

export default FindOrCreateTicketService;
