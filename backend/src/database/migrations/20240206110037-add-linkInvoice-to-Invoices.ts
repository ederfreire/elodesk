import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("Invoices", "linkInvoice", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: ""
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("Invoices", "linkInvoice")
  
  }
};
