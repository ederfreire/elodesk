import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = await queryInterface.describeTable("CompaniesSettings");

    if (!table["slaGreenMinutes"]) {
      await queryInterface.addColumn("CompaniesSettings", "slaGreenMinutes", {
        type: DataTypes.INTEGER,
        defaultValue: 30,
        allowNull: false,
      });
    }

    if (!table["slaYellowMinutes"]) {
      await queryInterface.addColumn("CompaniesSettings", "slaYellowMinutes", {
        type: DataTypes.INTEGER,
        defaultValue: 60,
        allowNull: false,
      });
    }

    if (!table["slaRedMinutes"]) {
      await queryInterface.addColumn("CompaniesSettings", "slaRedMinutes", {
        type: DataTypes.INTEGER,
        defaultValue: 120,
        allowNull: false,
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CompaniesSettings", "slaGreenMinutes");
    await queryInterface.removeColumn("CompaniesSettings", "slaYellowMinutes");
    await queryInterface.removeColumn("CompaniesSettings", "slaRedMinutes");
  },
};
