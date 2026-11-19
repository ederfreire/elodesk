import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Tickets", "typebotSessionTime", {
      type: DataTypes.DATE,
      defaultValue: null,
      allowNull: true,

    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Tickets", "typebotSessionTime");
  }
};
