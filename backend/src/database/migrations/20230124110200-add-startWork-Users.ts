import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
    up: async (queryInterface: QueryInterface) => {
    try {

           queryInterface.addColumn("Users", "startWork", {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: "00:00"
        });
     } catch (err: any) {
    }
  },

    down: (queryInterface: QueryInterface) => {
        return queryInterface.removeColumn("Users", "startWork");
    }
};