import { Router, Request, Response } from "express";
import isAuth from "../middleware/isAuth";

const n8nConfigRoutes = Router();

n8nConfigRoutes.get("/n8n/config", isAuth, async (req: Request, res: Response) => {
  const url = process.env.N8N_URL || "";
  return res.json({
    url,
    configured: !!url
  });
});

export default n8nConfigRoutes;
