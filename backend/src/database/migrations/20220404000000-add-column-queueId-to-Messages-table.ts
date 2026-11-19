import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Messages", "queueId", {
      type: DataTypes.INTEGER,
      references: { model: "Queues", key: "id" },
      onUpdate: "SET NULL",
      onDelete: "SET NULL"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Messages", "queueId");
  }
};
