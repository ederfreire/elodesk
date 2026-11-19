import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      queryInterface.addColumn("CompaniesSettings", "transferMessage", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: ""
    }),
      queryInterface.addColumn("CompaniesSettings", "greetingAcceptedMessage", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: ""
    }),
      queryInterface.addColumn("CompaniesSettings", "AcceptCallWhatsappMessage", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: ""
    }),
      queryInterface.addColumn("CompaniesSettings", "sendQueuePositionMessage", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: ""
    })
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

    return queryInterface.removeColumn("CompaniesSettings", "transferMessage"),
    queryInterface.removeColumn("CompaniesSettings", "greetingAcceptedMessage"),
    queryInterface.removeColumn("CompaniesSettings", "AcceptCallWhatsappMessage"),
    queryInterface.removeColumn("CompaniesSettings", "sendQueuePositionMessage")
  
  }
};
