import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return queryInterface.createTable("UserQueues", {
      userId: {
        type: DataTypes.INTEGER,
        primaryKey: true
      },
      queueId: {
        type: DataTypes.INTEGER,
        primaryKey: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });
      } catch (err) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.dropTable("UserQueues");
  }
};
