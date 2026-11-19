import { Op } from "sequelize";
import Plan from "../../models/Plan";

const FindAllPlanService = async (listPublic?: any): Promise<Plan[]> => {
  // Quando listPublic === "false", significa que é uma listagem pública (signup)
  // e deve mostrar APENAS planos com isPublic = true
  if (listPublic === "false") {
    const plans = await Plan.findAll({
      where: {
        isPublic: true as any
      },
      order: [["name", "ASC"]]
    });
    return plans;
  }

  // Listagem completa (admin) — mostra todos
  const plans = await Plan.findAll({
    order: [["name", "ASC"]]
  });
  return plans;
};

export default FindAllPlanService;
