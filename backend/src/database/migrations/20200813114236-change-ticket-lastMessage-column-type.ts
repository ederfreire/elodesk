import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    await queryInterface.changeColumn("Tickets", "lastMessage", {
      type: DataTypes.TEXT
    });
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.changeColumn("Tickets", "lastMessage", {
      type: DataTypes.STRING
    });
  }
};
