import { Request, Response } from "express";
import AppError from "../errors/AppError";
import TicketTag from '../models/TicketTag';
import Tag from '../models/Tag'
import { getIO } from "../libs/socket";
import Ticket from "../models/Ticket";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import { isNil } from "lodash";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import { sendFacebookMessage } from "../services/FacebookServices/sendFacebookMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppOficialMessage from "../services/WhatsAppOficial/SendWhatsAppOficialMessage";
import { sendTelegramMessage } from "../services/TelegramServices/sendTelegramMessage";
import NotifyPendingTicketToUsers from "../services/UserServices/NotifyPendingTicketToUsers";
import { limparLanesDeOutrosTicketsDoContato } from "../services/FlowBuilderService/MoveTicketToKanbanService";

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId, tagId } = req.params;
  const { companyId } = req.user;

  try {
    const ticketTag = await TicketTag.create({ ticketId, tagId });

    // A lane e uma tag do TICKET, mas o funil e do CONTATO. Um contato com
    // varios atendimentos (o FindOrCreateTicketService cria ou reabre um a
    // cada retorno do cliente) aparecia em varias colunas ao mesmo tempo —
    // o "esta duplicando ao mover". O ticket que acabou de ser arrastado
    // manda; os outros saem das lanes.
    try {
      const ticketDoContato = await Ticket.findByPk(ticketId);
      if (ticketDoContato) {
        await limparLanesDeOutrosTicketsDoContato(ticketDoContato, companyId);
      }
    } catch (limpezaErr) {
      // Best-effort: nao pode impedir o arrastar do card.
    }

    if (ticketTag) {
      const nextTag = await Tag.findOne({ where: { id: tagId } });

      // Disparar Floups (Follow UP) cuja condição de ativação seja esta tag
      try {
        const ticketForFloup = await Ticket.findByPk(ticketId);
        if (ticketForFloup?.contactId && nextTag?.name) {
          const FloupService = (await import('../plugins/floup/service')).default;
          await FloupService.verificarEIniciarFloupsAoAdicionarTag(
            ticketForFloup.contactId,
            companyId,
            nextTag.name
          );
        }
      } catch (floupErr) {
        // Não interrompe o fluxo principal
        console.error('[FLOUP] Erro ao disparar Floup por tag (TicketTagController):', floupErr);
      }


      if (!isNil(nextTag.greetingMessageLane) && nextTag.greetingMessageLane !== "") {
        const ticketUpdate = await ShowTicketService(ticketId, companyId);
        const bodyMessage = ticketUpdate.user ? `*${ticketUpdate.user.name}:*\n${nextTag.greetingMessageLane}` : nextTag.greetingMessageLane;

        if (ticketUpdate.channel === "whatsapp") {
          // Enviar mensagem de texto
          await SendWhatsAppMessage({ body: bodyMessage, ticket: ticketUpdate });

          // Enviar mídias se existirem
          if (nextTag.mediaFiles) {
            try {
              const mediaFiles = JSON.parse(nextTag.mediaFiles);
              for (const mediaFile of mediaFiles) {
                await SendWhatsAppMedia({
                  media: mediaFile,
                  ticket: ticketUpdate
                });
              }
            } catch (error) {
            }
          }
        }

        if (["facebook", "instagram"].includes(ticketUpdate.channel)) {
          try {
            await sendFacebookMessage({ body: `\u200e ${bodyMessage}`, ticket: ticketUpdate });
          } catch (error) {
          }
        }

        if (ticketUpdate.channel === "whatsapp_oficial") {

          await SendWhatsAppOficialMessage({
            body: bodyMessage,
            ticket: ticketUpdate,
            quotedMsg: null,
            type: 'text',
            media: null,
            vCard: null
          });

          if (nextTag.mediaFiles) {
            try {
              const mediaFiles = JSON.parse(nextTag.mediaFiles);
              for (const mediaFile of mediaFiles) {
                const mediaSrc = {
                  fieldname: 'medias',
                  originalname: mediaFile.originalname,
                  encoding: '7bit',
                  mimetype: mediaFile.mimetype,
                  filename: mediaFile.filename,
                  path: mediaFile.path
                } as Express.Multer.File

                await SendWhatsAppOficialMessage({
                  body: "",
                  ticket: ticketUpdate,
                  type: mediaFile.mimetype.split("/")[0],
                  media: mediaSrc
                });
              }
            } catch (error) {
            }
          }
        }

        if (ticketUpdate.channel === "telegram") {
          try {
            await sendTelegramMessage({ body: bodyMessage, ticket: ticketUpdate });
          } catch (error) {
          }
        }
      }
    }

    const ticket = await ShowTicketService(ticketId, companyId);

    const io = getIO();
    io.of(String(companyId))
      // .to(ticket.status)
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });

    // Notificar usuários da fila sobre mudança no Kanban (nova lane/tag)
    try {
      const tagInfo = await Tag.findByPk(tagId);
      NotifyPendingTicketToUsers(ticket, {
        type: "kanban",
        extra: tagInfo?.name ? { Lane: tagInfo.name } : {}
      }).catch(() => {});
    } catch (_) {}

    return res.status(201).json(ticketTag);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to store ticket tag.' });
  }
};

/*
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;


  try {
    await TicketTag.destroy({ where: { ticketId } });
    return res.status(200).json({ message: 'Ticket tags removed successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove ticket tags.' });
  }
};
*/
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;


  try {
    // Retrieve tagIds associated with the provided ticketId from TicketTags
    const ticketTags = await TicketTag.findAll({ where: { ticketId } });
    const tagIds = ticketTags.map((ticketTag) => ticketTag.tagId);

    // Find the tagIds with kanban = 1 in the Tags table
    const tagsWithKanbanOne = await Tag.findAll({
      where: {
        id: tagIds,
        kanban: 1,
      },
    });

    // Remove the tagIds with kanban = 1 from TicketTags
    const tagIdsWithKanbanOne = tagsWithKanbanOne.map((tag) => tag.id);
    if (tagIdsWithKanbanOne)
      await TicketTag.destroy({ where: { ticketId, tagId: tagIdsWithKanbanOne } });


    const ticket = await ShowTicketService(ticketId, companyId);

    const io = getIO();
    io.of(String(companyId))
      // .to(ticket.status)
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });
    return res.status(200).json({ message: 'Ticket tags removed successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove ticket tags.' });
  }
};