import { QueryInterface, DataTypes } from "sequelize";

// Links UTM e Agentes Comerciais viram opções próprias do plano. Antes só
// apareciam com "Campanhas" ligado. Padrão ligado: quem já tinha continua
// tendo.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tabela: any = await queryInterface.describeTable("Plans");
    if (!tabela.useUtmLinks) {
      await queryInterface.addColumn("Plans", "useUtmLinks", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
    if (!tabela.useSalesAgents) {
      await queryInterface.addColumn("Plans", "useSalesAgents", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Plans", "useUtmLinks");
    await queryInterface.removeColumn("Plans", "useSalesAgents");
  }
};
