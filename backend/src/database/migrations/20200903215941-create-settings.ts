import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    return queryInterface.createTable("Settings", {
      key: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: false
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
    return queryInterface.dropTable("Settings");
  }
};
