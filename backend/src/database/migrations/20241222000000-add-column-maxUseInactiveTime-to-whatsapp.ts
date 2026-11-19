import { QueryInterface, DataTypes } from "sequelize";
// Adicionar a coluna flowBuilderId na tabela Whatsapp

module.exports = {

  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Whatsapps", "maxUseInactiveTime", {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    // Remover a coluna flowBuilderId da tabela Whatsapp
    queryInterface.removeColumn("Whatsapps", "maxUseInactiveTime");
  }

}
