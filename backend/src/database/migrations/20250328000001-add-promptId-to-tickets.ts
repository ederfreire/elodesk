import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Tickets", "promptId", {
      type: DataTypes.INTEGER,
      references: { model: "Prompts", key: "id" },
      defaultValue: null,
      allowNull: true
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tickets", "promptId");
  }
};
