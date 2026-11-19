import { QueryInterface, DataTypes } from "sequelize";

/**
 * Leva a integração com o Google Agenda para dentro do AGENDAMENTO.
 *
 * Antes, criar evento no Google só era possível por um nó do FlowBuilder —
 * ou seja, dependia de montar um fluxo. Quem só queria marcar uma reunião a
 * partir da tela de Agendamentos não tinha como. Estas colunas guardam, por
 * agendamento, o que o operador escolheu e o que o Google devolveu.
 *
 * Todas as colunas são opcionais e com padrão neutro: agendamento antigo
 * continua funcionando exatamente como antes, sem tocar no Google.
 */
module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      // Escolha do operador: sincronizar este agendamento no Google Agenda.
      queryInterface.addColumn("Schedules", "googleSync", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }),
      // Escolha do operador: gerar link do Google Meet para este agendamento.
      queryInterface.addColumn("Schedules", "googleMeet", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }),
      // Título do evento no Google. Separado do corpo da mensagem de
      // propósito: o que vai no WhatsApp e o que aparece na agenda do
      // profissional raramente são o mesmo texto.
      queryInterface.addColumn("Schedules", "googleEventTitle", {
        type: DataTypes.STRING,
        allowNull: true
      }),
      // Duração da reunião em minutos. Nulo = usa a duração padrão definida
      // nas preferências da empresa.
      queryInterface.addColumn("Schedules", "googleEventDuration", {
        type: DataTypes.INTEGER,
        allowNull: true
      }),
      // Devolvidos pelo Google depois de criar o evento. Guardados para
      // conseguir ATUALIZAR e APAGAR o evento quando o agendamento mudar ou
      // for excluído — sem o eventId, o evento ficaria órfão na agenda.
      queryInterface.addColumn("Schedules", "googleEventId", {
        type: DataTypes.STRING,
        allowNull: true
      }),
      queryInterface.addColumn("Schedules", "googleMeetLink", {
        type: DataTypes.STRING,
        allowNull: true
      }),
      queryInterface.addColumn("Schedules", "googleEventLink", {
        type: DataTypes.STRING,
        allowNull: true
      })
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Schedules", "googleSync"),
      queryInterface.removeColumn("Schedules", "googleMeet"),
      queryInterface.removeColumn("Schedules", "googleEventTitle"),
      queryInterface.removeColumn("Schedules", "googleEventDuration"),
      queryInterface.removeColumn("Schedules", "googleEventId"),
      queryInterface.removeColumn("Schedules", "googleMeetLink"),
      queryInterface.removeColumn("Schedules", "googleEventLink")
    ]);
  }
};
