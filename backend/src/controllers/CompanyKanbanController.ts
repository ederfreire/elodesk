import { Request, Response } from "express";
import SetKanbanLaneOrderService from "../services/CompanyKanbanService/SetKanbanLaneOrderService";
import GetKanbanLaneOrderService from "../services/CompanyKanbanService/GetKanbanLaneOrderService";

export const setLaneOrder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { laneOrder } = req.body;
  const { companyId, id } = req.user;
  const userId = Number(id);

  try {
    const config = await SetKanbanLaneOrderService({
      companyId,
      userId,
      laneOrder,
    });

    return res.status(200).json({
      success: true,
      message: "Ordem das lanes atualizada com sucesso",
      laneOrder: JSON.parse(config.laneOrder),
    });
  } catch (error) {
    console.error("Error setting kanban lane order:", error);
    return res.status(500).json({
      error: "Erro interno do servidor",
    });
  }
};

export const getLaneOrder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id } = req.user;
  const userId = Number(id);

  try {
    const laneOrder = await GetKanbanLaneOrderService({
      companyId,
      userId,
    });

    return res.status(200).json({
      laneOrder,
    });
  } catch (error) {
    console.error("Error getting kanban lane order:", error);
    return res.status(500).json({
      error: "Erro interno do servidor",
    });
  }
};
