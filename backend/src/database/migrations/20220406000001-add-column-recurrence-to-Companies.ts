import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Companies", "recurrence", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ""
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Companies", "recurrence");
  }
};
