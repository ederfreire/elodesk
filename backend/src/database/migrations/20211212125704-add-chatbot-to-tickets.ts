import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

    return Promise.all([
        queryInterface.addColumn("Tickets", "chatbot", {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false
      }),
        queryInterface.addColumn("Tickets", "queueOptionId", {
        type: DataTypes.INTEGER,
        references: { model: "QueueOptions", key: "id" },
        onUpdate: "SET null",
        onDelete: "SET null",
        allowNull: true
      })
    ]);

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tickets", "chatbot");
  }
};
