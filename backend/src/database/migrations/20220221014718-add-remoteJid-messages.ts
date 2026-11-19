import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Messages", "remoteJid", {
      type: DataTypes.TEXT
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Messages", "remoteJid");
  }
};
