import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

    return Promise.all([
        queryInterface.addColumn("Companies", "status", {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }),
        queryInterface.addColumn("Companies", "schedules", {
        type: DataTypes.JSONB,
        defaultValue: []
      })
    ]);

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Companies", "schedules"),
      queryInterface.removeColumn("Companies", "status")
    ]);
  }
};
