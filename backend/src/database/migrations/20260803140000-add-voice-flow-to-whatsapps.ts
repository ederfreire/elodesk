import { QueryInterface, DataTypes } from "sequelize";

/**
 * URA de voz vinculada à conexão WhatsApp Plus.
 *
 * O motor de URA já existe no wacalls-chat (flowexec.go, com nós
 * voice_menu, dtmf_capture, record_audio, transfer). Ele roda quando o
 * campo `flowId` da SESSÃO está preenchido — e era justamente isso que
 * nunca era enviado: o backend criava a sessão só com nome e allowGroups.
 *
 * Este campo guarda o id do fluxo de voz escolhido na tela de Conexões e
 * é empurrado para a sessão em cada gravação da conexão.
 *
 * É texto porque o id do fluxo no wacalls-chat é uma string gerada lá
 * (newFlowID), não um inteiro do Postgres.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tabela: any = await queryInterface.describeTable("Whatsapps");
    if (!tabela.wacallsVoiceFlowId) {
      await queryInterface.addColumn("Whatsapps", "wacallsVoiceFlowId", {
        type: DataTypes.STRING,
        allowNull: true
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "wacallsVoiceFlowId");
  }
};
