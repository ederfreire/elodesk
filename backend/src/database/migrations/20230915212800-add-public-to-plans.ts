import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Plans", "isPublic", {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    });
     } catch (err: any) {
    }
  },
  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Plans", "isPublic");
  }
};
