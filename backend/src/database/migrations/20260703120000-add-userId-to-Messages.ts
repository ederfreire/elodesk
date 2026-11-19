import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Messages");
    if (!table.userId) {
      await queryInterface.addColumn("Messages", "userId", {
        type: DataTypes.INTEGER,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Messages");
    if (table.userId) {
      await queryInterface.removeColumn("Messages", "userId");
    }
  }
};
