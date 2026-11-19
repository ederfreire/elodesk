import { QueryInterface } from "sequelize";

/**
 * Desliga a URA de voz das conexões.
 *
 * A URA saiu do produto: a tela de criação e o campo de escolha em Conexões
 * foram removidos. Só que o vínculo já gravado continuaria valendo — e o
 * efeito seria pior do que deixar como estava.
 *
 * O microserviço decide atender automaticamente pela EXISTÊNCIA do vínculo:
 * havendo URA na conexão, a ligação é aceita pelo robô e nunca toca para o
 * atendente. Sem a tela, ninguém teria como desvincular, e as ligações
 * simplesmente desapareceriam.
 *
 * Limpar o campo devolve o comportamento normal: a ligação toca para quem
 * está no atendimento.
 *
 * A coluna é mantida, e não removida, para que a limpeza seja reversível e
 * para não perder o histórico de quem usava o quê.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tabela: any = await queryInterface.describeTable("Whatsapps");
    if (!tabela.wacallsVoiceFlowId) return;

    await queryInterface.sequelize.query(
      `UPDATE "Whatsapps"
          SET "wacallsVoiceFlowId" = NULL
        WHERE "wacallsVoiceFlowId" IS NOT NULL
          AND "wacallsVoiceFlowId" <> ''`
    );
  },

  down: async () => {
    // Sem volta: não guardamos qual URA estava em cada conexão, e recriar um
    // vínculo errado faria a conexão parar de tocar para o atendente.
    return Promise.resolve();
  }
};
