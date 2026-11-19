import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (!table.notifyPendingTicketWhatsapp) {
      await queryInterface.addColumn("Users", "notifyPendingTicketWhatsapp", {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "disabled"
      });
    }
    if (!table.whatsappNumber) {
      await queryInterface.addColumn("Users", "whatsappNumber", {
        type: DataTypes.STRING,
        allowNull: true
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (table.notifyPendingTicketWhatsapp) {
      await queryInterface.removeColumn("Users", "notifyPendingTicketWhatsapp");
    }
    if (table.whatsappNumber) {
      await queryInterface.removeColumn("Users", "whatsappNumber");
    }
  }
};