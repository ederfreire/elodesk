import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc: any = await queryInterface.describeTable("Plans");
    if (!tableDesc.useZapi) {
      await queryInterface.addColumn("Plans", "useZapi", {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      });
    }
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Plans", "useZapi");
  }
};
