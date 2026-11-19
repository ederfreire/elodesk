import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Companies", "planId", {
      type: DataTypes.INTEGER,
      references: { model: "Plans", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Companies", "planId");
  }
};
