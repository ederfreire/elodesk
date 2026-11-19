import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.addColumn("Users", "timezone", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "America/Sao_Paulo"
      });
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.removeColumn("Users", "timezone");
    } catch (err: any) {
    }
  }
};
