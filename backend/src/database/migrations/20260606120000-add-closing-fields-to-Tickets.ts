import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Tickets");

    if (!table.closingSubject) {
      await queryInterface.addColumn("Tickets", "closingSubject", {
        type: DataTypes.STRING,
        allowNull: true
      });
    }

    if (!table.closingSummary) {
      await queryInterface.addColumn("Tickets", "closingSummary", {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Tickets");

    if (table.closingSubject) {
      await queryInterface.removeColumn("Tickets", "closingSubject");
    }

    if (table.closingSummary) {
      await queryInterface.removeColumn("Tickets", "closingSummary");
    }
  }
};
