import { QueryInterface, DataTypes } from "sequelize";

/**
 * De qual empresa é cada URA de voz (17.11.2026).
 *
 * As URAs ficam guardadas no serviço do WhatsApp Plus (wacalls-chat), que o
 * sistema acessa com uma conta só — lá não existe separação por empresa.
 * Sem esta tabela, a tela de URA de uma empresa listava, editava e apagava
 * as URAs de todas as outras. Aqui fica o dono de cada uma.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("UrasDaEmpresa", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      flowId: { type: DataTypes.STRING, allowNull: false, unique: true },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("UrasDaEmpresa", ["companyId"], { name: "idx_uras_da_empresa_company" });
  },

  down: (queryInterface: QueryInterface) => queryInterface.dropTable("UrasDaEmpresa")
};
