import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("FlowBuilders");

    if (!table.description) {
      await queryInterface.addColumn("FlowBuilders", "description", {
        type: DataTypes.STRING,
        allowNull: true
      });
    }
    if (!table.triggerType) {
      await queryInterface.addColumn("FlowBuilders", "triggerType", {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "keyword"
      });
    }
    if (!table.keywords) {
      await queryInterface.addColumn("FlowBuilders", "keywords", {
        type: DataTypes.JSON,
        allowNull: true
      });
    }
    if (!table.successCount) {
      await queryInterface.addColumn("FlowBuilders", "successCount", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }
    if (!table.failureCount) {
      await queryInterface.addColumn("FlowBuilders", "failureCount", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("FlowBuilders", "description");
    await queryInterface.removeColumn("FlowBuilders", "triggerType");
    await queryInterface.removeColumn("FlowBuilders", "keywords");
    await queryInterface.removeColumn("FlowBuilders", "successCount");
    await queryInterface.removeColumn("FlowBuilders", "failureCount");
  }
};