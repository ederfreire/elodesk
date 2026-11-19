import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("Campaigns", "openTicket", {
      type: DataTypes.STRING,
      defaultValue: "disabled"
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("Campaigns", "openTicket")
  
  }
};
