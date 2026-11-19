import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("FlowBuilders");
    if (!table.triggerConfig) {
      await queryInterface.addColumn("FlowBuilders", "triggerConfig", {
        type: DataTypes.JSON,
        allowNull: true
      });
    }
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("FlowBuilders", "triggerConfig");
  }
};