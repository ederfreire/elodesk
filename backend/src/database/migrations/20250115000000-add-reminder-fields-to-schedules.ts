import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

    return Promise.all([
        queryInterface.addColumn("Schedules", "reminderDate", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }),
        queryInterface.addColumn("Schedules", "reminderMessage", {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
      }),
        queryInterface.addColumn("Schedules", "reminderSentAt", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }),
        queryInterface.addColumn("Schedules", "reminderStatus", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
      })
    ]);

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Schedules", "reminderDate"),
      queryInterface.removeColumn("Schedules", "reminderMessage"),
      queryInterface.removeColumn("Schedules", "reminderSentAt"),
      queryInterface.removeColumn("Schedules", "reminderStatus")
    ]);
  }
};
