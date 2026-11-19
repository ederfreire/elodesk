import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Users", "userClosePendingTicket", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "enabled"
    }),
        queryInterface.addColumn("Users", "showDashboard", {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "disabled"
      });

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Users", "userClosePendingTicket"),
      queryInterface.removeColumn("Users", "showDashboard");
  }
};
