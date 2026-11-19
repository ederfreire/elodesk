import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("Companies", "generateInvoice", {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            allowNull: true
        })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

        return queryInterface.removeColumn("Companies", "generateInvoice");
 
  }
};
