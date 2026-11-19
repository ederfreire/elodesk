import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Users") as any;

    if (!tableDesc["finalizacaoComValorVendaAtiva"]) {


      await queryInterface.addColumn("Users", "finalizacaoComValorVendaAtiva", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });


    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "finalizacaoComValorVendaAtiva");
  }
};
