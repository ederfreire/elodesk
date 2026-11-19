import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Contacts", "pictureUpdated", {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Contacts", "pictureUpdated");
  }
};