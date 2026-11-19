import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const table = "Prompts";

      // Tornar queueId nullable (necessário quando transferência está desativada)
      await queryInterface.changeColumn(table, "queueId", {
        type: DataTypes.INTEGER,
        references: { model: "Queues", key: "id" },
        onUpdate: "NO ACTION",
        onDelete: "NO ACTION",
        allowNull: true
      }).catch(() => {});

      // Tornar apiKey nullable (pode ser configurado depois)
      await queryInterface.changeColumn(table, "apiKey", {
        type: DataTypes.TEXT,
        allowNull: true
      }).catch(() => {});

      // Tornar prompt nullable (pode ser configurado depois)
      await queryInterface.changeColumn(table, "prompt", {
        type: DataTypes.TEXT,
        allowNull: true
      }).catch(() => {});

      // Tornar voice nullable com default "texto"
      await queryInterface.changeColumn(table, "voice", {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: "texto"
      }).catch(() => {});

    } catch (err) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    // Não reverter - manter nullable
  }
};
