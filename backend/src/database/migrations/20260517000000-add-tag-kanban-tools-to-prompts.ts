import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = "Prompts";
    const addColumnIfNotExists = async (column: string, config: any) => {
      try { await queryInterface.addColumn(table, column, config); } catch (e) { /* exists */ }
    };

    await addColumnIfNotExists("toolTags", {
      type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false
    });
    await addColumnIfNotExists("toolTagsConfig", {
      type: DataTypes.TEXT, allowNull: true, defaultValue: null
    });
    await addColumnIfNotExists("toolKanban", {
      type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false
    });
    await addColumnIfNotExists("toolKanbanConfig", {
      type: DataTypes.TEXT, allowNull: true, defaultValue: null
    });
  },

  down: async (queryInterface: QueryInterface) => {
    const table = "Prompts";
    for (const col of ["toolTags", "toolTagsConfig", "toolKanban", "toolKanbanConfig"]) {
      try { await queryInterface.removeColumn(table, col); } catch (e) {}
    }
  }
};