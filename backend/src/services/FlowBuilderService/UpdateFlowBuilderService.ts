import { FlowBuilderModel } from "../../models/FlowBuilder";
import { WebhookModel } from "../../models/Webhook";
import { randomString } from "../../utils/randomCode";

interface Request {
  companyId: number;
  name: string;
  flowId: number;
  description?: string | null;
  triggerType?: string;
  keywords?: string[] | null;
  triggerConfig?: any;
}

const UpdateFlowBuilderService = async ({
  companyId,
  name,
  flowId,
  description,
  triggerType,
  keywords,
  triggerConfig
}: Request): Promise<String> => {
  try {

    const nameExist = await FlowBuilderModel.findOne({
      where: {
        name,
        company_id: companyId
      }
    })

    if(nameExist && nameExist.id !== flowId){
      return 'exist'
    }

    const updateData: any = { name };
    if (description !== undefined) updateData.description = description;
    if (triggerType !== undefined) updateData.triggerType = triggerType;
    if (keywords !== undefined) updateData.keywords = Array.isArray(keywords) ? keywords : null;
    if (triggerConfig !== undefined) updateData.triggerConfig = triggerConfig ?? null;

    const flow = await FlowBuilderModel.update(updateData, {
      where: {id: flowId, company_id: companyId}
    });

    return 'ok';
  } catch (error) {
    console.error("Erro ao inserir o usuário:", error);

    return error
  }
};

export default UpdateFlowBuilderService;
