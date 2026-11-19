import ShowPromptService from "./ShowPromptService";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import PromptKnowledgeBase from "../../models/PromptKnowledgeBase";

const DeletePromptService = async (
  promptId: number | string,
  companyId: number | string
): Promise<void> => {
  const prompt = await ShowPromptService({ promptId, companyId });

  // Limpa referências em Tickets e Queues para não cair em FK RESTRICT
  await Ticket.update(
    { promptId: null },
    { where: { promptId: prompt.id } }
  );

  await Queue.update(
    { promptId: null } as any,
    { where: { promptId: prompt.id } }
  );

  // Remove base de conhecimento vinculada (caso a FK não esteja CASCADE)
  await PromptKnowledgeBase.destroy({ where: { promptId: prompt.id } });

  await prompt.destroy();
};

export default DeletePromptService;
