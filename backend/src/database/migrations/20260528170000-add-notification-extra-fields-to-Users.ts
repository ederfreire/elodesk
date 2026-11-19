import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");

    if (!table.notifyOpenTicketWhatsapp) {
      await queryInterface.addColumn("Users", "notifyOpenTicketWhatsapp", {
        type: DataTypes.STRING,
        defaultValue: "disabled"
      });
    }
    if (!table.notifyKanbanTicketWhatsapp) {
      await queryInterface.addColumn("Users", "notifyKanbanTicketWhatsapp", {
        type: DataTypes.STRING,
        defaultValue: "disabled"
      });
    }
    if (!table.notificationMaxCount) {
      await queryInterface.addColumn("Users", "notificationMaxCount", {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        allowNull: false
      });
    }
    if (!table.notificationIntervalMinutes) {
      await queryInterface.addColumn("Users", "notificationIntervalMinutes", {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (table.notifyOpenTicketWhatsapp) {
      await queryInterface.removeColumn("Users", "notifyOpenTicketWhatsapp");
    }
    if (table.notifyKanbanTicketWhatsapp) {
      await queryInterface.removeColumn("Users", "notifyKanbanTicketWhatsapp");
    }
    if (table.notificationMaxCount) {
      await queryInterface.removeColumn("Users", "notificationMaxCount");
    }
    if (table.notificationIntervalMinutes) {
      await queryInterface.removeColumn("Users", "notificationIntervalMinutes");
    }
  }
};