import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.createTable("CourseLessons", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      title: { type: DataTypes.STRING, allowNull: false },
      kind: { type: DataTypes.STRING, allowNull: false, defaultValue: "video" },
      contentUrl: { type: DataTypes.TEXT, allowNull: true },
      body: { type: DataTypes.TEXT, allowNull: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      courseId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: "Courses", key: "id" },
        onUpdate: "CASCADE", onDelete: "CASCADE"
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    }),
  down: (queryInterface: QueryInterface) => queryInterface.dropTable("CourseLessons")
};
