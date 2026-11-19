import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import UserQueue from "../../models/UserQueue";
import logger from "../../utils/logger";

/**
 * Conta quantas CONVERSAS (não mensagens) estão não lidas para um atendente.
 *
 * É o número que vai no badge do ícone do app no celular/desktop, via
 * navigator.setAppBadge() no service worker. Precisa ser por usuário: dois
 * atendentes da mesma empresa veem números diferentes, então não dá pra
 * calcular uma vez e mandar igual pra todo mundo no push.
 *
 * O critério espelha o contador do menu "Atendimentos" no frontend
 * (layout/index.js): conversas com mensagens não lidas que esse usuário
 * consegue ver — as atribuídas a ele, mais as que estão sem atendente nas
 * filas dele.
 */
const CountUnreadTicketsService = async (
  userId: number,
  companyId: number
): Promise<number> => {
  try {
    if (!userId || !companyId) return 0;

    // Filas às quais o usuário pertence — cobre os tickets ainda sem
    // atendente que aparecem pra ele na aba "Aguardando".
    const filasDoUsuario = await UserQueue.findAll({
      where: { userId },
      attributes: ["queueId"]
    });
    const queueIds = filasDoUsuario.map(uq => uq.queueId).filter(Boolean);

    const condicoesDeVisibilidade: any[] = [{ userId }];
    if (queueIds.length > 0) {
      condicoesDeVisibilidade.push({
        userId: null,
        queueId: { [Op.in]: queueIds }
      });
    }

    const total = await Ticket.count({
      where: {
        companyId,
        unreadMessages: { [Op.gt]: 0 },
        status: { [Op.in]: ["open", "pending"] },
        [Op.or]: condicoesDeVisibilidade
      }
    });

    return total;
  } catch (err: any) {
    // O badge é cosmético: se a contagem falhar, o push ainda deve sair.
    logger.warn(
      `[BADGE] Falha ao contar não lidas do userId=${userId}: ${err?.message}`
    );
    return 0;
  }
};

export default CountUnreadTicketsService;
