import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
    up: async (queryInterface: QueryInterface) => {
    try {

        return Promise.all([
              queryInterface.addColumn("Companies", "document", {
                type: DataTypes.STRING,
                defaultValue: ""
            }),
              queryInterface.addColumn("Companies", "paymentMethod", {
                type: DataTypes.STRING,
                defaultValue: ""
            })
        ]);

                } catch (err: any) {
    }
  },

    down: (queryInterface: QueryInterface) => {
        return Promise.all([
            queryInterface.removeColumn("Companies", "document"),
            queryInterface.removeColumn("Companies", "paymentMethod")
        ]);
    }
};
