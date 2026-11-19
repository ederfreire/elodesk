import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Users", "allowGroup", {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }),
      queryInterface.addColumn("Users", "defaultTheme", {
      type: DataTypes.STRING,
      defaultValue: "light",
      allowNull: false
    }),
      queryInterface.addColumn("Users", "defaultMenu", {
      type: DataTypes.STRING,
      defaultValue: "closed",
      allowNull: false
    });

        } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Users", "allowGroup"),
      queryInterface.removeColumn("Users", "defaultTheme"),
      queryInterface.removeColumn("Users", "defaultMenu"),
    ])
  }
};