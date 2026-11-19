import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
    up: async (queryInterface: QueryInterface) => {
    try {

           queryInterface.addColumn("Users", "endWork", {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: "23:59"
        });
     } catch (err: any) {
    }
  },

    down: (queryInterface: QueryInterface) => {
        return queryInterface.removeColumn("Users", "endWork");
    }
};