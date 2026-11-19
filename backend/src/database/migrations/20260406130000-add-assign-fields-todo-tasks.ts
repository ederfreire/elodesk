import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc: any = await queryInterface.describeTable("TodoTasks");

    if (!tableDesc.assignedToId) {
      await queryInterface.addColumn("TodoTasks", "assignedToId", {
        type: DataTypes.INTEGER,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true,
      });
    }

    if (!tableDesc.createdById) {
      await queryInterface.addColumn("TodoTasks", "createdById", {
        type: DataTypes.INTEGER,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true,
      });
    }

    if (!tableDesc.status) {
      await queryInterface.addColumn("TodoTasks", "status", {
        type: DataTypes.STRING,
        defaultValue: "pending",
        allowNull: false,
      });
    }

    if (!tableDesc.notes) {
      await queryInterface.addColumn("TodoTasks", "notes", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("TodoTasks", "assignedToId");
    await queryInterface.removeColumn("TodoTasks", "createdById");
    await queryInterface.removeColumn("TodoTasks", "status");
    await queryInterface.removeColumn("TodoTasks", "notes");
  },
};
