import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.sequelize.transaction(async (t) => {
      const tableDesc = await queryInterface.describeTable("Whatsapps");

      if (!tableDesc["zapiInstanceId"]) {
        await queryInterface.addColumn(
          "Whatsapps",
          "zapiInstanceId",
          { type: DataTypes.STRING, allowNull: true, defaultValue: null },
          { transaction: t }
        );
      }

      if (!tableDesc["zapiToken"]) {
        await queryInterface.addColumn(
          "Whatsapps",
          "zapiToken",
          { type: DataTypes.STRING, allowNull: true, defaultValue: null },
          { transaction: t }
        );
      }

      if (!tableDesc["zapiClientToken"]) {
        await queryInterface.addColumn(
          "Whatsapps",
          "zapiClientToken",
          { type: DataTypes.STRING, allowNull: true, defaultValue: null },
          { transaction: t }
        );
      }
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.removeColumn("Whatsapps", "zapiInstanceId", { transaction: t });
      await queryInterface.removeColumn("Whatsapps", "zapiToken", { transaction: t });
      await queryInterface.removeColumn("Whatsapps", "zapiClientToken", { transaction: t });
    });
  }
};
