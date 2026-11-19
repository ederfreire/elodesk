import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (!table.notificationWhatsappId) {
      await queryInterface.addColumn("Users", "notificationWhatsappId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (table.notificationWhatsappId) {
      await queryInterface.removeColumn("Users", "notificationWhatsappId");
    }
  }
};
