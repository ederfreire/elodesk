import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Whatsapps");
    if (!table.allowSignature) {
      await queryInterface.addColumn("Whatsapps", "allowSignature", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Whatsapps");
    if (table.allowSignature) {
      await queryInterface.removeColumn("Whatsapps", "allowSignature");
    }
  }
};