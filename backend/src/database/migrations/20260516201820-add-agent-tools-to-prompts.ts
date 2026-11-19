import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = "Prompts";

    const addColumnIfNotExists = async (column: string, config: any) => {
      try {
        await queryInterface.addColumn(table, column, config);
      } catch (e) {
        // Column already exists
      }
    };

    await addColumnIfNotExists("toolOpenTicket", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    });

    await addColumnIfNotExists("toolNotifyHuman", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    });

    await addColumnIfNotExists("toolNotifyHumanConfig", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    });

    await addColumnIfNotExists("toolHttpRequest", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    });

    await addColumnIfNotExists("toolHttpRequestConfig", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    });

    await addColumnIfNotExists("toolScheduling", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    });
  },

  down: async (queryInterface: QueryInterface) => {
    const table = "Prompts";
    const columns = [
      "toolOpenTicket",
      "toolNotifyHuman",
      "toolNotifyHumanConfig",
      "toolHttpRequest",
      "toolHttpRequestConfig",
      "toolScheduling"
    ];
    for (const col of columns) {
      try { await queryInterface.removeColumn(table, col); } catch (e) {}
    }
  }
};