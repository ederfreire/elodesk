import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("Plans", "useTelegram", {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      });
    } catch (e) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Plans", "useTelegram");
  }
};
