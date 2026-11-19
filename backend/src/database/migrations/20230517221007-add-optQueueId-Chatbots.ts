import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Chatbots", "optQueueId", {
      type: DataTypes.INTEGER,
      references: { model: "Queues", key: "id" },
      defaultValue: null,
      allowNull: true
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Chatbots", "optQueueId");
  }
};