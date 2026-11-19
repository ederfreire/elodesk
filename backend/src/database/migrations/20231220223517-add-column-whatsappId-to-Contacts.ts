import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Contacts", "whatsappId", {
      type: DataTypes.INTEGER,
      references: { model: "Whatsapps", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Contacts", "whatsappId");
  }
};
