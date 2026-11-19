import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import Contact from "../../models/Contact";
import User from "../../models/User";
import { sincronizarEventoDoAgendamento } from "../GoogleCalendarService/SyncScheduleEventService";
import { enviarConfirmacaoDoAgendamento } from "./AppointmentMessage";


interface Request {
  body: string;
  sendAt: string;
  contactId: number | string;
  companyId: number | string;
  userId?: number | string;
  ticketUserId?: number | string;
  queueId?: number | string;
  openTicket?: string;
  statusTicket?: string;
  whatsappId?: number | string;
  intervalo?: number;
  valorIntervalo?: number;
  enviarQuantasVezes?: number;
  tipoDias?: number;
  contadorEnvio?: number;
  assinar?: boolean;
  // ✅ Campos de lembrete
  reminderDate?: string;
  // Integração com o Google Agenda & Meet (escolha feita no modal)
  googleSync?: boolean;
  googleMeet?: boolean;
  googleEventTitle?: string;
  googleEventDuration?: number;
}

const CreateService = async ({
  body,
  sendAt,
  contactId,
  companyId,
  userId,
  ticketUserId,
  queueId,
  openTicket,
  statusTicket,
  whatsappId,
  intervalo,
  valorIntervalo,
  enviarQuantasVezes,
  tipoDias,
  assinar,
  contadorEnvio,
  // ✅ Campos de lembrete
  reminderDate,
  googleSync,
  googleMeet,
  googleEventTitle,
  googleEventDuration
}: Request): Promise<Schedule> => {
  const schema = Yup.object().shape({
    body: Yup.string().required().min(5),
    sendAt: Yup.string().required()
  });

  try {
    await schema.validate({ body, sendAt });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const schedule = await Schedule.create(
    {
      body,
      sendAt,
      contactId,
      companyId,
      userId,
      // ✅ Se tem lembrete, não marcar como PENDENTE para não ser processado no horário original
      status: reminderDate ? 'AGUARDANDO_LEMBRETE' : 'PENDENTE',
      ticketUserId,
      queueId,
      openTicket,
      statusTicket,
      whatsappId,
      intervalo,
      valorIntervalo,
      enviarQuantasVezes,
      tipoDias,
      assinar,
      contadorEnvio,
      // ✅ Incluir campos de lembrete
      reminderDate: reminderDate || null,
      reminderMessage: null, // Não usar mais o campo reminderMessage
      reminderStatus: reminderDate ? 'PENDENTE' : null,
      googleSync: !!googleSync,
      googleMeet: !!googleMeet,
      googleEventTitle: googleEventTitle || null,
      googleEventDuration: googleEventDuration || null
    }
  );

  await schedule.reload();

  // ── Google Agenda & Meet ────────────────────────────────────────────────
  //
  // Recarrega com contato e atendente para a descrição do evento sair
  // completa (nome, telefone, atendente) e cria o evento.
  //
  // NÃO usa try/catch aqui de propósito: o próprio serviço já engole a falha
  // e devolve `erro` em vez de lançar. Um Google fora do ar não pode impedir
  // o agendamento de existir — a mensagem é o que o cliente contratou.
  if (googleSync) {
    const comRelacoes = await Schedule.findByPk(schedule.id, {
      include: [
        { model: Contact, as: "contact" },
        { model: User, as: "user" }
      ]
    });

    if (comRelacoes) {
      const r = await sincronizarEventoDoAgendamento(comRelacoes);
      if (r.googleEventId) {
        await schedule.update({
          googleEventId: r.googleEventId,
          googleMeetLink: r.googleMeetLink || null,
          googleEventLink: r.googleEventLink || null
        });
        await schedule.reload();
      }
    }
  }

  // Confirmação imediata para o contato vinculado: data, hora, duração e link
  // do Meet. É o que o operador espera ao terminar o agendamento — sem isso o
  // cliente só saberia da reunião no horário do disparo programado.
  if (schedule.googleSync || schedule.googleMeetLink) {
    const comContato = await Schedule.findByPk(schedule.id, {
      include: [{ model: Contact, as: "contact" }]
    });
    if (comContato) {
      await enviarConfirmacaoDoAgendamento(comContato);
    }
  }

  return schedule;
};


export default CreateService;
