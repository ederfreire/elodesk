import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const exists: any = await queryInterface.describeTable("FlowWaitTimers").catch(() => null);
    if (exists) return;
    await queryInterface.createTable("FlowWaitTimers", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      ticketId: {
        type: DataTypes.INTEGER,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      nodeId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      whatsappId: {
        type: DataTypes.INTEGER,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      flowId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      hashFlowId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      numberClient: {
        type: DataTypes.STRING,
        allowNull: true
      },
      reminderMessage: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      reminderAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      reminderSent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      timeoutAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      timeoutAction: {
        type: DataTypes.STRING,
        defaultValue: "continueFlow",
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

    await queryInterface.addIndex("FlowWaitTimers", ["ticketId", "nodeId"], {
      unique: true,
      name: "flow_wait_timers_ticket_node_unique"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("FlowWaitTimers");
  }
};
