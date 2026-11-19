import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Chatbots", "optFileId", {
      type: DataTypes.INTEGER,
      references: { model: "Files", key: "id" },
      defaultValue: null,
      allowNull: true
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Chatbots", "optFileId");
  }
};