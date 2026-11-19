import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("CompaniesSettings", "autoReaction", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await queryInterface.addColumn("CompaniesSettings", "autoReactionEmoji", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "👍"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CompaniesSettings", "autoReaction");
    await queryInterface.removeColumn("CompaniesSettings", "autoReactionEmoji");
  }
};
