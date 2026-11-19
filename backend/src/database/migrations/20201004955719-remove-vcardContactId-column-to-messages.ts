import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.removeColumn("Messages", "vcardContactId");
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {

       queryInterface.addColumn("Messages", "vcardContactId", {
      type: DataTypes.INTEGER,
      references: { model: "Contacts", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE"
    });
 
  }
};
