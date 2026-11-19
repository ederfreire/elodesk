import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const table: any = await queryInterface.describeTable("FlowBuilders");
      if (!table.executionCount) {
        await queryInterface.addColumn("FlowBuilders", "executionCount", {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        });
      }
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("FlowBuilders", "executionCount");
  }
};