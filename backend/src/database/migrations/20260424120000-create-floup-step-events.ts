import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    try {
      await queryInterface.createTable("FloupStepEvents", {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: DataTypes.INTEGER
        },
        companyId: {
          allowNull: false,
          type: DataTypes.INTEGER,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        floupId: {
          allowNull: false,
          type: DataTypes.INTEGER,
          references: { model: "Floups", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        scheduleId: {
          allowNull: true,
          type: DataTypes.INTEGER,
          references: { model: "FloupSchedules", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        contactId: {
          allowNull: true,
          type: DataTypes.INTEGER,
          references: { model: "Contacts", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        ticketId: {
          allowNull: true,
          type: DataTypes.INTEGER,
          references: { model: "Tickets", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        stepIndex: { allowNull: false, type: DataTypes.INTEGER },
        stepOrder: { allowNull: true, type: DataTypes.INTEGER },
        stepData: { allowNull: true, type: DataTypes.JSONB },
        status: {
          allowNull: false,
          type: DataTypes.STRING(20),
          defaultValue: "COMPLETED"
        },
        errorMessage: { allowNull: true, type: DataTypes.TEXT },
        executedAt: { allowNull: false, type: DataTypes.DATE },
        createdAt: { allowNull: false, type: DataTypes.DATE },
        updatedAt: { allowNull: false, type: DataTypes.DATE }
      });
    } catch (err: any) {
    }

    try {
      await queryInterface.addIndex(
        "FloupStepEvents",
        ["companyId", "floupId", "contactId"],
        { name: "idx_floupstepevents_company_floup_contact" }
      );
    } catch (err: any) {
    }

    try {
      await queryInterface.addIndex(
        "FloupStepEvents",
        ["scheduleId", "stepIndex"],
        {
          name: "idx_floupstepevents_schedule_step_unique",
          unique: true,
          where: { scheduleId: { [require("sequelize").Op.ne]: null } } as any
        }
      );
    } catch (err: any) {
    }
  },

  async down(queryInterface: QueryInterface) {
    try {
      await queryInterface.removeIndex(
        "FloupStepEvents",
        "idx_floupstepevents_schedule_step_unique"
      );
    } catch {}
    try {
      await queryInterface.removeIndex(
        "FloupStepEvents",
        "idx_floupstepevents_company_floup_contact"
      );
    } catch {}
    await queryInterface.dropTable("FloupStepEvents");
  }
};
