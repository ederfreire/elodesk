import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Users") as any;

    if (!tableDesc["showReturnAndTransferButtons"]) {


      await queryInterface.addColumn("Users", "showReturnAndTransferButtons", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });


    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "showReturnAndTransferButtons");
  }
};


