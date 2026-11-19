// src/services/UserServices/ShowUserService.ts - ATUALIZADO COM NOVA COLUNA
import User from "../../models/User";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import Company from "../../models/Company";
import Plan from "../../models/Plan";

const ShowUserService = async (
  id: string | number,
  companyId: string | number
): Promise<User> => {
  const user = await User.findOne({
    where: {
      id,
      companyId
    },
    attributes: [
      "id",
      "name",
      "email",
      "profile",
      "profileImage",
      "super",
      "whatsappId",
      "online",
      "startWork",
      "endWork",
      "allTicket",
      "companyId",
      "tokenVersion",
      "defaultTheme",
      "allowGroup",
      "defaultMenu",
      "farewellMessage",
      "acceptanceMessage",
      "userClosePendingTicket",
      "showDashboard",
      "defaultTicketsManagerWidth",
      "allUserChat",
      "allHistoric",
      "allowRealTime",
      "allowConnections",
      "showContacts",
      "showCampaign",
      "showFlow",
      "showSchedules",
      "showKanban",
      "showInternalChat",
      "showOpenAi",
      "showIntegrations",
      "finalizacaoComValorVendaAtiva",
      "birthDate",
      "allowSeeMessagesInPendingTickets",
      "showReturnQueueButton",
      "showTransferTicketButton",
      "language",
      "timezone",
      "notifyPendingTicketWhatsapp",
      "whatsappNumber",
      "pendingTicketNotificationMessage",
      "notifyOpenTicketWhatsapp",
      "notifyKanbanTicketWhatsapp",
      "notificationMaxCount",
      "notificationIntervalMinutes",
      "notificationWhatsappId",
      // O ramal PRECISA estar nesta lista.
      //
      // Sem ele, GET /users/:id nunca devolvia o ramal. A tela de cadastro
      // abria com o campo vazio (parecendo que não salvou) e, pior: ao salvar
      // qualquer outra alteração, o formulário mandava o ramal em branco e
      // APAGAVA o valor que estava gravado. Ou seja, salvava e o próximo
      // salvamento desfazia.
      "internalExtension",
    ],
    include: [
      { model: Queue, as: "queues", attributes: ["id", "name", "color"] },
      { model: Whatsapp, as: "whatsapps", attributes: ["id", "name", "status", "channel"], through: { attributes: [] } },
      {
        model: Company,
        as: "company",
        attributes: ["id", "name", "dueDate", "document"],
        include: [
          {
            model: Plan,
            as: "plan",
            attributes: [
              "id",
              "name",
              "amount",
              "useWhatsapp",
              "useFacebook",
              "useInstagram",
              "useCampaigns",
              "useSchedules",
              "useInternalChat",
              "useExternalApi",
              "useIntegrations",
              "useOpenAi",
              "useKanban"
            ]
          }
        ]
      }
    ]
  });

  if (!user) {
    throw new AppError("ERR_NO_USER_FOUND", 404);
  }

  return user;
};

export default ShowUserService;