import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.createTable("LeadSources", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: { type: DataTypes.STRING, allowNull: false },
      // Chave do icone conhecido (facebook, instagram, google...). Guardar a
      // chave e nao o SVG mantem o banco leve e deixa a troca de biblioteca
      // de icones ser um detalhe do frontend.
      icon: { type: DataTypes.STRING, allowNull: true, defaultValue: "other" },
      color: { type: DataTypes.STRING, allowNull: true, defaultValue: "#64748b" },
      order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.dropTable("LeadSources");
  }
};
