import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = "Prompts";
    const addCol = async (col: string, cfg: any) => {
      try { await queryInterface.addColumn(table, col, cfg); } catch (e) { /* exists */ }
    };
    await addCol("toolOpenTicketConfig", { type: DataTypes.TEXT, allowNull: true, defaultValue: null });
    await addCol("toolSchedulingConfig", { type: DataTypes.TEXT, allowNull: true, defaultValue: null });
  },
  down: async (queryInterface: QueryInterface) => {
    for (const col of ["toolOpenTicketConfig", "toolSchedulingConfig"]) {
      try { await queryInterface.removeColumn("Prompts", col); } catch (e) {}
    }
  }
};