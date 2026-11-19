import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.addColumn("Campaigns", "followUpDelay", {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      allowNull: false
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Campaigns", "followUpDelay");
  }
};
