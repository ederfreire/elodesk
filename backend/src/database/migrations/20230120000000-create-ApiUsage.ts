import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
    up: async (queryInterface: QueryInterface) => {
    try {
        return queryInterface.createTable("ApiUsages", {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
              },
            companyId: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            dateUsed: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            UsedOnDay: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            usedText: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            usedPDF: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            usedImage: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            usedVideo: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            usedOther: {
                type: DataTypes.INTEGER,
                defaultValue: 0
            },
            usedCheckNumber: {
                type: DataTypes.INTEGER,
                defaultValue: 0
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
        return queryInterface.dropTable("ApiUsages");
    }
};
