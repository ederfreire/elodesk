import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("GoogleCalendarIntegrations", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      googleEmail: { type: DataTypes.STRING, allowNull: true },
      accessToken: { type: DataTypes.TEXT, allowNull: true },
      refreshToken: { type: DataTypes.TEXT, allowNull: true },
      tokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
      calendarId: { type: DataTypes.STRING, allowNull: true, defaultValue: "primary" },
      defaultDuration: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      timezone: { type: DataTypes.STRING, allowNull: false, defaultValue: "America/Sao_Paulo" },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("GoogleCalendarIntegrations", ["companyId"], {
      unique: true,
      name: "google_calendar_integrations_company_unique"
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("GoogleCalendarIntegrations");
  }
};
