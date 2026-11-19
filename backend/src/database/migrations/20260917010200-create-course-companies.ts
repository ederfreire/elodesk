import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) =>
    queryInterface.createTable("CourseCompanies", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      courseId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: "Courses", key: "id" },
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
  down: (queryInterface: QueryInterface) => queryInterface.dropTable("CourseCompanies")
};
