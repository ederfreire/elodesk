import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("QueueIntegrations", "urlN8N", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: true
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("QueueIntegrations", "urlN8N");
  }
};