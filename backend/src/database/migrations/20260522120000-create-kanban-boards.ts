import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("KanbanBoards", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      icon: { type: DataTypes.STRING, allowNull: true },
      color: { type: DataTypes.STRING, allowNull: true, defaultValue: "#4E93FF" },
      category: { type: DataTypes.STRING, allowNull: true },
      tagIds: { type: DataTypes.TEXT, allowNull: true },
      laneOrder: { type: DataTypes.TEXT, allowNull: true },
      isShared: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addIndex("KanbanBoards", ["companyId"]);
    await queryInterface.addIndex("KanbanBoards", ["userId"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("KanbanBoards");
  }
};