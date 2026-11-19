import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Contacts", "remoteJid", {
      type: DataTypes.STRING,
      defaultValue: null,
      allowNull: true
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Contacts", "remoteJid");
  }
};