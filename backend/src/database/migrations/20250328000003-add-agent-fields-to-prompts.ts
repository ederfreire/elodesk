import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    try {
    const table = "Prompts";

    const addColumnIfNotExists = async (column: string, config: any) => {
      try {
        await queryInterface.addColumn(table, column, config);
      } catch (e) {
        // Column already exists
      }
    };

    await addColumnIfNotExists("agentFunction", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "geral"
    });

    await addColumnIfNotExists("voiceTone", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "amigavel"
    });

    await addColumnIfNotExists("aiModel", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "gpt-4o-mini"
    });

    await addColumnIfNotExists("languages", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '["pt-BR"]'
    });

    await addColumnIfNotExists("personality", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    await addColumnIfNotExists("active", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true
    });

    await addColumnIfNotExists("greetingMessage", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    await addColumnIfNotExists("responseRules", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    await addColumnIfNotExists("allowTransfer", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true
    });

    await addColumnIfNotExists("transferKeywords", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: "atendente, sair, falar com humano, humano"
    });

    await addColumnIfNotExists("transferMessage", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: "Desculpe, não tenho informações sobre esse assunto. Vou transferir para um atendente."
    });

    await addColumnIfNotExists("responseDelay", {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 1
    });

    await addColumnIfNotExists("charLimit", {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 2000
    });

    await addColumnIfNotExists("humanizeConversation", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true
    });

    await addColumnIfNotExists("audioEnabled", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    });

    await addColumnIfNotExists("transcribeAudio", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    });

    await addColumnIfNotExists("responseMode", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "text"
    });

    await addColumnIfNotExists("agentVoice", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "lily"
    });

    await addColumnIfNotExists("sendAsPTT", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: true
    });
      } catch (err) {
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table = "Prompts";
    const columns = [
      "agentFunction", "voiceTone", "aiModel", "languages", "personality",
      "active", "greetingMessage", "responseRules", "allowTransfer",
      "transferKeywords", "transferMessage", "responseDelay", "charLimit",
      "humanizeConversation", "audioEnabled", "transcribeAudio",
      "responseMode", "agentVoice", "sendAsPTT"
    ];
    for (const col of columns) {
      try { await queryInterface.removeColumn(table, col); } catch (e) {}
    }
  }
};
