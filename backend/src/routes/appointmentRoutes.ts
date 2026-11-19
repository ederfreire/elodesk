import express from "express";
import isAuth from "../middleware/isAuth";
import * as AppointmentController from "../controllers/AppointmentController";

const appointmentRoutes = express.Router();

appointmentRoutes.get("/appointment-services", isAuth, AppointmentController.services);
appointmentRoutes.post("/appointment-services", isAuth, AppointmentController.createService);
appointmentRoutes.put("/appointment-services/:serviceId", isAuth, AppointmentController.updateService);
appointmentRoutes.delete("/appointment-services/:serviceId", isAuth, AppointmentController.removeService);
appointmentRoutes.get("/appointment-professionals", isAuth, AppointmentController.professionals);
appointmentRoutes.get("/appointment-slots", isAuth, AppointmentController.slots);
appointmentRoutes.get("/appointments", isAuth, AppointmentController.index);
appointmentRoutes.post("/appointments", isAuth, AppointmentController.create);
appointmentRoutes.put("/appointments/:bookingId/status", isAuth, AppointmentController.updateStatus);

export default appointmentRoutes;
