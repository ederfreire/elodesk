import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("Users", "defaultTicketsManagerWidth", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 550
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("Users", "defaultTicketsManagerWidth")
  
  }
};
