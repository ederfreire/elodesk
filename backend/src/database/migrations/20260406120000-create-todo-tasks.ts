import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // TodoTasks
    const tableDescTodo: any = await queryInterface.describeTable("TodoTasks").catch(() => null);
    if (!tableDescTodo) {
      await queryInterface.createTable("TodoTasks", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        title: {
          type: DataTypes.TEXT,
          allowNull: false
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        priority: {
          type: DataTypes.STRING,
          defaultValue: "medium",
          allowNull: false
        },
        category: {
          type: DataTypes.STRING,
          defaultValue: "Geral",
          allowNull: true
        },
        dueDate: {
          type: DataTypes.DATEONLY,
          allowNull: true
        },
        completed: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false
        },
        sortOrder: {
          type: DataTypes.INTEGER,
          defaultValue: 0,
          allowNull: false
        },
        userId: {
          type: DataTypes.INTEGER,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
          allowNull: false
        },
        companyId: {
          type: DataTypes.INTEGER,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
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
    }

    // TodoSubtasks
    const tableDescSub: any = await queryInterface.describeTable("TodoSubtasks").catch(() => null);
    if (!tableDescSub) {
      await queryInterface.createTable("TodoSubtasks", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        text: {
          type: DataTypes.TEXT,
          allowNull: false
        },
        completed: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false
        },
        sortOrder: {
          type: DataTypes.INTEGER,
          defaultValue: 0,
          allowNull: false
        },
        todoTaskId: {
          type: DataTypes.INTEGER,
          references: { model: "TodoTasks", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
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
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("TodoSubtasks");
    await queryInterface.dropTable("TodoTasks");
  }
};
