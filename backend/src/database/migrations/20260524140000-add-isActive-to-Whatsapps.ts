import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Whatsapps");
    if (!table.isActive) {
      await queryInterface.addColumn("Whatsapps", "isActive", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "isActive");
  }
};
