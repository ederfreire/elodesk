import { Op, Transaction } from "sequelize";
import moment from "moment-timezone";
import "moment/locale/pt-br";
import { google } from "googleapis";
import AppointmentBooking from "../../models/AppointmentBooking";
import AppointmentService from "../../models/AppointmentService";
import AppointmentServiceProfessional from "../../models/AppointmentServiceProfessional";
import Company from "../../models/Company";
import Contact from "../../models/Contact";
import GoogleCalendarIntegration from "../../models/GoogleCalendarIntegration";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import CreateCalendarEventService from "../GoogleCalendarService/CreateCalendarEventService";
import getAuthenticatedClient from "../GoogleCalendarService/getAuthenticatedClient";
import logger from "../../utils/logger";

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  domingo: 0,
  monday: 1,
  segunda: 1,
  "segunda-feira": 1,
  tuesday: 2,
  terça: 2,
  "terça-feira": 2,
  wednesday: 3,
  quarta: 3,
  "quarta-feira": 3,
  thursday: 4,
  quinta: 4,
  "quinta-feira": 4,
  friday: 5,
  sexta: 5,
  "sexta-feira": 5,
  saturday: 6,
  sábado: 6
};

interface AvailableSlot {
  startsAt: string;
  endsAt: string;
  label: string;
}

interface SlotsParams {
  companyId: number;
  serviceId: number;
  professionalId: number;
  date?: string;
  days?: number;
  limit?: number;
}

const dateIsValid = (value: string): boolean =>
  moment(value, "YYYY-MM-DD", true).isValid();

const schedulePeriods = (company: Company, weekday: number) => {
  const schedules = Array.isArray(company.schedules) ? company.schedules : [];
  const entry: any = schedules.find((item: any) => {
    const key = String(item?.weekdayEn || item?.weekday || "").trim().toLowerCase();
    return WEEKDAYS[key] === weekday;
  });

  if (!entry) return [];

  return [
    [entry.startTimeA, entry.endTimeA],
    [entry.startTimeB, entry.endTimeB]
  ].filter(([start, end]) => /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end));
};

const listGoogleBusy = async (
  companyId: number,
  start: Date,
  end: Date
): Promise<Array<{ start: number; end: number }>> => {
  const integration = await GoogleCalendarIntegration.findOne({
    where: { companyId, isActive: true, syncEvents: true }
  });
  if (!integration) return [];
  if (!integration.accessToken) {
    throw new AppError("ERR_APPOINTMENT_GOOGLE_CALENDAR_NOT_CONNECTED", 503);
  }

  const { oauth2 } = await getAuthenticatedClient(companyId);
  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  const calendarId = integration.calendarId || "primary";
  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      timeZone: integration.timezone || "America/Sao_Paulo",
      items: [{ id: calendarId }]
    }
  });

  return (data.calendars?.[calendarId]?.busy || [])
    .filter(block => block.start && block.end)
    .map(block => ({
      start: new Date(block.start as string).getTime(),
      end: new Date(block.end as string).getTime()
    }));
};

export const listAvailableSlots = async ({
  companyId,
  serviceId,
  professionalId,
  date,
  days = 14,
  limit = 9
}: SlotsParams): Promise<AvailableSlot[]> => {
  if (!Number.isInteger(Number(serviceId)) || !Number.isInteger(Number(professionalId))) {
    throw new AppError("ERR_APPOINTMENT_INVALID_PARAMS", 400);
  }
  if (date && !dateIsValid(date)) {
    throw new AppError("ERR_APPOINTMENT_INVALID_DATE", 400);
  }

  const [service, professional, company] = await Promise.all([
    AppointmentService.findOne({ where: { id: serviceId, companyId, active: true } }),
    User.findOne({ where: { id: professionalId, companyId } }),
    Company.findByPk(companyId)
  ]);
  if (!service) throw new AppError("ERR_APPOINTMENT_SERVICE_NOT_FOUND", 404);
  if (!professional) throw new AppError("ERR_APPOINTMENT_PROFESSIONAL_NOT_FOUND", 404);
  if (!company) throw new AppError("ERR_COMPANY_NOT_FOUND", 404);
  const serviceProfessional = await AppointmentServiceProfessional.findOne({
    where: { serviceId, professionalId }
  });
  if (!serviceProfessional) {
    throw new AppError("ERR_APPOINTMENT_PROFESSIONAL_NOT_ASSIGNED", 400);
  }

  const timezone = company.timezone || "America/Sao_Paulo";
  const from = date
    ? moment.tz(date, "YYYY-MM-DD", true, timezone).startOf("day")
    : moment.tz(timezone).startOf("day");
  const until = date
    ? from.clone().endOf("day")
    : from.clone().add(Math.min(Math.max(days, 1), 31), "days").endOf("day");
  const busyAppointments = await AppointmentBooking.findAll({
    where: {
      companyId,
      professionalId,
      status: "confirmed",
      startsAt: { [Op.lt]: until.toDate() },
      endsAt: { [Op.gt]: from.toDate() }
    },
    attributes: ["startsAt", "endsAt"]
  });
  const googleBusy = await listGoogleBusy(companyId, from.toDate(), until.toDate());
  const busy = [
    ...busyAppointments.map(item => ({
      start: new Date(item.startsAt).getTime(),
      end: new Date(item.endsAt).getTime()
    })),
    ...googleBusy
  ];

  const durationMinutes = Number(service.durationMinutes);
  const stepMinutes = 15;
  const leadTime = Date.now() + 60 * 60 * 1000;
  const providerStart = professional.startWork || "00:00";
  const providerEnd = professional.endWork || "23:59";
  const slots: AvailableSlot[] = [];

  for (let day = from.clone(); day.isBefore(until) && slots.length < limit; day.add(1, "day")) {
    const periods = schedulePeriods(company, day.day());
    for (const [businessStart, businessEnd] of periods) {
      const startTime = businessStart > providerStart ? businessStart : providerStart;
      const endTime = businessEnd < providerEnd ? businessEnd : providerEnd;
      const periodStart = moment.tz(`${day.format("YYYY-MM-DD")} ${startTime}`, timezone);
      const periodEnd = moment.tz(`${day.format("YYYY-MM-DD")} ${endTime}`, timezone);

      for (
        let candidate = periodStart.clone();
        candidate.isBefore(periodEnd) && slots.length < limit;
        candidate.add(stepMinutes, "minutes")
      ) {
        const startsAt = candidate.valueOf();
        const endsAt = startsAt + durationMinutes * 60_000;
        if (startsAt < leadTime || endsAt > periodEnd.valueOf()) continue;
        if (busy.some(block => startsAt < block.end && endsAt > block.start)) continue;

        slots.push({
          startsAt: candidate.toISOString(),
          endsAt: moment(endsAt).toISOString(),
          label: candidate.clone().locale("pt-br").format("ddd, DD/MM [às] HH:mm")
        });
      }
    }
  }

  return slots;
};

interface CreateBookingParams {
  companyId: number;
  serviceId: number;
  professionalId: number;
  contactId?: number;
  ticketId?: number;
  startsAt: string;
}

export const createBooking = async ({
  companyId,
  serviceId,
  professionalId,
  contactId,
  ticketId,
  startsAt
}: CreateBookingParams) => {
  const start = new Date(startsAt);
  if (!startsAt || Number.isNaN(start.getTime())) {
    throw new AppError("ERR_APPOINTMENT_INVALID_DATE", 400);
  }

  const service = await AppointmentService.findOne({
    where: { id: serviceId, companyId, active: true }
  });
  const professional = await User.findOne({ where: { id: professionalId, companyId } });
  if (!service) throw new AppError("ERR_APPOINTMENT_SERVICE_NOT_FOUND", 404);
  if (!professional) throw new AppError("ERR_APPOINTMENT_PROFESSIONAL_NOT_FOUND", 404);

  if (contactId) {
    const contact = await Contact.findOne({ where: { id: contactId, companyId } });
    if (!contact) throw new AppError("ERR_CONTACT_NOT_FOUND", 404);
  }
  if (ticketId) {
    const ticket = await Ticket.findOne({ where: { id: ticketId, companyId } });
    if (!ticket) throw new AppError("ERR_TICKET_NOT_FOUND", 404);
  }

  const timezone = (await Company.findByPk(companyId))?.timezone || "America/Sao_Paulo";
  const date = moment(start).tz(timezone).format("YYYY-MM-DD");
  const slots = await listAvailableSlots({
    companyId,
    serviceId,
    professionalId,
    date,
    days: 1,
    limit: 500
  });
  const selectedSlot = slots.find(slot => new Date(slot.startsAt).getTime() === start.getTime());
  if (!selectedSlot) throw new AppError("ERR_APPOINTMENT_SLOT_UNAVAILABLE", 409);

  let booking: AppointmentBooking;
  await sequelize.transaction(async (transaction: Transaction) => {
    await Company.findByPk(companyId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    const conflict = await AppointmentBooking.findOne({
      where: {
        companyId,
        professionalId,
        status: "confirmed",
        startsAt: { [Op.lt]: new Date(selectedSlot.endsAt) },
        endsAt: { [Op.gt]: start }
      },
      transaction
    });
    if (conflict) throw new AppError("ERR_APPOINTMENT_SLOT_UNAVAILABLE", 409);

    booking = await AppointmentBooking.create(
      {
        companyId,
        serviceId,
        professionalId,
        contactId: contactId || null,
        ticketId: ticketId || null,
        startsAt: start,
        endsAt: new Date(selectedSlot.endsAt),
        status: "confirmed"
      },
      { transaction }
    );
  });

  let googleSyncError: string | null = null;
  const integration = await GoogleCalendarIntegration.findOne({
    where: { companyId, isActive: true, syncEvents: true }
  });
  if (integration?.accessToken && booking) {
    try {
      const contact = contactId ? await Contact.findByPk(contactId) : null;
      const event = await CreateCalendarEventService({
        companyId,
        summary: `${service.name} — ${contact?.name || "Cliente"} (${professional.name})`,
        description: [
          `Serviço: ${service.name}`,
          `Profissional: ${professional.name}`,
          contact?.number ? `WhatsApp: ${contact.number}` : ""
        ].filter(Boolean).join("\n"),
        startISO: start.toISOString(),
        durationMinutes: Number(service.durationMinutes),
        calendarId: integration.calendarId || undefined,
        timezone,
        sendInvites: false
      });
      await booking.update({
        googleEventId: event.eventId || null,
        googleEventLink: event.htmlLink || null
      });
    } catch (error: any) {
      googleSyncError = error?.message || "Não foi possível sincronizar com o Google Agenda.";
      logger.error(`[APPOINTMENTS] Falha ao sincronizar reserva ${booking.id}: ${googleSyncError}`);
    }
  }

  const result = await AppointmentBooking.findOne({
    where: { id: booking.id, companyId },
    include: [
      { model: AppointmentService, as: "service" },
      { model: User, as: "professional", attributes: ["id", "name"] },
      { model: Contact, as: "contact", attributes: ["id", "name", "number"] }
    ]
  });
  return { booking: result, googleSyncError };
};

export const updateBookingStatus = async (
  companyId: number,
  bookingId: number,
  status: string
) => {
  if (!["confirmed", "cancelled", "completed", "no_show"].includes(status)) {
    throw new AppError("ERR_APPOINTMENT_INVALID_STATUS", 400);
  }
  let booking: AppointmentBooking;
  await sequelize.transaction(async (transaction: Transaction) => {
    await Company.findByPk(companyId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    booking = await AppointmentBooking.findOne({
      where: { id: bookingId, companyId },
      transaction
    });
    if (!booking) throw new AppError("ERR_APPOINTMENT_NOT_FOUND", 404);

    if (status === "confirmed" && booking.status !== "confirmed") {
      const conflict = await AppointmentBooking.findOne({
        where: {
          companyId,
          professionalId: booking.professionalId,
          id: { [Op.ne]: booking.id },
          status: "confirmed",
          startsAt: { [Op.lt]: booking.endsAt },
          endsAt: { [Op.gt]: booking.startsAt }
        },
        transaction
      });
      if (conflict) throw new AppError("ERR_APPOINTMENT_SLOT_UNAVAILABLE", 409);
    }

    await booking.update({ status }, { transaction });
  });
  await booking.reload({
    include: [{ model: AppointmentService, as: "service" }, { model: User, as: "professional" }]
  });

  if (status === "cancelled" && booking.googleEventId) {
    try {
      const { oauth2, integration } = await getAuthenticatedClient(companyId);
      await google.calendar({ version: "v3", auth: oauth2 }).events.delete({
        calendarId: integration?.calendarId || "primary",
        eventId: booking.googleEventId,
        sendUpdates: "none"
      });
      await booking.update({ googleEventId: null, googleEventLink: null });
    } catch (error: any) {
      const code = error?.response?.status || error?.code;
      if (code !== 404 && code !== 410) {
        logger.error(`[APPOINTMENTS] Falha ao remover evento da reserva ${booking.id}: ${error?.message}`);
        throw new AppError("ERR_APPOINTMENT_GOOGLE_CANCEL_FAILED", 502);
      }
    }
    await booking.update({ googleEventId: null, googleEventLink: null });
  }
  return booking;
};
