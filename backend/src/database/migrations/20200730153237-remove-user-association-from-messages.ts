import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.removeColumn("Messages", "userId");
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

       queryInterface.addColumn("Messages", "userId", {
      type: DataTypes.INTEGER,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
 
  }
};
