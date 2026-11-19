import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Tickets", "aiModel", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "gpt-4.1-mini"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tickets", "aiModel");
  }
};
