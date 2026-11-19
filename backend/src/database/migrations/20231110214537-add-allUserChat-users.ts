import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Users", "allUserChat", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "disabled"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Users", "allUserChat");
  }
};
