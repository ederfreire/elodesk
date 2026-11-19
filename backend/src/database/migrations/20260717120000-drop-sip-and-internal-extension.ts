import { QueryInterface, DataTypes } from "sequelize";

/**
 * Remove definitivamente toda a infraestrutura SIP + ramais internos Janus:
 * - Dropa a tabela SipSettings
 * - Remove colunas de telefonia dos Users:
 *   sipExtension, internalExtension, sipPasswordEncrypted, sipFollowMe, sipStatus
 *
 * Reversível no down (recria estrutura mínima) — mas SEM dados.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // 1) Dropa a tabela SipSettings (cascata para eventuais FKs órfãs)
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "SipSettings" CASCADE;`);

    // 2) Remove colunas de telefonia dos Users (idempotente)
    const dropCols = [
      "sipExtension",
      "internalExtension",
      "sipPasswordEncrypted",
      "sipFollowMe",
      "sipStatus"
    ];
    for (const col of dropCols) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "Users" DROP COLUMN IF EXISTS "${col}";`
      );
    }
  },

  down: async (queryInterface: QueryInterface) => {
    // Recria apenas o esqueleto mínimo, sem dados
    await queryInterface.addColumn("Users", "sipExtension", {
      type: DataTypes.STRING,
      allowNull: true
    });
    await queryInterface.addColumn("Users", "internalExtension", {
      type: DataTypes.STRING,
      allowNull: true
    });
    await queryInterface.addColumn("Users", "sipPasswordEncrypted", {
      type: DataTypes.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn("Users", "sipFollowMe", {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    });
    await queryInterface.addColumn("Users", "sipStatus", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "offline"
    });
    await queryInterface.createTable("SipSettings", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      companyId: { type: DataTypes.INTEGER, allowNull: false },
      enabled: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      sipDomain: DataTypes.STRING,
      wssUrl: DataTypes.STRING,
      sipUser: DataTypes.STRING,
      sipPasswordEncrypted: DataTypes.TEXT,
      displayName: DataTypes.STRING,
      outboundPrefix: { type: DataTypes.STRING, defaultValue: "" },
      stunServer: { type: DataTypes.STRING, defaultValue: "stun:stun.l.google.com:19302" },
      followMeWebhookUrl: DataTypes.STRING,
      followMeWebhookToken: DataTypes.STRING,
      janusWssUrl: DataTypes.STRING,
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
  }
};
