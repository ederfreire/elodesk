import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return queryInterface.addConstraint("Tickets", ["id", "contactId", "companyId", "whatsappId"], {
      type: "unique",
      name: "contactid_companyid_whatsappid_unique"
    });
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeConstraint(
      "Tickets",
      "contactid_companyid_whatsappid_unique"
    );
  }
};
