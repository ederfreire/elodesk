import { Op } from "sequelize";
import QuickMessage from "../../models/QuickMessage";
import Company from "../../models/Company";
import QuickMessageComponent from "../../models/QuickMessageComponent";

type Params = {
  companyId: string;
  userId: string;
  isOficial: string;
  whatsappId?: string;
};

const FindService = async ({ companyId, userId, isOficial, whatsappId }: Params): Promise<QuickMessage[]> => {

  const orConditions: any[] = [{ visao: true }];
  if (userId) {
    orConditions.push({ userId });
  }

  // Determinar filtro de isOficial:
  // - Se isOficial === "true": retorna APENAS templates oficiais (Meta)
  // - Caso contrário: retorna APENAS respostas rápidas (não-oficiais)
  //   Templates oficiais são acessados pelo modal de Template, nunca devem
  //   aparecer misturados nas respostas rápidas (atalho "/")
  const isOficialFilter: any = isOficial === "true" ? true : false;

  const whereClause: any = {
    companyId,
    [Op.or]: orConditions,
    isOficial: isOficialFilter
  };

  // Filtrar por conexão (whatsappId) quando solicitado
  // Isso garante que templates de cada conexão sejam separados
  if (whatsappId) {
    whereClause.whatsappId = whatsappId;
  }

  const notes: QuickMessage[] = await QuickMessage.findAll({
    where: whereClause,
    include: [
      {
        model: Company,
        as: "company",
        attributes: ["id", "name"]
      },
      {
        model: QuickMessageComponent,
        as: "components",
        attributes: ["id", "type", "text", "quickMessageId", "buttons", "format", "example"],
        order: [["quickMessageId", "ASC"], ["id", "ASC"]]
      }
    ],
  });

  return notes as QuickMessage[];
};

export default FindService;
