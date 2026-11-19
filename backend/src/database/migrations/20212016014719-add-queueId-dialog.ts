import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("DialogChatBots", "queueId", {
      type: DataTypes.INTEGER,
      references: { model: "Queues", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("DialogChatBots", "queueId");
  }
};
