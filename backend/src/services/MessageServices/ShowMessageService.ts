import sequelize from "../../database";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";

const ShowMessageService = async (messageId: string) => {
  // O id vem do corpo da requisição (MessageController.edit -> req.body.messageId).
  // Concatenar esse valor direto na consulta permitia fechar a string e injetar
  // SQL: qualquer usuário autenticado, de QUALQUER empresa, alcançaria dados de
  // outras. Com `replacements` o driver envia o valor como parâmetro e ele
  // nunca é interpretado como comando.
  const message = await sequelize.query(`select * from "Messages" where id = :messageId`, {
    replacements: { messageId },
    model: Message,
    mapToModel: true
  });
  if (message.length > 0) {
    return message[0] as unknown as Message;
  }
  return undefined;
}

export const GetWhatsAppFromMessage = async (message: Message): Promise<number | null> => {
  const ticketId = message.ticketId;
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    return null;
  }
  return ticket.whatsappId;
}


export default ShowMessageService;
