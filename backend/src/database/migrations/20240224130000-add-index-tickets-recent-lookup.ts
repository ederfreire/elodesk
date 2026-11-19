import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return queryInterface.addIndex("Tickets", ["contactId", "companyId", "updatedAt"], {
      name: "tickets_contact_company_updatedat_idx"
    });
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeIndex("Tickets", "tickets_contact_company_updatedat_idx");
  }
};
