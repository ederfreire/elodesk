import express from "express";
import isAuth from "../middleware/isAuth";
import * as LeadController from "../controllers/LeadController";

const leadRoutes = express.Router();

leadRoutes.get("/leads/report", isAuth, LeadController.index);

export default leadRoutes;