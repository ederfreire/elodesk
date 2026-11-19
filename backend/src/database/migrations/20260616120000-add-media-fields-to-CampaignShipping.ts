import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.addColumn("CampaignShipping", "mediaPath", {
        type: DataTypes.STRING,
        allowNull: true
      });
    } catch (err: any) {
    }
    try {
      await queryInterface.addColumn("CampaignShipping", "mediaName", {
        type: DataTypes.STRING,
        allowNull: true
      });
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CampaignShipping", "mediaPath");
    await queryInterface.removeColumn("CampaignShipping", "mediaName");
  }
};
