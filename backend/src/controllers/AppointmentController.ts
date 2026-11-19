import { Request, Response } from "express";
import { Op, Transaction } from "sequelize";
import sequelize from "../database";
import AppointmentBooking from "../models/AppointmentBooking";
import AppointmentService from "../models/AppointmentService";
import AppointmentServiceProfessional from "../models/AppointmentServiceProfessional";
import Contact from "../models/Contact";
import User from "../models/User";
import AppError from "../errors/AppError";
import {
  createBooking,
  listAvailableSlots,
  updateBookingStatus
} from "../services/AppointmentService/BookingService";

interface AppointmentServiceResponse extends Record<string, unknown> {
  professionalIds: number[];
}

const parseProfessionalIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    throw new AppError("ERR_APPOINTMENT_PROFESSIONALS_INVALID", 400);
  }
  const ids = value.map(Number);
  if (ids.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new AppError("ERR_APPOINTMENT_PROFESSIONALS_INVALID", 400);
  }
  return Array.from(new Set(ids));
};

const validateProfessionalIds = async (
  professionalIds: number[],
  companyId: number
): Promise<void> => {
  if (professionalIds.length === 0) return;
  const users = await User.findAll({
    where: { companyId, id: professionalIds },
    attributes: ["id"]
  });
  if (users.length !== professionalIds.length) {
    throw new AppError("ERR_APPOINTMENT_PROFESSIONALS_INVALID", 400);
  }
};

const replaceServiceProfessionals = async (
  serviceId: number,
  professionalIds: number[],
  transaction: Transaction
): Promise<void> => {
  await AppointmentServiceProfessional.destroy({
    where: { serviceId },
    transaction
  });
  if (professionalIds.length > 0) {
    await AppointmentServiceProfessional.bulkCreate(
      professionalIds.map(professionalId => ({ serviceId, professionalId })),
      { transaction }
    );
  }
};

const addProfessionalIds = async (
  serviceRows: AppointmentService[]
): Promise<AppointmentServiceResponse[]> => {
  if (serviceRows.length === 0) return [];
  const assignments = await AppointmentServiceProfessional.findAll({
    where: { serviceId: serviceRows.map(service => service.id) },
    attributes: ["serviceId", "professionalId"]
  });
  const idsByService = new Map<number, number[]>();
  assignments.forEach(assignment => {
    const ids = idsByService.get(assignment.serviceId) || [];
    ids.push(assignment.professionalId);
    idsByService.set(assignment.serviceId, ids);
  });
  return serviceRows.map(service => ({
    ...service.toJSON(),
    professionalIds: idsByService.get(service.id) || []
  }));
};

export const services = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const rows = await AppointmentService.findAll({
    where: { companyId },
    order: [["active", "DESC"], ["name", "ASC"]]
  });
  return res.json(await addProfessionalIds(rows));
};

export const createService = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const {
    name,
    description,
    durationMinutes,
    price,
    active,
    professionalIds = []
  } = req.body || {};
  if (active !== undefined && typeof active !== "boolean") {
    throw new AppError("ERR_APPOINTMENT_SERVICE_ACTIVE_INVALID", 400);
  }
  const parsedProfessionalIds = parseProfessionalIds(professionalIds);
  await validateProfessionalIds(parsedProfessionalIds, companyId);
  const duration = Number(durationMinutes);

  if (!String(name || "").trim()) throw new AppError("ERR_APPOINTMENT_SERVICE_NAME_REQUIRED", 400);
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    throw new AppError("ERR_APPOINTMENT_SERVICE_DURATION_INVALID", 400);
  }
  const parsedPrice = price === "" || price === null || price === undefined ? null : Number(price);
  if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
    throw new AppError("ERR_APPOINTMENT_SERVICE_PRICE_INVALID", 400);
  }
  const service = await sequelize.transaction(async transaction => {
    const created = await AppointmentService.create({
      companyId,
      name: String(name).trim(),
      description: description ? String(description).trim() : "",
      durationMinutes: duration,
      price: parsedPrice,
      active: active !== false
    }, { transaction });
    await replaceServiceProfessionals(created.id, parsedProfessionalIds, transaction);
    return created;
  });
  return res.status(201).json({
    ...service.toJSON(),
    professionalIds: parsedProfessionalIds
  });
};

export const updateService = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const service = await AppointmentService.findOne({
    where: { id: req.params.serviceId, companyId }
  });
  if (!service) throw new AppError("ERR_APPOINTMENT_SERVICE_NOT_FOUND", 404);

  const { name, description, durationMinutes, price, active, professionalIds } = req.body || {};
  const hasProfessionalIds = Object.prototype.hasOwnProperty.call(req.body || {}, "professionalIds");
  const parsedProfessionalIds = hasProfessionalIds
    ? parseProfessionalIds(professionalIds)
    : undefined;
  if (parsedProfessionalIds) {
    await validateProfessionalIds(parsedProfessionalIds, companyId);
  }
  const updates: Partial<AppointmentService> = {};
  if (name !== undefined) {
    if (!String(name).trim()) throw new AppError("ERR_APPOINTMENT_SERVICE_NAME_REQUIRED", 400);
    updates.name = String(name).trim();
  }
  if (description !== undefined) updates.description = String(description).trim();
  if (durationMinutes !== undefined) {
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
      throw new AppError("ERR_APPOINTMENT_SERVICE_DURATION_INVALID", 400);
    }
    updates.durationMinutes = duration;
  }
  if (price !== undefined) {
    const parsedPrice = price === "" || price === null ? null : Number(price);
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      throw new AppError("ERR_APPOINTMENT_SERVICE_PRICE_INVALID", 400);
    }
    updates.price = parsedPrice;
  }
  if (active !== undefined) {
    if (typeof active !== "boolean") throw new AppError("ERR_APPOINTMENT_SERVICE_ACTIVE_INVALID", 400);
    updates.active = active;
  }

  await sequelize.transaction(async transaction => {
    if (Object.keys(updates).length > 0) {
      await service.update(updates, { transaction });
    }
    if (parsedProfessionalIds) {
      await replaceServiceProfessionals(service.id, parsedProfessionalIds, transaction);
    }
  });
  return res.json((await addProfessionalIds([service]))[0]);
};

export const removeService = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const service = await AppointmentService.findOne({
    where: { id: req.params.serviceId, companyId }
  });
  if (!service) throw new AppError("ERR_APPOINTMENT_SERVICE_NOT_FOUND", 404);
  await service.update({ active: false });
  return res.json(service);
};

export const professionals = async (req: Request, res: Response): Promise<Response> => {
  const users = await User.findAll({
    where: { companyId: req.user.companyId },
    attributes: ["id", "name", "startWork", "endWork"],
    order: [["name", "ASC"]]
  });
  return res.json(users);
};

export const slots = async (req: Request, res: Response): Promise<Response> => {
  const { serviceId, professionalId, date } = req.query as any;
  const result = await listAvailableSlots({
    companyId: req.user.companyId,
    serviceId: Number(serviceId),
    professionalId: Number(professionalId),
    date: date ? String(date) : undefined
  });
  return res.json(result);
};

export const create = async (req: Request, res: Response): Promise<Response> => {
  const { serviceId, professionalId, contactId, ticketId, startsAt } = req.body || {};
  const result = await createBooking({
    companyId: req.user.companyId,
    serviceId: Number(serviceId),
    professionalId: Number(professionalId),
    contactId: contactId ? Number(contactId) : undefined,
    ticketId: ticketId ? Number(ticketId) : undefined,
    startsAt
  });
  return res.status(201).json(result);
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { startDate, endDate, status } = req.query as any;
  const where: any = { companyId };
  if (status) where.status = status;
  if (startDate || endDate) {
    where.startsAt = {};
    if (startDate) {
      const start = new Date(startDate);
      if (Number.isNaN(start.getTime())) throw new AppError("ERR_APPOINTMENT_INVALID_DATE", 400);
      where.startsAt[Op.gte] = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      if (Number.isNaN(end.getTime())) throw new AppError("ERR_APPOINTMENT_INVALID_DATE", 400);
      where.startsAt[Op.lt] = end;
    }
  }

  const rows = await AppointmentBooking.findAll({
    where,
    include: [
      { model: AppointmentService, as: "service" },
      { model: User, as: "professional", attributes: ["id", "name"] },
      { model: Contact, as: "contact", attributes: ["id", "name", "number"] }
    ],
    order: [["startsAt", "ASC"]],
    limit: 500
  });
  return res.json(rows);
};

export const updateStatus = async (req: Request, res: Response): Promise<Response> => {
  const booking = await updateBookingStatus(
    req.user.companyId,
    Number(req.params.bookingId),
    String(req.body?.status || "")
  );
  return res.json(booking);
};

