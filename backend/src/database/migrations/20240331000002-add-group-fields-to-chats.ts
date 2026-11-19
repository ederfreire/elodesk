import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Chats") as any;

    if (!tableDesc["isGroup"]) {


      await queryInterface.addColumn("Chats", "isGroup", {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    });


    }
    if (!tableDesc["groupName"]) {

      await queryInterface.addColumn("Chats", "groupName", {
      type: DataTypes.STRING
    });

    }
    if (!tableDesc["groupAdminId"]) {

      await queryInterface.addColumn("Chats", "groupAdminId", {
      type: DataTypes.INTEGER,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    }
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Chats", "isGroup");
    await queryInterface.removeColumn("Chats", "groupName");
    await queryInterface.removeColumn("Chats", "groupAdminId");
  }
};
