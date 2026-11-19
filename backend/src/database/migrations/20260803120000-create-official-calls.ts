import { QueryInterface, DataTypes } from "sequelize";

/**
 * Histórico de chamadas da API Oficial (WhatsApp Business Calling API).
 *
 * Guarda o ciclo de vida de cada ligação para aparecer no atendimento e
 * permitir relatório depois. O `callId` é o identificador que a própria
 * Meta gera (formato "wacid.ABGG...") e é a chave de tudo: toda ação
 * seguinte — pre_accept, accept, reject, terminate — se refere a ele.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("OfficialCalls", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      callId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      whatsappId: {
        type: DataTypes.INTEGER,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: true
      },
      contactId: {
        type: DataTypes.INTEGER,
        references: { model: "Contacts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      ticketId: {
        type: DataTypes.INTEGER,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      // Atendente que atendeu ou discou.
      userId: {
        type: DataTypes.INTEGER,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      // "inbound" (cliente ligou) ou "outbound" (nós ligamos)
      direction: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "inbound"
      },
      // ringing | connected | ended | rejected | missed | failed
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "ringing"
      },
      number: {
        type: DataTypes.STRING,
        allowNull: true
      },
      durationSeconds: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      startedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      endedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      // Motivo do encerramento devolvido pela Meta, para diagnóstico.
      endReason: {
        type: DataTypes.STRING,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    // O callId é único por empresa — é por ele que localizamos a chamada
    // quando chega o webhook de terminate.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "official_calls_company_callid_uniq"
        ON "OfficialCalls" ("companyId", "callId");
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("OfficialCalls");
  }
};
