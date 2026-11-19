import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Chatbots", "optUserId", {
      type: DataTypes.INTEGER,
      references: { model: "Users", key: "id" },
      defaultValue: null,
      allowNull: true
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Chatbots", "optUserId");
  }
};