import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Ensure NOT NULL is dropped on Prompts.queueId. Using raw SQL because
    // changeColumn with FK references can silently fail in some environments.
    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE "Prompts" ALTER COLUMN "queueId" DROP NOT NULL;'
      );
    } catch (err) {
    }
  },

  down: async () => {
    // No-op: keep nullable
  }
};