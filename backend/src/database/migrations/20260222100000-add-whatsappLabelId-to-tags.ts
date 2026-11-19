import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Tags", "whatsappLabelId", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tags", "whatsappLabelId");
  }
};
