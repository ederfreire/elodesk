import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (!table.acceptanceMessage) {
      await queryInterface.addColumn("Users", "acceptanceMessage", {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: ""
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (table.acceptanceMessage) {
      await queryInterface.removeColumn("Users", "acceptanceMessage");
    }
  }
};