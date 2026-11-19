import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Queues", "tempoRoteador", {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Queues", "tempoRoteador");
  }
};