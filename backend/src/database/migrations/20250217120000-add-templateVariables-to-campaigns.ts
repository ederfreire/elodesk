import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Campaigns", "templateVariables", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Campaigns", "templateVariables");
  }
};
