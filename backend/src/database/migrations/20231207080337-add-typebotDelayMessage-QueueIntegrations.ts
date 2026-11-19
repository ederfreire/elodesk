import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("QueueIntegrations", "typebotDelayMessage", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1000
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("QueueIntegrations", "typebotDelayMessage")
  
  }
};
