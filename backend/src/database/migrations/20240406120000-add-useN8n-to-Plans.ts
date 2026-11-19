import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const tableDesc: any = await queryInterface.describeTable("Plans");
      if (!tableDesc.useN8n) {
        await queryInterface.addColumn("Plans", "useN8n", {
          type: DataTypes.BOOLEAN,
          defaultValue: false
        });
      }
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Plans", "useN8n");
  }
};
