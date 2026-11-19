import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.addColumn("CampaignShipping", "awaitingResponseSince", {
        type: DataTypes.DATE,
        allowNull: true
      });
    } catch (err: any) {
    }
    try {
      await queryInterface.addColumn("CampaignShipping", "followUpSentAt", {
        type: DataTypes.DATE,
        allowNull: true
      });
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CampaignShipping", "awaitingResponseSince");
    await queryInterface.removeColumn("CampaignShipping", "followUpSentAt");
  }
};
