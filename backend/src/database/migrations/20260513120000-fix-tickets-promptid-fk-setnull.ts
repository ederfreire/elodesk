import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.sequelize.query(`
        DO $$
        DECLARE
          fk_name text;
        BEGIN
          SELECT con.conname INTO fk_name
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          WHERE rel.relname = 'Tickets'
            AND con.contype = 'f'
            AND pg_get_constraintdef(con.oid) ILIKE '%REFERENCES "Prompts"%';

          IF fk_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE "Tickets" DROP CONSTRAINT %I', fk_name);
          END IF;

          ALTER TABLE "Tickets"
            ADD CONSTRAINT "Tickets_promptId_fkey"
            FOREIGN KEY ("promptId") REFERENCES "Prompts"("id")
            ON UPDATE CASCADE ON DELETE SET NULL;
        END $$;
      `);
    } catch (err: any) {
    }
  },

  down: async () => Promise.resolve()
};