import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const tableDesc: any = await queryInterface.describeTable("CompaniesSettings");
      if (!tableDesc.aiSuggestReply) {
        await queryInterface.addColumn("CompaniesSettings", "aiSuggestReply", {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
        });
      }
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.removeColumn("CompaniesSettings", "aiSuggestReply");
    } catch (err: any) {
    }
  },
};
