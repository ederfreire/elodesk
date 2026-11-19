import { QueryInterface, DataTypes } from 'sequelize';

export default {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("QuickMessages") as any;

    if (!tableDesc["mediaType"]) {


      await queryInterface.addColumn('QuickMessages', 'mediaType', {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      comment: 'Tipo de mídia: image, audio, video, document'
    });


    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn('QuickMessages', 'mediaType');
  }
};