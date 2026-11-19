import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const indexes = [
      { name: "idx_messages_ticketid_mediaurl", cols: '"ticketId", "mediaUrl"' },
      { name: "idx_messages_ticketid_isdeleted_mediaurl", cols: '"ticketId", "isDeleted", "mediaUrl"' },
    ];

    for (const { name, cols } of indexes) {
      try {
        await (queryInterface as any).sequelize.query(
          `CREATE INDEX IF NOT EXISTS "${name}" ON "Messages" (${cols})`
        );
      } catch (err: any) {
      }
    }
  },

  down: async (queryInterface: QueryInterface) => {
    for (const name of [
      "idx_messages_ticketid_mediaurl",
      "idx_messages_ticketid_isdeleted_mediaurl",
    ]) {
      try {
        await (queryInterface as any).sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
      } catch (e) {}
    }
  }
};
