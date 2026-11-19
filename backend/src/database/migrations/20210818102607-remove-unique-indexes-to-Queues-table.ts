import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Usa SQL bruto com IF EXISTS para evitar "Unknown constraint error"
    // quando a constraint/índice já foi removido em uma execução anterior.
    const sql = `
      ALTER TABLE "Queues" DROP CONSTRAINT IF EXISTS "Queues_color_key";
      ALTER TABLE "Queues" DROP CONSTRAINT IF EXISTS "Queues_name_key";
      DROP INDEX IF EXISTS "Queues_color_key";
      DROP INDEX IF EXISTS "Queues_name_key";
    `;
    await queryInterface.sequelize.query(sql);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addConstraint("Queues", ["color"], {
        name: "Queues_color_key",
        type: 'unique'
      }),
      queryInterface.addConstraint("Queues", ["name"], {
        name: "Queues_name_key",
        type: 'unique'
      }),
    ]);
  }
};
