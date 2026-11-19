import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Messages", "fromMe", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Messages", "fromMe");
  }
};
