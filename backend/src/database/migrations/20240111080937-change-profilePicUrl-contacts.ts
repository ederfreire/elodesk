import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    await queryInterface.changeColumn('Contacts', 'profilePicUrl', {
      type: DataTypes.TEXT,
    })
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.changeColumn('Contacts', 'profilePicUrl', {
      type: DataTypes.STRING,
    })
  }
};

