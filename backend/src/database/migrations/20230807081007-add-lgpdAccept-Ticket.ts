import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Tickets", "lgpdAcceptedAt", {
      type: DataTypes.DATE,
      defaultValue: null,
      allowNull: true
    }),
      queryInterface.addColumn("Tickets", "lgpdSendMessageAt", {
      type: DataTypes.DATE,
      defaultValue: null,
      allowNull: true
    });

        } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tickets", "lgpdAcceptedAt"),
    queryInterface.removeColumn("Tickets", "lgpdSendMessageAt");
  }
};