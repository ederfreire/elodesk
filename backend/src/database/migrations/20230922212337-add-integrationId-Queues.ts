import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    await queryInterface.addColumn("Queues", "integrationId", {
      type: DataTypes.INTEGER,
      references: { model: "QueueIntegrations", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    }),
    queryInterface.addColumn("Whatsapps", "integrationId", {
      type: DataTypes.INTEGER,
      references: { model: "QueueIntegrations", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    })
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Queues", "integrationId"),
    queryInterface.removeColumn("Whatsapps", "integrationId");
  }
};