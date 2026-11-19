import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.addColumn("Whatsapps", "isOficial", {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false
      });
    } catch (err: any) {
    }

    try {
      await queryInterface.addColumn("Whatsapps", "channel", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "whatsapp"
      });
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.removeColumn("Whatsapps", "isOficial");
    } catch (err: any) {
    }
    try {
      await queryInterface.removeColumn("Whatsapps", "channel");
    } catch (err: any) {
    }
  }
};
