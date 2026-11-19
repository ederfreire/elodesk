import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    await queryInterface.renameColumn("Whatsapps", "default", "isDefault");
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.renameColumn("Whatsapps", "isDefault", "default");
  }
};
