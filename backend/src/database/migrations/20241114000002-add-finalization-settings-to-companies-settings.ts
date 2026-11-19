import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("CompaniesSettings") as any;

    if (!tableDesc["informarValorVenda"]) {


      await queryInterface.addColumn("CompaniesSettings", "informarValorVenda", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });


    }

    if (!tableDesc["motivosFinalizacao"]) {


      await queryInterface.addColumn("CompaniesSettings", "motivosFinalizacao", {
      type: DataTypes.TEXT,
      allowNull: true
    });


    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn(
      "CompaniesSettings",
      "informarValorVenda"
    );
    await queryInterface.removeColumn(
      "CompaniesSettings",
      "motivosFinalizacao"
    );
  }
};
