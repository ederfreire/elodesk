import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface) => {
    try {
      // default true: quem já usa a conexão WhatsApp Plus - Voz + Msg (wacalls)
      // não pode perder acesso do nada só por causa dessa migração — o campo
      // existe pra permitir desabilitar por plano dali pra frente, não pra
      // desligar de quem já está usando.
      queryInterface.addColumn("Plans", "useWacalls", {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      });
    } catch (e) {
    }
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Plans", "useWacalls");
  }
};
