import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
    up: async (queryInterface: QueryInterface) => {
    try {
        return queryInterface.createTable("Subscriptions", {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
                allowNull: false
            },
            isActive: {
                type: DataTypes.BOOLEAN,
                defaultValue: false
            },
            expiresAt: {
                type: DataTypes.DATE,
                allowNull: false
            },
            userPriceCents: {
                type: DataTypes.INTEGER
            },
            whatsPriceCents: {
                type: DataTypes.INTEGER
            },
            lastInvoiceUrl: {
                type: DataTypes.STRING,
                allowNull: true
            },
            lastPlanChange: {
                type: DataTypes.DATE,
                allowNull: true
            },
            companyId: {
                type: DataTypes.INTEGER,
                references: { model: "Companies", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
                allowNull: false
            },
            providerSubscriptionId: {
                type: DataTypes.STRING,
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
        return queryInterface.dropTable("Subscriptions");
    }
};
