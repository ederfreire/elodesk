import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = "Prompts";
    const addCol = async (col: string, cfg: any) => {
      try { await queryInterface.addColumn(table, col, cfg); } catch (e) { /* exists */ }
    };
    await addCol("workingHoursEnabled", { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false });
    await addCol("workingHoursTimezone", { type: DataTypes.STRING, allowNull: true, defaultValue: "America/Sao_Paulo" });
    await addCol("workingHoursOutOfMessage", { type: DataTypes.TEXT, allowNull: true, defaultValue: "Olá! Estamos fora do nosso horário de atendimento no momento. Retornaremos seu contato no próximo expediente." });
    await addCol("workingHoursSchedule", { type: DataTypes.TEXT, allowNull: true, defaultValue: null });
  },
  down: async (queryInterface: QueryInterface) => {
    for (const col of ["workingHoursEnabled", "workingHoursTimezone", "workingHoursOutOfMessage", "workingHoursSchedule"]) {
      try { await queryInterface.removeColumn("Prompts", col); } catch (e) { /* ignore */ }
    }
  }
};