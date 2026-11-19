import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("CompanyKanbanConfigs");

    if (!tableDesc["userId"]) {
      await queryInterface.addColumn("CompanyKanbanConfigs", "userId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
    }

    // Remove old unique constraint on companyId only
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE "CompanyKanbanConfigs" DROP CONSTRAINT IF EXISTS "CompanyKanbanConfigs_companyId_key"`
      );
    } catch (e) {
    }

    // Add new unique constraint on companyId + userId
    try {
      await queryInterface.addConstraint("CompanyKanbanConfigs", ["companyId", "userId"], {
        type: "unique",
        name: "CompanyKanbanConfigs_companyId_userId_key",
      });
    } catch (e) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    try {
      await queryInterface.sequelize.query(
        `ALTER TABLE "CompanyKanbanConfigs" DROP CONSTRAINT IF EXISTS "CompanyKanbanConfigs_companyId_userId_key"`
      );
    } catch (e) {}

    try {
      await queryInterface.removeColumn("CompanyKanbanConfigs", "userId");
    } catch (e) {}
  },
};
