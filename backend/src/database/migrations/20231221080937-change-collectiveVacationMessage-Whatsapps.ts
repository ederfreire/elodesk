import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    await queryInterface.changeColumn('Whatsapps', 'collectiveVacationMessage', {
      type: DataTypes.TEXT,
    })
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.changeColumn('Whatsapps', 'collectiveVacationMessage', {
      type: DataTypes.STRING,
    })
  }
};

