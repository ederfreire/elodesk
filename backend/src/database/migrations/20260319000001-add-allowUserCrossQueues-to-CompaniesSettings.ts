import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = await queryInterface.describeTable("CompaniesSettings");

    if (!("allowUserCrossQueues" in table)) {
      await queryInterface.addColumn("CompaniesSettings", "allowUserCrossQueues", {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table = await queryInterface.describeTable("CompaniesSettings");

    if ("allowUserCrossQueues" in table) {
      await queryInterface.removeColumn("CompaniesSettings", "allowUserCrossQueues");
    }
  }
};
