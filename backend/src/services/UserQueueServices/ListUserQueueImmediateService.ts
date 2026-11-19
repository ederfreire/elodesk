import { Op, Sequelize } from "sequelize";
import AppError from "../../errors/AppError";
import UserQueue from "../../models/UserQueue";
import Queue from "../../models/Queue";
import User from "../../models/User";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import ContactWallet from "../../models/ContactWallet";

interface ImmediateRandomizationResult {
  userId: number | null;
  userQueue: UserQueue | null;
  isImmediate: boolean;
}

const ListUserQueueImmediateService = async (
  queueId: string | number,
  ticketId?: number
): Promise<ImmediateRandomizationResult> => {
  // Se temos ticketId, verificar se o contato possui contactWallet
  if (ticketId) {
    const ticket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: Contact,
          as: "contact",
          include: [
            {
              model: ContactWallet,
              as: "contactWallets"
            }
          ]
        }
      ]
    });

    if (ticket && ticket.contact && ticket.contact.contactWallets && ticket.contact.contactWallets.length > 0) {
      // Buscar a carteira ativa para esta fila
      const activeWallet = ticket.contact.contactWallets.find(wallet => wallet.queueId === queueId);
      
      if (activeWallet) {
        
        // Buscar o UserQueue correspondente à carteira
        const userQueue = await UserQueue.findOne({
          where: {
            queueId: queueId,
            userId: activeWallet.walletId
          }
        });

        if (!userQueue) {
          
          // Fallback para roteamento normal se UserQueue não existir
          const fallbackUserQueue = await UserQueue.findOne({
            where: {
              queueId: {
                [Op.or]: [queueId]
              }
            },
            order: Sequelize.literal('random()')
          });

          if (!fallbackUserQueue) {
            throw new AppError("ERR_NOT_FOUND_USER_IN_QUEUE", 404);
          }

          return {
            userId: fallbackUserQueue.userId,
            userQueue: fallbackUserQueue,
            isImmediate: false
          };
        }

        return {
          userId: activeWallet.walletId,
          userQueue,
          isImmediate: true // Atribuição imediata para carteira
        };
      } else {
        
        // Usar lógica normal de roteamento quando há carteira mas não para esta fila
        const userQueue = await UserQueue.findOne({
          where: {
            queueId: {
              [Op.or]: [queueId]
            }
          },
          order: Sequelize.literal('random()')
        });

        if (!userQueue) {
          throw new AppError("ERR_NOT_FOUND_USER_IN_QUEUE", 404);
        }

        return {
          userId: userQueue.userId,
          userQueue,
          isImmediate: false
        };
      }
    }
  }

  // Buscar a fila com as configurações
  const queue = await Queue.findByPk(queueId, {
    include: [
      {
        model: User,
        as: "users",
        through: { attributes: [] }
      }
    ]
  });

  if (!queue) {
    throw new AppError("ERR_QUEUE_NOT_FOUND", 404);
  }


  // Verificar se a randomização imediata está ativada
  if (!queue.randomizeImmediate || !queue.ativarRoteador) {
    // Usar lógica normal de roteamento
    const userQueue = await UserQueue.findOne({
      where: {
        queueId: {
          [Op.or]: [queueId]
        }
      },
      order: queue.typeRandomMode === "ORDENADO"
        ? [["id", "ASC"]]
        : Sequelize.literal('random()')
    });

    if (!userQueue) {
      throw new AppError("ERR_NOT_FOUND_USER_IN_QUEUE", 404);
    }

    return {
      userId: userQueue.userId,
      userQueue,
      isImmediate: false
    };
  }

  // Lógica de randomização imediata
  const allUsers = queue.users;

  if (!allUsers || allUsers.length === 0) {
    throw new AppError("ERR_NO_USERS_IN_QUEUE", 404);
  }

  // Filtrar apenas usuários online (fallback para todos se nenhum online)
  const onlineUsers = allUsers.filter(u => (u as any).online === true);
  const users = onlineUsers.length > 0 ? onlineUsers : allUsers;


  // Calcular carga (tickets ativos) por usuário e escolher o(s) mais leve(s)
  const eligibleUsers = [] as any[];
  const userIdToActiveTicketsCount: Record<number, number> = {};

  for (const user of users) {
    if (user.profile === "admin") {
      continue;
    }

    const activeTickets = await Ticket.count({
      where: {
        userId: user.id,
        status: { [Op.in]: ["open", "pending"] },
        companyId: queue.companyId
      }
    });

    eligibleUsers.push(user);
    userIdToActiveTicketsCount[user.id] = activeTickets;

  }

  if (eligibleUsers.length === 0) {
    
    // Fallback: usar todos os usuários da fila, incluindo admins se necessário
    
    // Se não há usuários na fila, retornar erro
    if (users.length === 0) {
      throw new AppError("ERR_NO_USERS_IN_QUEUE", 404);
    }
    
    // Usar todos os usuários como fallback
    for (const user of users) {
      const activeTickets = await Ticket.count({
        where: {
          userId: user.id,
          status: { [Op.in]: ["open", "pending"] },
          companyId: queue.companyId
        }
      });
      
      eligibleUsers.push(user);
      userIdToActiveTicketsCount[user.id] = activeTickets;
    }
  }

  // Primeiro, preferir quem tem 0 tickets. Se não houver, pegar menor carga
  const usersWithZero = eligibleUsers.filter(u => userIdToActiveTicketsCount[u.id] === 0);
  let usersToChooseFrom = usersWithZero;

  if (usersToChooseFrom.length === 0) {
    const minLoad = Math.min(...eligibleUsers.map(u => userIdToActiveTicketsCount[u.id]));
    usersToChooseFrom = eligibleUsers.filter(u => userIdToActiveTicketsCount[u.id] === minLoad);
  }


  // Segurança: se por algum motivo o pool estiver vazio, cair para todos elegíveis
  if (usersToChooseFrom.length === 0) {
    usersToChooseFrom = eligibleUsers;
  }

  let selectedUser;
  
  if (queue.typeRandomMode === "ORDENADO") {
    // Ordenar por nome do usuário (A, B, C...)
    usersToChooseFrom.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
    
    selectedUser = usersToChooseFrom[0]; // Primeiro da lista ordenada
  } else {
    // Selecionar usuário aleatório
    const randomIndex = Math.floor(Math.random() * usersToChooseFrom.length);
    selectedUser = usersToChooseFrom[randomIndex];
  }

  // Buscar o UserQueue correspondente
  const userQueue = await UserQueue.findOne({
    where: {
      queueId: queueId,
      userId: selectedUser.id
    }
  });

  if (!userQueue) {
    throw new AppError("ERR_USER_QUEUE_NOT_FOUND", 404);
  }


  return {
    userId: selectedUser.id,
    userQueue,
    isImmediate: true
  };
};

export default ListUserQueueImmediateService;
