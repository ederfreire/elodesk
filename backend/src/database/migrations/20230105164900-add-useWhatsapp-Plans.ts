import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Plans");
    if (!table.useWhatsapp) {
      await queryInterface.addColumn("Plans", "useWhatsapp", {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      });
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Plans", "useWhatsapp");
  }
};
