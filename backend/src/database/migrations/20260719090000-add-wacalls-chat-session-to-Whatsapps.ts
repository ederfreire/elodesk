import { QueryInterface, DataTypes } from "sequelize";

/**
 * Sessão dedicada no wacalls-chat (github.com/raphaelbat/wacalls-chat), usada
 * SÓ para chamadas de voz de verdade (aceitar/recusar/encerrar com áudio).
 * Fica separada de `wacallsSessionId` (a sessão do microserviço wacalls-voip,
 * que continua cuidando do envio/recebimento de mensagens) porque são dois
 * backends diferentes — o wacalls-voip não sabe sinalizar chamada de volta
 * pro WhatsApp, o wacalls-chat sabe. A mesma conexão wacalls acaba pareada
 * como dois "aparelhos" no mesmo número: um pra mensagem, um pra chamada.
 */
module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.addColumn("Whatsapps", "wacallsChatSessionId", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });
  },
  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Whatsapps", "wacallsChatSessionId");
  }
};
