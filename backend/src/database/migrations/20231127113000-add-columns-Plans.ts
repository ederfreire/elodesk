import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Plans", "useOpenAi", {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }),
      queryInterface.addColumn("Plans", "useIntegrations", {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    });

        } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Plans", "useOpenAi"),
    queryInterface.removeColumn("Plans", "useIntegrations");
  }
};
