import TicketNote from "../../models/TicketNote";
import User from "../../models/User";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";

interface Params {
  contactId: number | string;
  ticketId?: number | string;
  companyId?: number;
}

/**
 * Observações de um contato.
 *
 * O `ticketId` é OPCIONAL de propósito. Antes ele era obrigatório na consulta,
 * e o efeito era confuso: a observação é do CONTATO, mas só aparecia enquanto
 * se estava dentro do mesmo atendimento em que foi escrita. Abrir o contato
 * por outro caminho — pelo card do Kanban, por um atendimento novo — mostrava
 * a lista vazia, como se a anotação tivesse sumido.
 *
 * Sem `ticketId`, devolve o histórico completo daquele contato, que é o que a
 * tela de observações do contato quer mostrar.
 */
const FindNotesByContactIdAndTicketId = async ({
  contactId,
  ticketId,
  companyId
}: Params): Promise<TicketNote[]> => {
  const where: any = { contactId };

  // Só restringe por atendimento quando ele foi realmente informado. String
  // vazia e "undefined" (que chegam assim pela query string) contam como
  // ausência — antes viravam filtro literal e não casavam com nada.
  const atendimento = String(ticketId ?? "").trim();
  if (atendimento && atendimento !== "undefined" && atendimento !== "null") {
    where.ticketId = atendimento;
  }

  const notes: TicketNote[] = await TicketNote.findAll({
    where,
    include: [
      { model: User, as: "user", attributes: ["id", "name", "email"] },
      { model: Contact, as: "contact", attributes: ["id", "name"] },
      {
        model: Ticket,
        as: "ticket",
        attributes: ["id", "status", "createdAt"],
        // A observação não tem empresa própria: ela herda a do atendimento.
        // Filtrar aqui impede que uma empresa leia anotação de outra.
        ...(companyId ? { where: { companyId } } : {}),
        // required:false para que uma anotação cujo atendimento foi apagado
        // continue aparecendo, em vez de sumir junto.
        required: !!companyId
      }
    ],
    order: [["createdAt", "DESC"]]
  });

  return notes;
};

export default FindNotesByContactIdAndTicketId;
