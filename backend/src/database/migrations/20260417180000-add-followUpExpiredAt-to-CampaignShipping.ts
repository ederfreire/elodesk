import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.addColumn("CampaignShipping", "followUpExpiredAt", {
        type: DataTypes.DATE,
        allowNull: true
      });
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CampaignShipping", "followUpExpiredAt");
  }
};
