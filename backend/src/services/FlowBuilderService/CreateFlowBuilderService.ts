import { FlowBuilderModel } from "../../models/FlowBuilder";
import { WebhookModel } from "../../models/Webhook";
import { randomString } from "../../utils/randomCode";

interface Request {
  userId: number;
  name: string;
  companyId: number;
  description?: string | null;
  triggerType?: string;
  keywords?: string[] | null;
  triggerConfig?: any;
}

const CreateFlowBuilderService = async ({
  userId,
  name,
  companyId,
  description,
  triggerType,
  keywords,
  triggerConfig
}: Request): Promise<FlowBuilderModel | string> => {
  try {
    
    const nameExist = await FlowBuilderModel.findOne({
      where: {
        name,
        company_id: companyId
      }
    })


    if(nameExist){
      return 'exist'
    }

    const flow = await FlowBuilderModel.create({
      user_id: userId,
      company_id: companyId,
      name: name,
      description: description ?? null,
      triggerType: triggerType || "keyword",
      keywords: Array.isArray(keywords) ? keywords : null,
      triggerConfig: triggerConfig ?? null
    });

    return flow;
  } catch (error) {
    console.error("Erro ao inserir o usuário:", error);

    return error
  }
};

export default CreateFlowBuilderService;
