import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("ContactWallets", "queueId", {
      type: DataTypes.INTEGER,
      references: { model: "Queues", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
      allowNull: false
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("ContactWallets", "queueId");
  }
};
