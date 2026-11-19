import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Campaigns") as any;

    if (!tableDesc["isRecurring"]) {


      await queryInterface.addColumn('Campaigns', 'isRecurring', {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    });


    }

    if (!tableDesc["recurrenceType"]) {


      await queryInterface.addColumn('Campaigns', 'recurrenceType', {
      type: DataTypes.STRING,
      allowNull: true
    });


    }

    if (!tableDesc["recurrenceInterval"]) {


      await queryInterface.addColumn('Campaigns', 'recurrenceInterval', {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: true
    });


    }

    if (!tableDesc["recurrenceDaysOfWeek"]) {


      await queryInterface.addColumn('Campaigns', 'recurrenceDaysOfWeek', {
      type: DataTypes.TEXT,
      allowNull: true
    });


    }

    if (!tableDesc["recurrenceDayOfMonth"]) {


      await queryInterface.addColumn('Campaigns', 'recurrenceDayOfMonth', {
      type: DataTypes.INTEGER,
      allowNull: true
    });


    }

    if (!tableDesc["recurrenceEndDate"]) {


      await queryInterface.addColumn('Campaigns', 'recurrenceEndDate', {
      type: DataTypes.DATE,
      allowNull: true
    });


    }

    if (!tableDesc["maxExecutions"]) {


      await queryInterface.addColumn('Campaigns', 'maxExecutions', {
      type: DataTypes.INTEGER,
      allowNull: true
    });


    }

    if (!tableDesc["executionCount"]) {


      await queryInterface.addColumn('Campaigns', 'executionCount', {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    });


    }

    if (!tableDesc["nextScheduledAt"]) {


      await queryInterface.addColumn('Campaigns', 'nextScheduledAt', {
      type: DataTypes.DATE,
      allowNull: true
    });


    }

    if (!tableDesc["lastExecutedAt"]) {


      await queryInterface.addColumn('Campaigns', 'lastExecutedAt', {
      type: DataTypes.DATE,
      allowNull: true
    });


    }
  },

  down: async (queryInterface: QueryInterface) => {
    const columns = [
      'isRecurring', 'recurrenceType', 'recurrenceInterval', 
      'recurrenceDaysOfWeek', 'recurrenceDayOfMonth', 'recurrenceEndDate',
      'maxExecutions', 'executionCount', 'nextScheduledAt', 'lastExecutedAt'
    ];
    
    for (const column of columns) {
      await queryInterface.removeColumn('Campaigns', column);
    }
  }
};