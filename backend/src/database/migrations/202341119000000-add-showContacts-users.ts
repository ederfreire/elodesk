import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("Users", "showContacts", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "enabled"
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("Users", "showContacts");
 
  }
};
