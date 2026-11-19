import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return Promise.all([
      queryInterface.addIndex("Tickets", ["contactId", "companyId", "status"], {
        name: "tickets_contact_company_status_idx"
      }),
      queryInterface.addIndex("Tickets", ["contactId", "companyId", "whatsappId", "status"], {
        name: "tickets_contact_company_whatsapp_status_idx"
      })
    ]);
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeIndex("Tickets", "tickets_contact_company_status_idx"),
      queryInterface.removeIndex("Tickets", "tickets_contact_company_whatsapp_status_idx")
    ]);
  }
};
