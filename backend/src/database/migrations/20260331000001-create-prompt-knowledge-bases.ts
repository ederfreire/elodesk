import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      const existingTables = await queryInterface.showAllTables();
      if ((existingTables as string[]).includes("PromptKnowledgeBases")) return;

      await queryInterface.createTable("PromptKnowledgeBases", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false
        },
        type: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "text"
        },
        content: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        mediaUrl: {
          type: DataTypes.STRING,
          allowNull: true
        },
        mediaType: {
          type: DataTypes.STRING,
          allowNull: true
        },
        originalName: {
          type: DataTypes.STRING,
          allowNull: true
        },
        active: {
          type: DataTypes.BOOLEAN,
          defaultValue: true
        },
        promptId: {
          type: DataTypes.INTEGER,
          references: { model: "Prompts", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
          allowNull: false
        },
        companyId: {
          type: DataTypes.INTEGER,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
          allowNull: false
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false
        }
      });

      await queryInterface.addIndex("PromptKnowledgeBases", ["promptId"], {
        name: "idx_prompt_knowledge_bases_prompt_id"
      }).catch(() => {});

      await queryInterface.addIndex("PromptKnowledgeBases", ["companyId"], {
        name: "idx_prompt_knowledge_bases_company_id"
      }).catch(() => {});
    } catch (error) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    return queryInterface.dropTable("PromptKnowledgeBases");
  }
};
