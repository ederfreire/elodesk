import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Contacts", "email", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: ""
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Contacts", "email");
  }
};
