import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.sequelize.query(`
        UPDATE \"Tickets\" AS t
        SET \"status\" = 'group'
        FROM \"Contacts\" AS c
        WHERE c.id = t.\"contactId\"
          AND t.\"status\" IN ('pending', 'open')
          AND (
            t.\"isGroup\" = true
            OR c.\"isGroup\" = true
            OR c.\"remoteJid\" LIKE '%@g.us'
          )
      `);
    } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE \"Tickets\" AS t
      SET \"status\" = 'pending'
      FROM \"Contacts\" AS c
      WHERE c.id = t.\"contactId\"
        AND t.\"status\" = 'group'
        AND (
          t.\"isGroup\" = true
          OR c.\"isGroup\" = true
          OR c.\"remoteJid\" LIKE '%@g.us'
        )
    `);
  }
};
