import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns: Array<[string, any]> = [
      ["inactivityEnabled", { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false }],
      ["inactivityTimeout", { type: DataTypes.INTEGER, allowNull: true, defaultValue: 10 }],
      ["inactivityMessage", { type: DataTypes.TEXT, allowNull: true }],
      ["inactivityMaxReminders", { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 }]
    ];
    for (const [name, def] of columns) {
      try {
        await queryInterface.addColumn("Prompts", name, def);
      } catch (err: any) {
      }
    }
  },

  down: async (queryInterface: QueryInterface) => {
    for (const name of [
      "inactivityEnabled",
      "inactivityTimeout",
      "inactivityMessage",
      "inactivityMaxReminders"
    ]) {
      try { await queryInterface.removeColumn("Prompts", name); } catch (e) { /* noop */ }
    }
  }
};