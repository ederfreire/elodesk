import { QueryInterface, DataTypes } from "sequelize";

/**
 * Agente Comercial — configuração.
 *
 * Tabela separada do `Prompts` de propósito. O Prompt existe para conversar;
 * este agente existe para CONDUZIR UM PROCESSO comercial — qualificar,
 * etiquetar, mover no funil, agendar e encaminhar. Misturar as duas coisas na
 * mesma tabela deixaria o cadastro de IA cheio de campos que a maioria dos
 * usuários nunca preenche.
 *
 * O vínculo com o Prompt é opcional: o agente comercial usa a conversa de um
 * prompt existente e adiciona o processo por cima.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("SalesAgents", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      // Conversa: reaproveita um Prompt já cadastrado.
      promptId: {
        type: DataTypes.INTEGER,
        references: { model: "Prompts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },

      // O que o agente precisa descobrir antes de considerar o lead
      // qualificado. JSON para a lista ser configurável sem migration nova:
      // [{ key: "produto", label: "Produto", required: true, type: "text" }]
      requiredFields: { type: DataTypes.JSONB, allowNull: true },

      // Faixa de valor que separa lead qualificado de fora do perfil.
      minValue: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      maxValue: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

      // AÇÕES AO QUALIFICAR — cada uma opcional e independente.
      qualifiedTagId: {
        type: DataTypes.INTEGER,
        references: { model: "Tags", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      qualifiedKanbanTagId: {
        type: DataTypes.INTEGER,
        references: { model: "Tags", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      qualifiedQueueId: {
        type: DataTypes.INTEGER,
        references: { model: "Queues", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      qualifiedUserId: {
        type: DataTypes.INTEGER,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      transferOnQualify: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      // AÇÕES AO DESQUALIFICAR
      disqualifiedTagId: {
        type: DataTypes.INTEGER,
        references: { model: "Tags", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      disqualifiedKanbanTagId: {
        type: DataTypes.INTEGER,
        references: { model: "Tags", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },

      // AGENDAMENTO
      schedulingEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      googleCalendarId: { type: DataTypes.STRING, allowNull: true },
      createMeetLink: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      eventDurationMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },

      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("SalesAgents", ["companyId"], {
      name: "idx_salesagents_company"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("SalesAgents");
  }
};
