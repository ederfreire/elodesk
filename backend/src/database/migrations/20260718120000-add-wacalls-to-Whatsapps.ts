import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.addColumn("Whatsapps", "wacallsSessionId", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });
  },
  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Whatsapps", "wacallsSessionId");
  }
};
