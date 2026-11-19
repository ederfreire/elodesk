import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = "Queues";
    const column = "promptId";
    const tableInfo: any = await queryInterface.describeTable(table);
    if (tableInfo[column]) {
      return Promise.resolve();
    }
    return queryInterface.addColumn(table, column, {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Prompts", key: "id" },
      onUpdate: "SET NULL",
      onDelete: "SET NULL"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Queues", "promptId");
  }
};