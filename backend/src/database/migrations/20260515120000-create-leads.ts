import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("Leads", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      phone: { type: DataTypes.STRING, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      contactId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Contacts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      firstTicketId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      channel: { type: DataTypes.STRING, allowNull: true, defaultValue: "whatsapp_oficial" },
      firstMessage: { type: DataTypes.TEXT, allowNull: true },
      ctwa_clid: { type: DataTypes.STRING, allowNull: true },
      adId: { type: DataTypes.STRING, allowNull: true },
      adTitle: { type: DataTypes.STRING, allowNull: true },
      adBody: { type: DataTypes.TEXT, allowNull: true },
      sourceType: { type: DataTypes.STRING, allowNull: true },
      sourceUrl: { type: DataTypes.STRING, allowNull: true },
      mediaType: { type: DataTypes.STRING, allowNull: true },
      thumbnailUrl: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.STRING, allowNull: true, defaultValue: "new" },
      lastCapiEvent: { type: DataTypes.STRING, allowNull: true },
      lastCapiAt: { type: DataTypes.DATE, allowNull: true },
      lastCapiError: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    await queryInterface.addIndex("Leads", ["companyId", "phone"], {
      name: "leads_company_phone_unique",
      unique: true
    });
    await queryInterface.addIndex("Leads", ["ctwa_clid"], {
      name: "leads_ctwa_clid_idx"
    });
    await queryInterface.addIndex("Leads", ["adId"], {
      name: "leads_ad_id_idx"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("Leads");
  }
};