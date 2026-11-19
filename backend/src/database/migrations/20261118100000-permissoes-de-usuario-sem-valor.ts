import { QueryInterface } from "sequelize";

// Usuários criados antes de algumas permissões existirem (ou pelo cadastro,
// que não gravava todas) ficaram com NULL. O menu só mostra a tela quando o
// valor é "enabled", então NULL escondia a tela sem o admin ter desligado nada,
// e a aba Permissões mostrava o campo vazio. Grava o padrão da coluna.
const COLUNAS = [
  "allHistoric",
  "allUserChat",
  "userClosePendingTicket",
  "allowConnections",
  "showDashboard",
  "allowRealTime",
  "showContacts",
  "showCampaign",
  "showFlow",
  "showSchedules",
  "showKanban",
  "showInternalChat",
  "showOpenAi",
  "showIntegrations",
  "allowSeeMessagesInPendingTickets",
  "showReturnQueueButton",
  "showTransferTicketButton"
];

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tabela: any = await queryInterface.describeTable("Users");
    for (const coluna of COLUNAS) {
      if (!tabela[coluna]) continue;
      await queryInterface.sequelize.query(
        `UPDATE "Users" SET "${coluna}" = 'enabled' WHERE "${coluna}" IS NULL`
      );
    }
  },
  down: async () => {
    // Nada a desfazer: só preenche valores que estavam vazios.
  }
};
