import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("CompaniesSettings", "closeTicketOnTransfer", {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: true,

    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("CompaniesSettings", "closeTicketOnTransfer");
  }
};
