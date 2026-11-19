import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("UtmLinks", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },

      // Parametros UTM padrao. Ficam em colunas separadas (e nao numa URL
      // pronta) para o relatorio poder agrupar por qualquer um deles.
      source: { type: DataTypes.STRING, allowNull: false },
      medium: { type: DataTypes.STRING, allowNull: true },
      campaign: { type: DataTypes.STRING, allowNull: true },
      content: { type: DataTypes.STRING, allowNull: true },
      term: { type: DataTypes.STRING, allowNull: true },

      // Destino: numero de WhatsApp e mensagem pre-preenchida do wa.me
      whatsappNumber: { type: DataTypes.STRING, allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: true },

      // Codigo curto embutido na mensagem do wa.me. E por ele que a primeira
      // mensagem do lead e ligada ao anuncio.
      code: { type: DataTypes.STRING, allowNull: false, unique: true },

      clicks: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
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

    await queryInterface.addColumn("Contacts", "utmLinkId", {
      type: DataTypes.INTEGER,
      references: { model: "UtmLinks", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Contacts", "utmLinkId");
    await queryInterface.dropTable("UtmLinks");
  }
};
