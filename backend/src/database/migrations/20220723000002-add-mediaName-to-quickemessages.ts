import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("QuickMessages", "mediaName", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("QuickMessages", "mediaName");
  }
};
