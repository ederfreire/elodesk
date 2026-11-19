import { QueryInterface, DataTypes } from "sequelize";

/**
 * Preferências da empresa para o Google Meet e os agendamentos.
 *
 * São os padrões que a tela de Agendamento herda quando o operador abre um
 * agendamento novo — ele ainda pode desligar caso a caso.
 */
module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      // Gera um link de videoconferência exclusivo em cada agendamento.
      queryInterface.addColumn("GoogleCalendarIntegrations", "autoMeet", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }),
      // Insere os agendamentos marcados no calendário do Google.
      queryInterface.addColumn("GoogleCalendarIntegrations", "syncEvents", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      }),
      // Convite automático por e-mail ao contato, quando ele tiver e-mail.
      // Padrão DESLIGADO de propósito: mandar convite de Google para o
      // cliente sem ele esperar é o tipo de coisa que gera reclamação, e
      // além disso expõe o e-mail da conta conectada. Quem quiser, liga.
      queryInterface.addColumn("GoogleCalendarIntegrations", "sendInvite", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      })
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("GoogleCalendarIntegrations", "autoMeet"),
      queryInterface.removeColumn("GoogleCalendarIntegrations", "syncEvents"),
      queryInterface.removeColumn("GoogleCalendarIntegrations", "sendInvite")
    ]);
  }
};
