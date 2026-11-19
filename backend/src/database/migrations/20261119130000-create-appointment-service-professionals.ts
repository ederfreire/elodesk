import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AppointmentServiceProfessionals", {
      serviceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: "AppointmentServices", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      professionalId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      }
    });

    await queryInterface.addIndex(
      "AppointmentServiceProfessionals",
      ["professionalId", "serviceId"],
      { name: "idx_appointment_service_professionals_professional" }
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AppointmentServiceProfessionals");
  }
};
