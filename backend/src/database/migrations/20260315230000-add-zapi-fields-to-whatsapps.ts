import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Whatsapps");

    if (!tableDesc["zapiInstanceId"]) {
      await queryInterface.addColumn("Whatsapps", "zapiInstanceId", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }
    if (!tableDesc["zapiToken"]) {
      await queryInterface.addColumn("Whatsapps", "zapiToken", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }
    if (!tableDesc["zapiClientToken"]) {
      await queryInterface.addColumn("Whatsapps", "zapiClientToken", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "zapiInstanceId");
    await queryInterface.removeColumn("Whatsapps", "zapiToken");
    await queryInterface.removeColumn("Whatsapps", "zapiClientToken");
  },
};
