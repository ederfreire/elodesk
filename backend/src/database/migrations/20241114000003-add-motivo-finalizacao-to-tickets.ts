import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Tickets") as any;

    if (!tableDesc["motivoFinalizacao"]) {


      await queryInterface.addColumn("Tickets", "motivoFinalizacao", {
      type: DataTypes.STRING,
      allowNull: true
    });


    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tickets", "motivoFinalizacao");
  }
};
