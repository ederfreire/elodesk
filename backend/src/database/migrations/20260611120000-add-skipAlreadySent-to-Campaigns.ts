import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const table: any = await queryInterface.describeTable("Campaigns");
      if (!table.skipAlreadySent) {
        await queryInterface.addColumn("Campaigns", "skipAlreadySent", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        });
      }
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Campaigns", "skipAlreadySent");
  }
};
