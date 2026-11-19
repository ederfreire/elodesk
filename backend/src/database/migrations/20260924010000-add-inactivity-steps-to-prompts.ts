import { QueryInterface, DataTypes } from "sequelize";

/**
 * Cadência de inatividade: mensagens diferentes em tempos diferentes.
 *
 * Formato: [{ minutes: 15, message: "Ainda está aí?" },
 *           { minutes: 120, message: "Vou encerrar por aqui." }]
 *
 * `minutes` conta a partir do evento anterior. Os campos antigos
 * (inactivityTimeout / inactivityMessage / inactivityMaxReminders) continuam
 * existindo e valem quando não há etapas — quem já usava não é afetado.
 */
module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.addColumn("Prompts", "inactivitySteps", {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null
    }),

  down: (queryInterface: QueryInterface) =>
    queryInterface.removeColumn("Prompts", "inactivitySteps")
};
