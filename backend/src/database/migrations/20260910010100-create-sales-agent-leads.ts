import { QueryInterface, DataTypes } from "sequelize";

/**
 * O que o agente apurou de cada atendimento.
 *
 * Uma linha por ticket. É daqui que saem os relatórios de intenção e o painel
 * gerencial — sem essa tabela, a informação ficaria só dentro da conversa e
 * não daria para agregar.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("SalesAgentLeads", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },

      salesAgentId: {
        type: DataTypes.INTEGER,
        references: { model: "SalesAgents", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      ticketId: {
        type: DataTypes.INTEGER,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      contactId: {
        type: DataTypes.INTEGER,
        references: { model: "Contacts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },

      // O que foi apurado na conversa.
      product: { type: DataTypes.STRING, allowNull: true },
      value: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      paymentMethod: { type: DataTypes.STRING, allowNull: true },
      purchaseTerm: { type: DataTypes.STRING, allowNull: true },
      city: { type: DataTypes.STRING, allowNull: true },

      // novo | curioso | pesquisando | interessado | qualificado | quente |
      // pronto | sem_interesse
      intent: { type: DataTypes.STRING, allowNull: true },
      // frio | morno | quente
      temperature: { type: DataTypes.STRING, allowNull: true },

      // pendente | qualificado | desqualificado | em_maturacao
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "pendente" },

      objections: { type: DataTypes.JSONB, allowNull: true },
      // Campos personalizados definidos em SalesAgents.requiredFields.
      extraData: { type: DataTypes.JSONB, allowNull: true },

      qualifiedAt: { type: DataTypes.DATE, allowNull: true },
      transferredAt: { type: DataTypes.DATE, allowNull: true },
      scheduledAt: { type: DataTypes.DATE, allowNull: true },
      meetLink: { type: DataTypes.STRING, allowNull: true },

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

    // Um registro por ticket: se o agente reprocessar a conversa, atualiza em
    // vez de criar linha nova — senão o relatório contaria o mesmo lead
    // várias vezes.
    await queryInterface.addIndex("SalesAgentLeads", ["ticketId"], {
      name: "idx_salesagentleads_ticket",
      unique: true
    });
    await queryInterface.addIndex("SalesAgentLeads", ["companyId", "status"], {
      name: "idx_salesagentleads_company_status"
    });
    await queryInterface.addIndex("SalesAgentLeads", ["companyId", "createdAt"], {
      name: "idx_salesagentleads_company_created"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("SalesAgentLeads");
  }
};
