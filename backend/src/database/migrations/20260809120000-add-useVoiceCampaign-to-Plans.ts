import { QueryInterface, DataTypes } from "sequelize";

/**
 * Campanha de voz como recurso de plano.
 *
 * Antes bastava ter "Campanhas" liberado para disparar ligações em massa —
 * e ligação tem custo e risco bem diferentes de mensagem: consome chamada
 * simultânea no servidor e é o tipo de uso que derruba número mais rápido.
 * Faz sentido cobrar/liberar à parte.
 *
 * Padrão FALSE, ao contrário do useWacalls: aqui o recurso é novo e ninguém
 * o usava antes desta versão, então ninguém perde nada ao entrar desligado.
 * Liberar por engano para toda a base seria o erro caro — o contrário é só
 * marcar a opção no plano.
 */
// module.exports (e não "export default"): é o estilo das migrações que
// comprovadamente rodam nesta instalação. Compilado para CommonJS, o
// "export default" vira exports.default e alguns executores não encontram
// o up/down ali dentro — a migração é ignorada em silêncio, que foi
// exatamente o sintoma da coluna que não existia.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tabela: any = await queryInterface.describeTable("Plans");
    if (tabela.useVoiceCampaign) return;

    await queryInterface.addColumn("Plans", "useVoiceCampaign", {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Plans", "useVoiceCampaign");
  }
};
