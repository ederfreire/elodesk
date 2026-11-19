import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Users", "allowRealTime", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "disabled"
    }),
        queryInterface.addColumn("Users", "allowConnections", {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "disabled"
      });

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Users", "allowRealTime"),
      queryInterface.removeColumn("Users", "allowConnections");
  }
};
