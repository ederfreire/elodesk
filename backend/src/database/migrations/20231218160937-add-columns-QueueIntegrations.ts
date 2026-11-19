import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("QueueIntegrations", "typebotKeywordRestart", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ""
    }),
      queryInterface.addColumn("QueueIntegrations", "typebotRestartMessage", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ""
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("QueueIntegrations", "typebotKeywordRestart"),
    queryInterface.removeColumn("QueueIntegrations", "typebotRestartMessage")
  
  }
};
