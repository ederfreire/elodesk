import { QueryInterface } from "sequelize";

/**
 * Índice em Contacts.utmLinkId.
 *
 * O Postgres NÃO cria índice automaticamente para chave estrangeira — só a
 * constraint. Sem ele, o relatório de anúncios varre a tabela de contatos
 * inteira para achar os que vieram de cada link.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.addIndex("Contacts", ["utmLinkId"], {
        name: "idx_contacts_utmlinkid"
      });
    } catch (err) {
      // Índice já existente não pode derrubar a migration.
    }

    try {
      await queryInterface.addIndex("Contacts", ["companyId", "leadSource"], {
        name: "idx_contacts_company_leadsource"
      });
    } catch (err) {
      // idem
    }
  },

  down: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.removeIndex("Contacts", "idx_contacts_utmlinkid");
    } catch (err) {
      // ignora
    }
    try {
      await queryInterface.removeIndex("Contacts", "idx_contacts_company_leadsource");
    } catch (err) {
      // ignora
    }
  }
};
