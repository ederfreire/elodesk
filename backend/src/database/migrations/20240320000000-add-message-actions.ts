import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("ChatMessages") as any;

    if (!tableDesc["isEdited"]) {


      await queryInterface.addColumn("ChatMessages", "isEdited", {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    });


    }

    if (!tableDesc["isDeleted"]) {


      await queryInterface.addColumn("ChatMessages", "isDeleted", {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    });


    }

    if (!tableDesc["forwardedFromId"]) {


      await queryInterface.addColumn("ChatMessages", "forwardedFromId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "ChatMessages",
        key: "id"
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });


    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("ChatMessages", "isEdited");
    await queryInterface.removeColumn("ChatMessages", "isDeleted");
    await queryInterface.removeColumn("ChatMessages", "forwardedFromId");
  }
};
