import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = await queryInterface.describeTable("CompaniesSettings");

    if (!("enableCloseTicketModal" in table)) {
      await queryInterface.addColumn("CompaniesSettings", "enableCloseTicketModal", {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table = await queryInterface.describeTable("CompaniesSettings");

    if ("enableCloseTicketModal" in table) {
      await queryInterface.removeColumn("CompaniesSettings", "enableCloseTicketModal");
    }
  }
};
