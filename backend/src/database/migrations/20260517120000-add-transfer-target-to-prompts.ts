import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = "Prompts";
    const addCol = async (col: string, cfg: any) => {
      try { await queryInterface.addColumn(table, col, cfg); } catch (e) { /* exists */ }
    };
    await addCol("transferQueueId", { type: DataTypes.INTEGER, allowNull: true, defaultValue: null });
    await addCol("transferUserId", { type: DataTypes.INTEGER, allowNull: true, defaultValue: null });
    await addCol("transferStatus", { type: DataTypes.STRING, allowNull: true, defaultValue: "pending" });
  },
  down: async (queryInterface: QueryInterface) => {
    for (const col of ["transferQueueId", "transferUserId", "transferStatus"]) {
      try { await queryInterface.removeColumn("Prompts", col); } catch (e) {}
    }
  }
};