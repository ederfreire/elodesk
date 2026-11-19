import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return Promise.all([
      queryInterface.addIndex("Messages", ["wid"], {
        name: "idx_messages_wid"
      }),
    ]);
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeIndex("Messages", "idx_messages_wid")
    ]);
  }
};
