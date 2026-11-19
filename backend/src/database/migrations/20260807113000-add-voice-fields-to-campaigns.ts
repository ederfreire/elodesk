import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addColumn("Campaigns", "voiceFlowId", {
        type: DataTypes.STRING,
        allowNull: true
      }),
      queryInterface.addColumn("Campaigns", "callMode", {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "text"
      })
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Campaigns", "voiceFlowId"),
      queryInterface.removeColumn("Campaigns", "callMode")
    ]);
  }
};
