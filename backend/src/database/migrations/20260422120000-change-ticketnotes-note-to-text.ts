import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.changeColumn("TicketNotes", "note", {
        type: DataTypes.TEXT,
        allowNull: false
      });
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.changeColumn("TicketNotes", "note", {
      type: DataTypes.STRING,
      allowNull: false
    });
  }
};