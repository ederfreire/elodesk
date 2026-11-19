import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

       queryInterface.addColumn("Messages", "quotedMsgId", {
      type: DataTypes.STRING,
      references: { model: "Messages", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
     } catch (err: any) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Messages", "quotedMsgId");
  }
};
