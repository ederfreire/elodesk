module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE "Versions" SET "versionFrontend" = '8.0', "versionBackend" = '8.0', "updatedAt" = NOW() WHERE id = 1;
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE "Versions" SET "versionFrontend" = '6.0', "versionBackend" = '6.0', "updatedAt" = NOW() WHERE id = 1;
    `);
  }
};
