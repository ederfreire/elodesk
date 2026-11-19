import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Whatsapps", "queueIdImportMessages", {
      references: { model: "Queues", key: "id" },
      type: DataTypes.INTEGER,
      defaultValue: null,
      allowNull: true,
      onDelete: "SET NULL",
      onUpdate: "CASCADE"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Whatsapps", "queueIdImportMessages"),
    ])
  }
};
