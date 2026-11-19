import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {

    return [
        await queryInterface.addColumn("Plans", "recurrence", {
        type: DataTypes.STRING,
        allowNull: true
      }),
        await queryInterface.addColumn("Plans", "trial", {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }),
        await queryInterface.addColumn("Plans", "trialDays", {
        type: DataTypes.INTEGER,
        defaultValue: 0
      })
    ];

          } catch (err: any) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    return [
      await queryInterface.removeColumn("Plans", "recurrence"),
      await queryInterface.removeColumn("Plans", "trial"),
      await queryInterface.removeColumn("Plans", "trialDays")
    ];
  }
};
