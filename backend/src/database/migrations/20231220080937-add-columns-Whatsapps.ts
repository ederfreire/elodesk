import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("Whatsapps", "collectiveVacationEnd", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    }),
      queryInterface.addColumn("Whatsapps", "collectiveVacationMessage", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ""
    }),
      queryInterface.addColumn("Whatsapps", "collectiveVacationStart", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("Whatsapps", "collectiveVacationEnd"),
    queryInterface.removeColumn("Whatsapps", "collectiveVacationMessage"),
    queryInterface.removeColumn("Whatsapps", "collectiveVacationStart")
  
  }
};
