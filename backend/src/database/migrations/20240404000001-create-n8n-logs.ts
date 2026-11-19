import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
      return queryInterface.createTable("N8NLogs", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false
        },
        nodeType: {
          type: DataTypes.STRING,
          allowNull: false
        },
        webhookUrl: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        ticketId: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        contactId: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        status: {
          type: DataTypes.STRING,
          defaultValue: "pending",
          allowNull: false
        },
        requestPayload: {
          type: DataTypes.JSON,
          allowNull: true
        },
        responseData: {
          type: DataTypes.JSON,
          allowNull: true
        },
        errorMessage: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        duration: {
          type: DataTypes.INTEGER,
          allowNull: true
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
    return queryInterface.dropTable("N8NLogs");
  }
};
