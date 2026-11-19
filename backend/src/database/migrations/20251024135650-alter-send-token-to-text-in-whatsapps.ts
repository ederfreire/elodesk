import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    await queryInterface.changeColumn("Whatsapps", "send_token", {
      type: DataTypes.TEXT,
      allowNull: true,
    });
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.changeColumn("Whatsapps", "send_token", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
};

