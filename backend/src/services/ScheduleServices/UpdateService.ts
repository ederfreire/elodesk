import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import Contact from "../../models/Contact";
import User from "../../models/User";
import { sincronizarEventoDoAgendamento } from "../GoogleCalendarService/SyncScheduleEventService";
import ShowService from "./ShowService";

interface ScheduleData {
  id?: number;
  body?: string;
  sendAt?: string;
  sentAt?: string;
  contactId?: number;
  companyId?: number;
  ticketId?: number;
  userId?: number;
  ticketUserId?: number | string;
  queueId?: number | string;
  openTicket?: string;
  statusTicket?: string;
  whatsappId?: number | string;
  intervalo?: number;
  valorIntervalo?: number;
  enviarQuantasVezes?: number;
  tipoDias?: number;
  assinar?: boolean;
  // ✅ Campos de lembrete
  reminderDate?: string;
  // Integração Google Agenda & Meet. Opcionais de propósito: quando o campo
  // não vem no payload, o UpdateService preserva o valor que já estava
  // gravado em vez de desligar a sincronização sem querer.
  googleSync?: boolean;
  googleMeet?: boolean;
  googleEventTitle?: string;
  googleEventDuration?: number;
}

interface Request {
  scheduleData: ScheduleData;
  id: string | number;
  companyId: number;
}

const UpdateUserService = async ({
  scheduleData,
  id,
  companyId
}: Request): Promise<Schedule | undefined> => {
  const schedule = await ShowService(id, companyId);

  if (schedule?.companyId !== companyId) {
    throw new AppError("Não é possível alterar registros de outra empresa");
  }

  const schema = Yup.object().shape({
    body: Yup.string().min(5)
  });

  const {
    body,
    sendAt,
    sentAt,
    contactId,
    ticketId,
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
    // ✅ Campos de lembrete
    reminderDate,
    googleSync,
    googleMeet,
    googleEventTitle,
    googleEventDuration
  } = scheduleData;

  try {
    await schema.validate({ body });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  await schedule.update({
    body,
    sendAt,
    sentAt,
    contactId,
    ticketId,
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
    // ✅ Se tem lembrete, não marcar como PENDENTE para não ser processado no horário original
    status: reminderDate ? 'AGUARDANDO_LEMBRETE' : 'PENDENTE',
    // ✅ Incluir campos de lembrete
    reminderDate: reminderDate || null,
    reminderMessage: null, // Não usar mais o campo reminderMessage
    reminderStatus: reminderDate ? 'PENDENTE' : null,
    googleSync: googleSync === undefined ? schedule.googleSync : !!googleSync,
    googleMeet: googleMeet === undefined ? schedule.googleMeet : !!googleMeet,
    googleEventTitle:
      googleEventTitle === undefined ? schedule.googleEventTitle : googleEventTitle || null,
    googleEventDuration:
      googleEventDuration === undefined
        ? schedule.googleEventDuration
        : googleEventDuration || null
  });

  await schedule.reload();

  // ── Google Agenda & Meet ────────────────────────────────────────────────
  //
  // Sincroniza SEMPRE que já existe um evento ou que a opção está ligada:
  //   - mudou data/hora/título   -> o serviço faz PATCH no evento existente
  //   - desligou a sincronização -> o serviço APAGA o evento (senão ficaria
  //     um compromisso fantasma na agenda do profissional)
  //   - ligou agora              -> cria o evento
  //
  // Falha do Google não derruba a atualização do agendamento — o serviço
  // devolve `erro` em vez de lançar.
  if (schedule.googleSync || schedule.googleEventId) {
    const comRelacoes = await Schedule.findByPk(schedule.id, {
      include: [
        { model: Contact, as: "contact" },
        { model: User, as: "user" }
      ]
    });

    if (comRelacoes) {
      const r = await sincronizarEventoDoAgendamento(comRelacoes);
      if (!r.erro) {
        await schedule.update({
          googleEventId: r.googleEventId ?? null,
          googleMeetLink: r.googleMeetLink ?? null,
          googleEventLink: r.googleEventLink ?? null
        });
        await schedule.reload();
      }
    }
  }

  return schedule;
};

export default UpdateUserService;
