import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

    return Promise.all([
        queryInterface.addColumn("Queues", "schedules", {
        type: DataTypes.JSONB,
        defaultValue: []
      }),
        queryInterface.addColumn("Queues", "outOfHoursMessage", {
        type: DataTypes.TEXT,
        allowNull: true
      })
    ]);

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Queues", "schedules"),
      queryInterface.removeColumn("Queues", "outOfHoursMessage")
    ]);
  }
};
