import { QueryInterface, DataTypes } from "sequelize";
// Adicionar a coluna flowBuilderId na tabela Whatsapp

module.exports = {

  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Whatsapps", "timeAwaitActiveFlow", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    queryInterface.removeColumn("Whatsapps", "timeAwaitActiveFlow");
  }

}
