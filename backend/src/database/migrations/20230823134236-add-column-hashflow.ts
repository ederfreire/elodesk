import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface, Sequelize) => {
    try {
    await queryInterface.addColumn("Tickets", "hashFlowId", {
      type: DataTypes.STRING,
      allowNull: true
    });
      } catch (err) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "hashFlowId");
  }
};
