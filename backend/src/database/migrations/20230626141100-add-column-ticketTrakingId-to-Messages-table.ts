import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Messages", "ticketTrakingId", {
      type: DataTypes.INTEGER,
      references: { model: "TicketTraking", key: "id" },
      onUpdate: "SET NULL",
      onDelete: "SET NULL"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Messages", "ticketTrakingId");
  }
};
