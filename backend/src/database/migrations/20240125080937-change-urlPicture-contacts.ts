import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    await queryInterface.changeColumn('Contacts', 'urlPicture', {
      type: DataTypes.TEXT,
    })
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.changeColumn('Contacts', 'urlPicture', {
      type: DataTypes.STRING,
    })
  }
};

