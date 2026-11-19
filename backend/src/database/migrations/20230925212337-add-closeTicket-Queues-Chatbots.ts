import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    await queryInterface.addColumn("Queues", "closeTicket", {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }),
    queryInterface.addColumn("Chatbots", "closeTicket", {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    })
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Queues", "closeTicket"),
    queryInterface.removeColumn("Chatbots", "closeTicket")
  }
};