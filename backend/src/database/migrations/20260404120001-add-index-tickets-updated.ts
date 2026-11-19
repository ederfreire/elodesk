import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.addIndex("Tickets", ["contactId", "companyId", "whatsappId", "updatedAt"], {
        name: "tickets_contact_company_whatsapp_updated_idx"
      });
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.removeIndex("Tickets", "tickets_contact_company_whatsapp_updated_idx");
    } catch (err: any) {
    }
  }
};
