import { QueryInterface, DataTypes } from "sequelize";
// Adicionar a coluna flowBuilderId na tabela Whatsapp

module.exports = {

  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Whatsapps", "flowIdNotPhrase", {
      type: DataTypes.INTEGER,
      references: {
        model: "FlowBuilders",
        key: "id"
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      allowNull: true
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    // Remover a coluna flowBuilderId da tabela Whatsapp
    queryInterface.removeColumn("Whatsapps", "flowIdNotPhrase");
  }

}
