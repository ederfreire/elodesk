import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
    await queryInterface.addColumn("FlowBuilders", "company_id", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
      } catch (err) {
    }
  },

  down: async queryInterface => {
    await queryInterface.removeColumn("FlowBuilders", "company_id");
  }
};
