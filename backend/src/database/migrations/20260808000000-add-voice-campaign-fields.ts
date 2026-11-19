import { QueryInterface, DataTypes } from "sequelize";

/**
 * Campos da campanha de voz.
 *
 * A campanha passa a ter dois tipos: "message" (o comportamento de sempre) e
 * "voice" (liga para o contato e toca um áudio gravado). O padrão é "message"
 * para que toda campanha já existente continue funcionando igual.
 *
 * As colunas são criadas uma a uma, com verificação prévia, porque este banco
 * já rodou versões diferentes do instalador e uma coluna repetida derrubaria a
 * migração inteira.
 */

const COLUNAS_CAMPANHA: Array<[string, any]> = [
  ["campaignType", { type: DataTypes.STRING, allowNull: false, defaultValue: "message" }],
  ["voiceAudioPath", { type: DataTypes.STRING, allowNull: true }],
  ["voiceAudioName", { type: DataTypes.STRING, allowNull: true }],
  // Quantas vezes ligar quando o contato não atende. 1 = liga uma vez só.
  ["voiceMaxAttempts", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 }],
  // Intervalo entre tentativas, em minutos.
  ["voiceRetryMinutes", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 }],
  // Quanto tempo deixar chamando antes de desistir daquela tentativa.
  ["voiceRingSeconds", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 }],
  // Mandar também a mensagem de texto depois da ligação. Padrão ligado: é o
  // comportamento que a maioria espera de uma campanha que já tem texto
  // escrito; quem quiser só a ligação desliga na tela.
  ["voiceSendText", { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }]
];

// Sem contador por contato não há como saber quem já recebeu quantas ligações
// nem quando parar de insistir.
const COLUNAS_ENVIO: Array<[string, any]> = [
  ["voiceAttempts", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }],
  ["voiceLastResult", { type: DataTypes.STRING, allowNull: true }]
];

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const campanhas: any = await queryInterface.describeTable("Campaigns");
    for (const [nome, definicao] of COLUNAS_CAMPANHA) {
      if (!campanhas[nome]) {
        await queryInterface.addColumn("Campaigns", nome, definicao);
      }
    }

    const envios: any = await queryInterface.describeTable("CampaignShipping");
    for (const [nome, definicao] of COLUNAS_ENVIO) {
      if (!envios[nome]) {
        await queryInterface.addColumn("CampaignShipping", nome, definicao);
      }
    }
  },

  down: async (queryInterface: QueryInterface) => {
    for (const [nome] of COLUNAS_CAMPANHA) {
      await queryInterface.removeColumn("Campaigns", nome).catch(() => undefined);
    }
    for (const [nome] of COLUNAS_ENVIO) {
      await queryInterface.removeColumn("CampaignShipping", nome).catch(() => undefined);
    }
  }
};
