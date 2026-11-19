import CompanyKanbanConfig from "../../models/CompanyKanbanConfig";

interface Request {
  companyId: number;
  userId: number;
  laneOrder: string[];
}

const SetKanbanLaneOrderService = async ({
  companyId,
  userId,
  laneOrder,
}: Request): Promise<CompanyKanbanConfig> => {
  const [config, created] = await CompanyKanbanConfig.findOrCreate({
    where: {
      companyId,
      userId,
    },
    defaults: {
      companyId,
      userId,
      laneOrder: JSON.stringify(laneOrder),
    },
  });

  if (!created) {
    await config.update({ laneOrder: JSON.stringify(laneOrder) });
  }

  return config;
};

export default SetKanbanLaneOrderService;
