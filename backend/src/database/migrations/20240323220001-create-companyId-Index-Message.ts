import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return Promise.all([
      queryInterface.addIndex("Messages", ["companyId"], {
        name: "idx_ms_company_id"
      })
    ]);
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeIndex("Messages", "idx_ms_company_id")
      ]);
  }
};
