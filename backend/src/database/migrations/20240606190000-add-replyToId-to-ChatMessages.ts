"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
    await queryInterface.addColumn("ChatMessages", "replyToId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "ChatMessages",
        key: "id"
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
      } catch (err) {
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("ChatMessages", "replyToId");
  }
};
