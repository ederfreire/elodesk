import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("CallHistory") as any;

    if (!tableDesc["status"]) {


      await queryInterface.addColumn("CallHistory", "status", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "PENDING"
    });


    }
    if (!tableDesc["direction"]) {

      await queryInterface.addColumn("CallHistory", "direction", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "OUTGOING"
    });

    }
    if (!tableDesc["duration"]) {

      await queryInterface.addColumn("CallHistory", "duration", {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    });

    }
    // Tornar campos opcionais para permitir registro de chamadas recebidas sem todos os dados
    await queryInterface.changeColumn("CallHistory", "user_id", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await queryInterface.changeColumn("CallHistory", "token_wavoip", {
      type: DataTypes.STRING,
      allowNull: true
    });
    await queryInterface.changeColumn("CallHistory", "whatsapp_id", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await queryInterface.changeColumn("CallHistory", "contact_id", {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    await queryInterface.changeColumn("CallHistory", "phone_to", {
      type: DataTypes.STRING,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CallHistory", "status");
    await queryInterface.removeColumn("CallHistory", "direction");
    await queryInterface.removeColumn("CallHistory", "duration");
  }
};
