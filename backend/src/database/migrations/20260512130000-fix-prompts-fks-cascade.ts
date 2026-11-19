import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;
    try {
      // Garante que queueId pode ser nulo (necessário para SET NULL)
      await sequelize.query(
        'ALTER TABLE "Prompts" ALTER COLUMN "queueId" DROP NOT NULL'
      );
    } catch (err: any) {
    }

    try {
      // Recria FK companyId com ON DELETE CASCADE
      await sequelize.query(
        'ALTER TABLE "Prompts" DROP CONSTRAINT IF EXISTS "Prompts_companyId_fkey"'
      );
      await sequelize.query(
        'ALTER TABLE "Prompts" ADD CONSTRAINT "Prompts_companyId_fkey" ' +
          'FOREIGN KEY ("companyId") REFERENCES "Companies"("id") ' +
          'ON UPDATE CASCADE ON DELETE CASCADE'
      );
    } catch (err: any) {
    }

    try {
      // Recria FK queueId com ON DELETE SET NULL
      await sequelize.query(
        'ALTER TABLE "Prompts" DROP CONSTRAINT IF EXISTS "Prompts_queueId_fkey"'
      );
      await sequelize.query(
        'ALTER TABLE "Prompts" ADD CONSTRAINT "Prompts_queueId_fkey" ' +
          'FOREIGN KEY ("queueId") REFERENCES "Queues"("id") ' +
          'ON UPDATE CASCADE ON DELETE SET NULL'
      );
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;
    try {
      await sequelize.query(
        'ALTER TABLE "Prompts" DROP CONSTRAINT IF EXISTS "Prompts_companyId_fkey"'
      );
      await sequelize.query(
        'ALTER TABLE "Prompts" ADD CONSTRAINT "Prompts_companyId_fkey" ' +
          'FOREIGN KEY ("companyId") REFERENCES "Companies"("id") ' +
          'ON UPDATE NO ACTION ON DELETE NO ACTION'
      );
      await sequelize.query(
        'ALTER TABLE "Prompts" DROP CONSTRAINT IF EXISTS "Prompts_queueId_fkey"'
      );
      await sequelize.query(
        'ALTER TABLE "Prompts" ADD CONSTRAINT "Prompts_queueId_fkey" ' +
          'FOREIGN KEY ("queueId") REFERENCES "Queues"("id") ' +
          'ON UPDATE NO ACTION ON DELETE NO ACTION'
      );
    } catch (err: any) {
    }
  }
};
