import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

    return Promise.all([
      queryInterface.sequelize.query('DELETE FROM "Settings"'),
      queryInterface.removeConstraint("Settings", "Settings_pkey"),
        queryInterface.addColumn("Settings", "id", {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      })
    ]);

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.sequelize.query('DELETE FROM "Settings"'),
      queryInterface.removeColumn("Settings", "id"),
      queryInterface.addConstraint("Settings", ["key"], {
        type: "primary key",
        name: "Settings_pkey"
      })
    ]);
  }
};
