import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

    return Promise.all([
        queryInterface.addColumn("TicketTraking", "ratingAt", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      }),
        queryInterface.addColumn("TicketTraking", "rated", {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      })
    ]);

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("TicketTraking", "ratingAt"),
      queryInterface.removeColumn("TicketTraking", "rated")
    ]);
  }
};
