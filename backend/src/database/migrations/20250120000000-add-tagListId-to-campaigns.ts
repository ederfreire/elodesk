import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Campaigns", "tagListId", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "ID da tag para seleção de contatos"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Campaigns", "tagListId");
  }
};