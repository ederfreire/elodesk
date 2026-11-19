import { QueryInterface, DataTypes } from "sequelize";
//
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Whatsapps", "greetingMediaAttachment", {
      type: DataTypes.STRING,
      defaultValue: null
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Whatsapps", "greetingMediaAttachment");
  }
};
