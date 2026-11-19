import { QueryInterface, DataTypes } from "sequelize";

/**
 * Ramal interno do atendente, para ligações entre usuários da plataforma.
 *
 * Nota histórica: existiu um `internalExtension` antes, removido junto com
 * toda a infraestrutura SIP/Janus em 20260717120000. Este campo NÃO recria
 * aquilo — é só um número curto de identificação do atendente. A ligação em
 * si acontece direto entre os navegadores (WebRTC), sem PABX, sem troncal e
 * sem servidor de mídia.
 *
 * O índice é único por EMPRESA (não global): duas empresas diferentes podem
 * ter o ramal 100 sem conflito. Só se aplica a linhas com ramal preenchido,
 * então usuários sem ramal não colidem entre si.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Users");
    if (!table.internalExtension) {
      await queryInterface.addColumn("Users", "internalExtension", {
        type: DataTypes.STRING(10),
        allowNull: true
      });
    }

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "users_company_internal_extension_uniq"
        ON "Users" ("companyId", "internalExtension")
        WHERE "internalExtension" IS NOT NULL AND "internalExtension" <> '';
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "users_company_internal_extension_uniq";`
    );
    await queryInterface.removeColumn("Users", "internalExtension");
  }
};
