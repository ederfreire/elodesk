import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `UPDATE "Whatsapps" SET "status" = 'CONNECTED' WHERE "channel" = 'webchat'`
    );
  },
  down: async () => {
    // no-op
  }
};