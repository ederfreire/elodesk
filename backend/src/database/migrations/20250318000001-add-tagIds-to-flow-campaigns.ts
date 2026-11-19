import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("FlowCampaigns") as any;

    if (!tableDesc["tagIds"]) {


      await queryInterface.addColumn("FlowCampaigns", "tagIds", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: "JSON array of tag IDs that filter which contacts this campaign applies to"
    });


    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("FlowCampaigns", "tagIds");
  }
};
