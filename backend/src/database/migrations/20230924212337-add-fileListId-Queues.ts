import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("Queues", "fileListId", {
      type: DataTypes.INTEGER,
      references: { model: "Files", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("Queues", "fileListId")
  
  }
};
