'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
    await queryInterface.changeColumn('Whatsapps', 'expiresInactiveMessage', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
      } catch (err) {
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Whatsapps', 'expiresInactiveMessage', {
      type: Sequelize.STRING, 
      allowNull: true,
    });
  },
};
