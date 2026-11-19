import { Request, Response } from "express";
import ListLeadsReportService from "../services/LeadServices/ListLeadsReportService";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { startDate, endDate, status, searchParam, pageNumber } = req.query as any;

  const result = await ListLeadsReportService({
    companyId,
    startDate,
    endDate,
    status,
    searchParam,
    pageNumber
  });

  return res.json(result);
};