import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const campaignTable: any = await queryInterface.describeTable("Campaigns");
      if (!campaignTable.whatsappRotation) {
        await queryInterface.addColumn("Campaigns", "whatsappRotation", {
          type: DataTypes.TEXT,
          allowNull: true
        });
      }
    } catch (err: any) {
    }

    try {
      const shippingTable: any = await queryInterface.describeTable(
        "CampaignShipping"
      );
      if (!shippingTable.whatsappId) {
        await queryInterface.addColumn("CampaignShipping", "whatsappId", {
          type: DataTypes.INTEGER,
          allowNull: true
        });
      }
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Campaigns", "whatsappRotation");
    await queryInterface.removeColumn("CampaignShipping", "whatsappId");
  }
};
