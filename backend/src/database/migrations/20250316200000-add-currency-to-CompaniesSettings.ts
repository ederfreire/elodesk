import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("CompaniesSettings", "currency", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "BRL",
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("CompaniesSettings", "currency");
  },
};
