import { QueryInterface, DataTypes, Sequelize } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

    return Promise.all([
      queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'),
        queryInterface.addColumn("Tickets", "uuid", {
        type: DataTypes.UUID,
        allowNull: true,
        //defaultValue: Sequelize.literal('uuid_generate_v4()')
        defaultValue: require('sequelize').UUIDV4,
      })
    ]);

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tickets", "uuid");
  }
};
