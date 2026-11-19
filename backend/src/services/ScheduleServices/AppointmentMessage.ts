import Schedule from "../../models/Schedule";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { SendMessage } from "../../helpers/SendMessage";
import ShowTicketService from "../TicketServices/ShowTicketService";
import { verifyMessage } from "../WbotServices/wbotMessageListener";
import logger from "../../utils/logger";


/**
 * Dados do compromisso (data, hora, duração e link do Meet) que o contato
 * precisa receber.
 *
 * O operador escreve a mensagem que quiser; estes dados são a parte que ele
 * não deveria ter que digitar — e que sempre esquecia, deixando o cliente sem
 * o link da reunião.
 */

const TZ = "America/Sao_Paulo";

const partes = (sendAt: any) => {
  const d = new Date(sendAt);
  if (Number.isNaN(d.getTime())) return { data: "", hora: "" };
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...opts }).format(d);
  return {
    data: fmt({ day: "2-digit", month: "2-digit", year: "numeric" }),
    hora: fmt({ hour: "2-digit", minute: "2-digit", hour12: false })
  };
};

export const dadosDoAgendamento = (schedule: Schedule) => {
  const { data, hora } = partes(schedule?.sendAt);
  return {
    data,
    hora,
    titulo: (schedule as any)?.googleEventTitle || "",
    duracao: (schedule as any)?.googleEventDuration || null,
    meet: (schedule as any)?.googleMeetLink || "",
    evento: (schedule as any)?.googleEventLink || ""
  };
};

/**
 * Bloco de texto com os dados do compromisso, pronto para anexar à mensagem.
 */
export const blocoDoAgendamento = (schedule: Schedule): string => {
  const d = dadosDoAgendamento(schedule);
  if (!d.data && !d.meet) return "";

  const linhas: string[] = [];
  if (d.titulo) linhas.push(`*${d.titulo}*`);
  if (d.data) linhas.push(`📅 Data: ${d.data}`);
  if (d.hora) linhas.push(`⏰ Horário: ${d.hora}`);
  if (d.duracao) linhas.push(`⏳ Duração: ${d.duracao} min`);
  if (d.meet) linhas.push(`🔗 Google Meet: ${d.meet}`);

  return linhas.join("\n");
};

/**
 * Aplica os dados do compromisso ao texto do operador.
 *
 * Se ele usou as variáveis, cada uma é substituída no lugar onde está — assim
 * dá pra escrever "te espero dia {{data}} às {{hora}}". Se não usou nenhuma,
 * o bloco vai anexado ao final, que é o comportamento esperado por quem só
 * escreveu a mensagem e marcou "gerar Meet".
 */
export const aplicarDadosAgendamento = (
  texto: string,
  schedule: Schedule
): string => {
  const base = String(texto ?? "");
  const d = dadosDoAgendamento(schedule);

  const temVariavel = /\{\{\s*(meet|data|hora|duracao|evento)\s*\}\}/i.test(base);

  const substituido = base
    .replace(/\{\{\s*meet\s*\}\}/gi, d.meet)
    .replace(/\{\{\s*data\s*\}\}/gi, d.data)
    .replace(/\{\{\s*hora\s*\}\}/gi, d.hora)
    .replace(/\{\{\s*duracao\s*\}\}/gi, d.duracao ? `${d.duracao} min` : "")
    .replace(/\{\{\s*evento\s*\}\}/gi, d.evento);

  if (temVariavel) return substituido;

  const bloco = blocoDoAgendamento(schedule);
  if (!bloco) return substituido;

  return `${substituido.trim()}\n\n${bloco}`;
};

/**
 * Envia AGORA, ao contato vinculado, a confirmação com os dados do
 * compromisso. Usado no momento em que o agendamento é salvo: o cliente
 * recebe o link do Meet imediatamente, sem esperar o horário do disparo.
 *
 * Nunca lança: uma conexão fora do ar não pode desfazer o agendamento.
 */
export const enviarConfirmacaoDoAgendamento = async (
  schedule: Schedule
): Promise<{ enviado: boolean; erro?: string }> => {
  try {
    const bloco = blocoDoAgendamento(schedule);
    if (!bloco) return { enviado: false, erro: "sem dados de agendamento" };

    const contact =
      (schedule as any).contact ||
      (schedule.contactId ? await Contact.findByPk(schedule.contactId) : null);

    if (!contact?.number) return { enviado: false, erro: "contato sem número" };

    let whatsapp: Whatsapp | null = null;
    if (schedule.whatsappId) {
      whatsapp = await Whatsapp.findByPk(schedule.whatsappId);
    }
    if (!whatsapp) whatsapp = await GetDefaultWhatsApp(schedule.companyId);
    if (!whatsapp) return { enviado: false, erro: "nenhuma conexão disponível" };

    const corpo = `✅ Agendamento confirmado!\n\n${bloco}`;

    // A confirmação precisa existir DENTRO do atendimento, não só no
    // aparelho do cliente: antes ela era enviada solta pelo SendMessage e
    // nenhuma Message era gravada, então o operador via a conversa vazia
    // ("chegou no WhatsApp mas não aparece na plataforma").
    let ticket = await Ticket.findOne({
      where: {
        contactId: contact.id,
        companyId: schedule.companyId,
        whatsappId: whatsapp.id,
        status: ["open", "pending"]
      }
    });

    if (!ticket) {
      ticket = await Ticket.create({
        companyId: schedule.companyId,
        contactId: contact.id,
        whatsappId: whatsapp.id,
        queueId: (schedule as any).queueId || null,
        userId: (schedule as any).ticketUserId || (schedule as any).userId || null,
        status: "pending",
        isGroup: !!contact.isGroup
      } as any);
    }

    const ticketCompleto = await ShowTicketService(ticket.id, schedule.companyId);

    const sentMessage = await SendMessage(
      whatsapp,
      {
        number: contact.number,
        body: corpo,
        companyId: schedule.companyId
      },
      contact.isGroup
    );

    // Canais wacalls e whatsapp_oficial já gravam a Message e emitem o
    // socket dentro dos próprios services — repetir aqui quebraria, porque
    // o retorno é uma instância Sequelize sem a `key` do proto do Baileys.
    const isBaileys =
      whatsapp.channel !== "wacalls" && whatsapp.channel !== "whatsapp_oficial";

    if (isBaileys && sentMessage) {
      try {
        await verifyMessage(
          sentMessage as any,
          ticketCompleto,
          ticketCompleto.contact,
          null,
          true,
          false
        );
      } catch (err: any) {
        logger.warn(
          `[Agendamento] confirmação enviada, mas não foi possível registrar na conversa: ${err.message}`
        );
      }
    }

    return { enviado: true };

  } catch (err: any) {
    logger.error(
      `[Agendamento] falha ao enviar confirmação do agendamento ${schedule?.id}: ${err.message}`
    );
    return { enviado: false, erro: err.message };
  }
};
