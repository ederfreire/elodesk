import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (!table.pendingTicketNotificationMessage) {
      await queryInterface.addColumn("Users", "pendingTicketNotificationMessage", {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (table.pendingTicketNotificationMessage) {
      await queryInterface.removeColumn("Users", "pendingTicketNotificationMessage");
    }
  }
};