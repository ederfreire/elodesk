import { QueryInterface, DataTypes } from "sequelize";

/**
 * Regras de reação automática por palavra-chave.
 *
 * Antes existia um emoji único, aplicado a toda mensagem recebida. Com as
 * regras, a empresa cadastra listas de palavras ("bom dia", "obrigado") e um
 * conjunto de emojis para cada uma — o sistema sorteia um emoji do conjunto,
 * o que evita responder sempre igual.
 *
 * Formato: [{ keywords: string[], emojis: string[] }]
 * O emoji único (autoReactionEmoji) continua como reserva para quando nenhuma
 * regra casar, então nada muda para quem já usava.
 */
module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.addColumn("CompaniesSettings", "autoReactionRules", {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
    }),

  down: (queryInterface: QueryInterface) =>
    queryInterface.removeColumn("CompaniesSettings", "autoReactionRules")
};
