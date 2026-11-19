import { QueryInterface, DataTypes } from "sequelize";
// Adicionar a coluna flowBuilderId na tabela Whatsapp

module.exports = {

  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Tickets", "maxUseInactiveTime", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    queryInterface.removeColumn("Tickets", "maxUseInactiveTime");
  }

}
