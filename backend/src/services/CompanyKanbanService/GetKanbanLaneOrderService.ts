import CompanyKanbanConfig from "../../models/CompanyKanbanConfig";

interface Request {
  companyId: number;
  userId: number;
}

const GetKanbanLaneOrderService = async ({
  companyId,
  userId,
}: Request): Promise<string[] | null> => {
  const config = await CompanyKanbanConfig.findOne({
    where: {
      companyId,
      userId,
    },
  });

  if (!config || !config.laneOrder) {
    return null;
  }

  try {
    return JSON.parse(config.laneOrder);
  } catch (error) {
    console.error("Error parsing lane order:", error);
    return null;
  }
};

export default GetKanbanLaneOrderService;
