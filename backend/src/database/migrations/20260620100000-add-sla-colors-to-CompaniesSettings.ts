import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = await queryInterface.describeTable("CompaniesSettings");

    if (!table["slaGreenColor"]) {
      await queryInterface.addColumn("CompaniesSettings", "slaGreenColor", {
        type: DataTypes.STRING,
        defaultValue: "#22c55e",
        allowNull: false,
      });
    }

    if (!table["slaYellowColor"]) {
      await queryInterface.addColumn("CompaniesSettings", "slaYellowColor", {
        type: DataTypes.STRING,
        defaultValue: "#eab308",
        allowNull: false,
      });
    }

    if (!table["slaRedColor"]) {
      await queryInterface.addColumn("CompaniesSettings", "slaRedColor", {
        type: DataTypes.STRING,
        defaultValue: "#ef4444",
        allowNull: false,
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CompaniesSettings", "slaGreenColor");
    await queryInterface.removeColumn("CompaniesSettings", "slaYellowColor");
    await queryInterface.removeColumn("CompaniesSettings", "slaRedColor");
  },
};
