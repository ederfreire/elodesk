import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AppointmentServices", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      durationMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.createTable("AppointmentBookings", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      serviceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "AppointmentServices", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
      },
      professionalId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
      },
      contactId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Contacts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      startsAt: { type: DataTypes.DATE, allowNull: false },
      endsAt: { type: DataTypes.DATE, allowNull: false },
      status: { type: DataTypes.STRING, allowNull: false, defaultValue: "confirmed" },
      googleEventId: { type: DataTypes.STRING, allowNull: true },
      googleEventLink: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("AppointmentServices", ["companyId", "active"], {
      name: "idx_appointment_services_company_active"
    });
    await queryInterface.addIndex("AppointmentBookings", ["companyId", "startsAt"], {
      name: "idx_appointment_bookings_company_start"
    });
    await queryInterface.addIndex(
      "AppointmentBookings",
      ["companyId", "professionalId", "startsAt", "endsAt"],
      {
        name: "idx_appointment_bookings_professional_time"
      }
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AppointmentBookings");
    await queryInterface.dropTable("AppointmentServices");
  }
};
