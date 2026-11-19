import { QueryInterface, DataTypes } from "sequelize";

/**
 * Saudação para novos membros de grupo, configurada por grupo no Gestor de
 * Grupos.
 *
 * A chave é (companyId, whatsappId, groupJid): o mesmo grupo acessado por
 * duas conexões diferentes tem configurações independentes, do mesmo jeito
 * que os tickets já são independentes por conexão.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("GroupGreetings", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      whatsappId: {
        type: DataTypes.INTEGER,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      groupJid: {
        type: DataTypes.STRING,
        allowNull: false
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Onde a mensagem sai. Os dois podem estar ligados ao mesmo tempo.
      sendInGroup: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      sendInPrivate: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "group_greetings_company_whatsapp_jid_uniq"
        ON "GroupGreetings" ("companyId", "whatsappId", "groupJid");
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("GroupGreetings");
  }
};
