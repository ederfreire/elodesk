import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

    return Promise.all([
        queryInterface.addColumn("Whatsapps", "sentMessages", {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
      }),
        queryInterface.addColumn("Whatsapps", "receivedMessages", {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
      }),
        queryInterface.addColumn("Whatsapps", "activeTickets", {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
      }),
        queryInterface.addColumn("Whatsapps", "dailyLimit", {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
      })
    ]);

          } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Whatsapps", "sentMessages"),
      queryInterface.removeColumn("Whatsapps", "receivedMessages"),
      queryInterface.removeColumn("Whatsapps", "activeTickets"),
      queryInterface.removeColumn("Whatsapps", "dailyLimit")
    ]);
  }
};
