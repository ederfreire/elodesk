import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.createTable("CourseComments", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      lessonId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: "CourseLessons", key: "id" },
        onUpdate: "CASCADE", onDelete: "CASCADE"
      },
      parentId: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: "CourseComments", key: "id" },
        onUpdate: "CASCADE", onDelete: "CASCADE"
      },
      userId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE", onDelete: "CASCADE"
      },
      companyId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE", onDelete: "CASCADE"
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    }),
  down: (queryInterface: QueryInterface) => queryInterface.dropTable("CourseComments")
};
