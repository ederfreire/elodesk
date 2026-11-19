import { QueryInterface, DataTypes } from "sequelize";

/**
 * Dá ao Agente Comercial instruções de extração próprias.
 *
 * Até aqui, ExtractLeadDataService montava um texto fixo para todo agente. Com
 * este campo, cada agente pode ditar como a IA lê a conversa dele — o que faz
 * a extração usar as instruções do próprio agente. Vazio = comportamento
 * antigo (texto padrão), então nada quebra em agentes já existentes.
 *
 * templateId guarda de qual modelo o agente foi criado, para referência.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("SalesAgents", "extractionInstructions", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn("SalesAgents", "templateId", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("SalesAgents", "extractionInstructions");
    await queryInterface.removeColumn("SalesAgents", "templateId");
  }
};
