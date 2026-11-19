import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Users") as any;

    if (!tableDesc["allowSeeMessagesInPendingTickets"]) {


      await queryInterface.addColumn("Users", "allowSeeMessagesInPendingTickets", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "enabled"
    });


    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "allowSeeMessagesInPendingTickets");
  }
};