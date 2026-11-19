import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Users") as any;

    if (!tableDesc["showSchedules"]) {


      await queryInterface.addColumn("Users", "showSchedules", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "enabled"
    });


    }
    if (!tableDesc["showKanban"]) {

      await queryInterface.addColumn("Users", "showKanban", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "enabled"
    });

    }
    if (!tableDesc["showInternalChat"]) {

      await queryInterface.addColumn("Users", "showInternalChat", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "enabled"
    });

    }
    if (!tableDesc["showOpenAi"]) {

      await queryInterface.addColumn("Users", "showOpenAi", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "enabled"
    });

    }
    if (!tableDesc["showIntegrations"]) {

      await queryInterface.addColumn("Users", "showIntegrations", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "enabled"
    });

    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "showSchedules");
    await queryInterface.removeColumn("Users", "showKanban");
    await queryInterface.removeColumn("Users", "showInternalChat");
    await queryInterface.removeColumn("Users", "showOpenAi");
    await queryInterface.removeColumn("Users", "showIntegrations");
  }
};
