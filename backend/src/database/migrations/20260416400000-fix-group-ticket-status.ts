import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.sequelize.query(
        `UPDATE "Tickets" SET "status" = 'group' WHERE "isGroup" = true AND "status" IN ('pending','open')`
      );
    } catch (err: any) {
    }
  },

  down: async () => {
    // No-op: do not revert group tickets back to pending automatically
    return Promise.resolve();
  }
};
