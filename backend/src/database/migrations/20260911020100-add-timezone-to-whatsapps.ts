import { QueryInterface, DataTypes } from "sequelize";

/**
 * Fuso horário do expediente da CONEXÃO (usado quando scheduleType = "connection").
 * Default America/Sao_Paulo mantém o comportamento atual para instalações no Brasil.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "timezone", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "America/Sao_Paulo"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "timezone");
  }
};
