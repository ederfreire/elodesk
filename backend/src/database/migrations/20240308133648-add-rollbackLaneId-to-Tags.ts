import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Tags", "rollbackLaneId", {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: true
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tags", "rollbackLaneId");
  }
};