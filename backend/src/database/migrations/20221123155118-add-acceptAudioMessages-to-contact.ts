import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
    up: async (queryInterface: QueryInterface) => {
    try {

           queryInterface.addColumn("Contacts", "acceptAudioMessage", {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        });
     } catch (err: any) {
    }
  },

    down: (queryInterface: QueryInterface) => {
        return queryInterface.removeColumn("Contacts", "acceptAudioMessage");
    }
};
