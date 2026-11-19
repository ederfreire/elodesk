import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Queues", "typeRandomMode", {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "RANDOM"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    queryInterface.removeColumn("Queues", "typeRandomMode");
  }

}
