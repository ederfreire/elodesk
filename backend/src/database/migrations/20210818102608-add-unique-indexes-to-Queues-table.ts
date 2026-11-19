import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return Promise.all([
      queryInterface.addConstraint("Queues", ["color", "companyId"], {
        name: "Queues_color_key",
        type: 'unique'
      }),
      queryInterface.addConstraint("Queues", ["name", "companyId"], {
        name: "Queues_name_key",
        type: 'unique'
      }),
    ]);
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeConstraint("Queues", "Queues_color_key"),
      queryInterface.removeConstraint("Queues", "Queues_name_key"),
    ]);
  }
};
