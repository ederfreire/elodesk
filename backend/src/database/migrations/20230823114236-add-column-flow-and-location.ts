import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface : QueryInterface, Sequelize) => {
    try {
    await queryInterface.addColumn("Tickets", "flowWebhook", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn("Tickets", "lastFlowId", {
        type: DataTypes.STRING,
        allowNull: true,
      });
      } catch (err) {
    }
  },

  down: async (queryInterface : QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "flowWebhook");
    await queryInterface.removeColumn("Tickets", "lastFlowId");
  }
};
