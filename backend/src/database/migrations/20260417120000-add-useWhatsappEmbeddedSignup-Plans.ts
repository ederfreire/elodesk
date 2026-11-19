import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.addColumn("Plans", "useWhatsappEmbeddedSignup", {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      });
    } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Plans", "useWhatsappEmbeddedSignup");
  }
};
