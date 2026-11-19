import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Tickets", "isBot", {
      type: DataTypes.BOOLEAN
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tickets", "isBot");
  }
};
