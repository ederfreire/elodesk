import { QueryInterface, DataTypes } from "sequelize";

/**
 * Fuso horário do expediente da EMPRESA (usado quando scheduleType = "company").
 *
 * Sem isto, VerifyCurrentSchedule comparava o expediente com now() do servidor
 * (fuso do banco). Um cliente na Espanha, num servidor em horário do Brasil,
 * abria/fechava expediente 4-5h errado. O default America/Sao_Paulo preserva o
 * comportamento atual de quem já roda no Brasil.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Companies", "timezone", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "America/Sao_Paulo"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Companies", "timezone");
  }
};
