import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return queryInterface.addConstraint("Contacts", ["number", "companyId"], {
      type: "unique",
      name: "number_companyid_unique"
    });
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeConstraint(
      "Contacts",
      "number_companyid_unique"
    );
  }
};
