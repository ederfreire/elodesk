import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return Promise.all([
      queryInterface.addIndex("Tickets", ["uuid"], {
        name: "tickets_uuid_idx"
      })
    ]);
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeIndex("Tickets", "tickets_uuid_idx"),
     ]);
  }
};
