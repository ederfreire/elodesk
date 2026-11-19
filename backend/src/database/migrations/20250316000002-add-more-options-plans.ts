import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Plans") as any;

    if (!tableDesc["useFlows"]) {


      await queryInterface.addColumn("Plans", "useFlows", {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    });


    }
    if (!tableDesc["useContacts"]) {

      await queryInterface.addColumn("Plans", "useContacts", {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    });

    }
    if (!tableDesc["useDashboard"]) {

      await queryInterface.addColumn("Plans", "useDashboard", {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    });

    }
    if (!tableDesc["useRealTime"]) {

      await queryInterface.addColumn("Plans", "useRealTime", {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    });

    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Plans", "useFlows");
    await queryInterface.removeColumn("Plans", "useContacts");
    await queryInterface.removeColumn("Plans", "useDashboard");
    await queryInterface.removeColumn("Plans", "useRealTime");
  }
};
