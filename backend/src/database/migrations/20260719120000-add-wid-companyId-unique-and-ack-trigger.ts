import { QueryInterface } from "sequelize";

/**
 * Reforça a deduplicação de mensagens por (wid, companyId) via índice único
 * parcial e garante monotonicidade do ack via trigger BEFORE UPDATE.
 *
 * - Índice parcial: só aplica quando wid IS NOT NULL para não conflitar com
 *   linhas antigas sem wid.
 * - Trigger: se o NEW.ack for menor que OLD.ack, mantém o valor antigo
 *   (não regride). Só age quando a coluna ack está sendo alterada.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;

    // 1) Índice único parcial para dedupe wid+companyId
    try {
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "messages_wid_companyId_uniq"
        ON "Messages" ("wid", "companyId")
        WHERE "wid" IS NOT NULL;
      `);
    } catch (err: any) {
    }

    // 2) Trigger de monotonicidade de ack
    try {
      await sequelize.query(`
        CREATE OR REPLACE FUNCTION enforce_messages_ack_monotonic()
        RETURNS trigger AS $$
        BEGIN
          IF NEW."ack" IS NULL THEN
            NEW."ack" := OLD."ack";
          ELSIF OLD."ack" IS NOT NULL AND NEW."ack" < OLD."ack" THEN
            NEW."ack" := OLD."ack";
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await sequelize.query(`DROP TRIGGER IF EXISTS trg_messages_ack_monotonic ON "Messages";`);
      await sequelize.query(`
        CREATE TRIGGER trg_messages_ack_monotonic
        BEFORE UPDATE OF "ack" ON "Messages"
        FOR EACH ROW
        EXECUTE FUNCTION enforce_messages_ack_monotonic();
      `);
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`DROP TRIGGER IF EXISTS trg_messages_ack_monotonic ON "Messages";`);
    await sequelize.query(`DROP FUNCTION IF EXISTS enforce_messages_ack_monotonic();`);
    await sequelize.query(`DROP INDEX IF EXISTS "messages_wid_companyId_uniq";`);
  }
};
