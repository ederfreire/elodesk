import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Tickets", "fromMe", {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }),
      queryInterface.addColumn("Tickets", "sendInactiveMessage", {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }),
      queryInterface.addColumn("Tickets", "amountUsedBotQueuesNPS", {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    });

        } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Tickets", "fromMe"),
      queryInterface.removeColumn("Tickets", "sendInactiveMessage"),
      queryInterface.removeColumn("Tickets", "amountUsedBotQueuesNPS"),
    ])
  }
};