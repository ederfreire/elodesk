import { Op } from "sequelize";
import { getIO } from "../../libs/socket";
import { sendPushToUser, sendPushToCompanyUsers } from "../PushNotificationService";
import Contact from "../../models/Contact";
import UserQueue from "../../models/UserQueue";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import IdentifyUtmFromMessage from "../UtmService/IdentifyUtmFromMessage";
import AutoReactToMessage from "../WbotServices/AutoReactToMessage";
import RunSalesAgentService from "../SalesAgentService/RunSalesAgentService";
import logger from "../../utils/logger";

export interface MessageData {
  wid: string;
  ticketId: number;
  body: string;
  contactId?: number;
  fromMe?: boolean;
  read?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  ack?: number;
  queueId?: number;
  userId?: number;
  channel?: string;
  ticketTrakingId?: number;
  isPrivate?: boolean;
  ticketImported?: any;
  isForwarded?: boolean;
  quotedMsgId?: string | number | null;
}
interface Request {
  messageData: MessageData;
  companyId: number;
}

const CreateMessageService = async ({
  messageData,
  companyId
}: Request): Promise<Message> => {
  
  const correctMediaType = (data: MessageData): MessageData => {
    // Se já tem mediaType definido como audio, manter
    if (data.mediaType === 'audio') {
      return data;
    }

    // Verificar se deveria ser áudio baseado na URL ou outros indicadores
    const shouldBeAudio = (data: MessageData): boolean => {
      // Verificar pela URL
      if (data.mediaUrl) {
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac'];
        const url = data.mediaUrl.toLowerCase();
        if (audioExtensions.some(ext => url.includes(ext))) {
          return true;
        }
        
        // Verificar se tem padrão de nome de áudio
        if (url.includes('audio_')) {
          return true;
        }
      }

      // Verificar pelo body
      if (data.body && typeof data.body === 'string') {
        const body = data.body.toLowerCase();
        if (body.includes('áudio gravado') || body.includes('🎵 arquivo de áudio')) {
          return true;
        }
      }

      return false;
    };

    // Se deveria ser áudio, corrigir o tipo
    if (shouldBeAudio(data)) {
      return {
        ...data,
        mediaType: 'audio'
      };
    }

    return data;
  };

  const correctedMessageData = correctMediaType(messageData);

  // Se for mensagem enviada pelo sistema (fromMe) e não veio userId explícito,
  // usa o atendente atualmente vinculado ao ticket para atribuir autoria.
  if (correctedMessageData.fromMe && !correctedMessageData.userId) {
    try {
      const t = await Ticket.findByPk(correctedMessageData.ticketId, { attributes: ["id", "userId"] });
      if (t?.userId) {
        correctedMessageData.userId = t.userId;
      }
    } catch {}
  }

  await Message.upsert({ ...correctedMessageData, companyId });


  // Incrementar contadores de mensagens enviadas/recebidas na conexão
  try {
    const ticket = await Ticket.findByPk(correctedMessageData.ticketId);
    if (ticket?.whatsappId) {
      const field = correctedMessageData.fromMe ? 'sentMessages' : 'receivedMessages';
      await Whatsapp.increment(field, { where: { id: ticket.whatsappId } });
    }
  } catch (err) {
    console.warn('Erro ao incrementar contador de mensagens:', err);
  }

  const message = await Message.findOne({
    where: {
      wid: correctedMessageData.wid,
      companyId
    },
    include: [
      "contact",
      {
        model: Ticket,
        as: "ticket",
        include: [
          {
            model: Contact,
            attributes: ["id", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "urlPicture", "companyId", "isGroup", "remoteJid"],
            include: ["extraInfo", "tags"]
          },
          {
            model: Queue,
            attributes: ["id", "name", "color"]
          },
          {
            model: Whatsapp,
            attributes: ["id", "name", "groupAsTicket", "color"]
          },
          {
            model: User,
            attributes: ["id", "name"]
          },
          {
            model: Tag,
            as: "tags",
            attributes: ["id", "name", "color"]
          }
        ]
      },
      {
        model: Message,
        as: "quotedMsg",
        include: ["contact"]
      }
    ]
  });

  if (message.ticket.queueId !== null && message.queueId === null) {
    await message.update({ queueId: message.ticket.queueId });
  }

  if (message.isPrivate) {
    await message.update({ wid: `PVT${message.id}` });
  }

  if (!message) {
    throw new Error("ERR_CREATING_MESSAGE");
  }

  const io = getIO();

  if (!messageData?.ticketImported) {
    // Garantir que o ticket tenha lastMessage atualizado
    if (message.ticket && messageData.body && !message.ticket.lastMessage) {
      message.ticket.lastMessage = messageData.body;
    }

    io.of(String(companyId))
      .emit(`company-${companyId}-appMessage`, {
        action: "create",
        message,
        ticket: message.ticket,
        contact: message.ticket.contact
      });

    // Enviar push notification (não-bloqueante)
    if (!message.fromMe) {
      const contactName = message.ticket?.contact?.name || "Contato";

      // Corpo da notificação.
      //
      // O texto da mensagem só existe quando o cliente manda texto. Foto,
      // áudio, vídeo e documento chegam com body vazio (a legenda, quando
      // tem, vem no body; sem legenda fica em branco). Antes isso caía num
      // "Nova mensagem" genérico, e o atendente não sabia se valia a pena
      // abrir — pior ainda para áudio, que costuma ser urgente.
      //
      // Agora, sem texto, mostra o tipo do anexo. Com legenda, mostra a
      // legenda, que é mais informativa que o rótulo.
      const rotulosPorTipo = {
        image: "📷 Foto",
        video: "🎥 Vídeo",
        audio: "🎵 Áudio",
        document: "📄 Documento",
        application: "📄 Documento",
        sticker: "🙂 Figurinha",
        contactMessage: "📇 Contato",
        locationMessage: "📍 Localização"
      };

      const textoDaMensagem = String(message.body || "").trim();
      const corpoDaNotificacao =
        textoDaMensagem.substring(0, 100) ||
        rotulosPorTipo[message.mediaType] ||
        (message.mediaUrl ? "📎 Anexo" : "Nova mensagem");

      const pushPayload = {
        title: `💬 ${contactName}`,
        body: corpoDaNotificacao,
        icon: message.ticket?.contact?.urlPicture || "/icon-192x192.png",
        tag: `ticket-${message.ticket.id}`,
        url: `/tickets/${message.ticket.uuid}`,
        ticketId: message.ticket.id
      };

      // Atribuicao de campanha: a primeira mensagem do lead carrega o
      // codigo [EQ:XXXX] da mensagem pre-preenchida do wa.me. Fica aqui, e
      // nao no listener de um canal especifico, porque TODO canal passa por
      // este servico ao salvar mensagem recebida.
      // Agente Comercial: avalia a conversa e qualifica quando houver
      // material suficiente. O proprio servico decide se vale rodar — nao
      // executa a cada mensagem.
      if (!message.fromMe && message.ticket) {
        RunSalesAgentService(message.ticket, companyId).catch(err => {
          // Antes o erro sumia: se o agente falhasse (chave da IA, etiqueta
          // inexistente, etc.), nada aparecia e parecia que "não funciona".
          logger.warn(`[SalesAgent] Falha ao avaliar o ticket ${message.ticket?.id}: ${err?.message || err}`);
        });
      }

      // Auto-reacao: avisa o cliente que a mensagem chegou. Fica aqui, junto
      // da atribuicao de UTM, porque este servico e o ponto por onde TODA
      // mensagem recebida passa, independente do canal.
      if (!message.fromMe && message.ticket) {
        AutoReactToMessage(message, message.ticket, companyId).catch(() => {});
      }

      if (!message.fromMe && message.ticket?.contactId) {
        IdentifyUtmFromMessage(
          message.body || "",
          message.ticket.contactId,
          companyId
        ).catch(() => {});
      }

      if (message.ticket?.userId) {
        // Ticket com atendente: push só para o atendente
        sendPushToUser(message.ticket.userId, companyId, pushPayload).catch(() => {});
      } else if (message.ticket?.queueId) {
        // Ticket sem atendente mas com fila: push para todos os usuários da fila
        UserQueue.findAll({ where: { queueId: message.ticket.queueId }, attributes: ["userId"] })
          .then(userQueues => {
            const userIds = userQueues.map(uq => uq.userId);
            if (userIds.length > 0) {
              sendPushToCompanyUsers(companyId, userIds, pushPayload).catch(() => {});
            }
          })
          .catch(() => {});
      } else {
        // Ticket SEM atendente e SEM fila. Antes esse caso caía no vazio e
        // nenhum push era enviado — e é justamente aqui que moram as duas
        // reclamações: mensagem de GRUPO (grupo não entra em fila) e ticket
        // "Aguardando" que chegou sem roteamento ("Sem Fila"). Ou seja, quem
        // mais precisa de aviso era exatamente quem nunca recebia.
        //
        // Agora avisa quem tem permissão de enxergar esse ticket:
        //   - grupo  -> usuários com allowGroup
        //   - resto  -> usuários com allTicket (ver tickets sem fila)
        const ehGrupo = !!message.ticket?.isGroup || !!message.ticket?.contact?.isGroup;

        User.findAll({
          where: ehGrupo
            ? { companyId, allowGroup: true }
            : { companyId, allTicket: { [Op.in]: ["enable", "enabled"] } },
          attributes: ["id"]
        })
          .then(users => {
            const userIds = users.map(u => u.id);
            if (userIds.length > 0) {
              sendPushToCompanyUsers(companyId, userIds, pushPayload).catch(() => {});
            }
          })
          .catch(() => {});
      }
    }
  }

  return message;
};

export default CreateMessageService;
