import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Messages", "isForwarded", {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Messages", "isForwarded");
  }
};
