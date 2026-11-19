import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Messages", "contactId", {
      type: DataTypes.INTEGER,
      references: { model: "Contacts", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Messages", "contactId");
  }
};
