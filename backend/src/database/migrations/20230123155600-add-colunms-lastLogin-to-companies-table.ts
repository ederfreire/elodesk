import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
    up: async (queryInterface: QueryInterface) => {
    try {

           queryInterface.addColumn("Companies", "lastLogin", {
            type: DataTypes.DATE,
            allowNull: true
        });
     } catch (err: any) {
    }
  },

    down: (queryInterface: QueryInterface) => {
        return queryInterface.removeColumn("Companies", "lastLogin");
    }
};
