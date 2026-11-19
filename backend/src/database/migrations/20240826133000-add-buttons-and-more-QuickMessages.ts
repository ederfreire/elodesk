import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("QuickMessageComponents", "buttons", {
      type: DataTypes.STRING,
      allowNull: true
    }),
      queryInterface.addColumn("QuickMessageComponents", "format", {
      type: DataTypes.STRING,
      allowNull: true
    }),
      queryInterface.addColumn("QuickMessageComponents", "example", {
      type: DataTypes.STRING,
      allowNull: true
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("QuickMessageComponents", "buttons"),
    queryInterface.removeColumn("QuickMessageComponents", "format"),
    queryInterface.removeColumn("QuickMessageComponents", "example")
  
  }
};
