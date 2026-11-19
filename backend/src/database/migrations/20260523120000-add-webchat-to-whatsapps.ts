import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "webchatToken", {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    });
    await queryInterface.addColumn("Whatsapps", "webchatConfig", {
      type: DataTypes.JSONB,
      allowNull: true
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "webchatToken");
    await queryInterface.removeColumn("Whatsapps", "webchatConfig");
  }
};