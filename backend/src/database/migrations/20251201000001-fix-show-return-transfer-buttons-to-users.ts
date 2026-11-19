import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const tableDesc = await queryInterface.describeTable("Users") as any;

      if (tableDesc["showReturnAndTransferButtons"]) {
        await queryInterface.removeColumn("Users", "showReturnAndTransferButtons");
      }

      if (!tableDesc["showReturnQueueButton"]) {
        await queryInterface.addColumn("Users", "showReturnQueueButton", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true
        });
      }

      if (!tableDesc["showTransferTicketButton"]) {
        await queryInterface.addColumn("Users", "showTransferTicketButton", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true
        });
      }
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    try {
      const tableDesc = await queryInterface.describeTable("Users") as any;

      await queryInterface.removeColumn("Users", "showReturnQueueButton");
      await queryInterface.removeColumn("Users", "showTransferTicketButton");

      if (!tableDesc["showReturnAndTransferButtons"]) {
        await queryInterface.addColumn("Users", "showReturnAndTransferButtons", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true
        });
      }
    } catch (err: any) {
    }
  }
};
