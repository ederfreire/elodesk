import { QueryInterface } from "sequelize";
import agentTemplatesSeedEsEn from "../seeds/agentTemplatesSeedEsEn";

/**
 * Semeia as versões em espanhol e inglês dos 4 modelos de agente de sistema
 * (sdr-es, sdr-en, recuperacao-es, ...). O sistema trabalha com português,
 * espanhol e inglês; os modelos em português já existem
 * (20260911010100-seed-system-agent-templates).
 *
 * IDEMPOTENTE: só insere um slug de sistema que ainda não exista. Rodar de
 * novo não duplica nem sobrescreve nada.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const now = new Date();

    for (const s of agentTemplatesSeedEsEn) {
      const [existing]: any = await queryInterface.sequelize.query(
        `SELECT id FROM "AgentTemplates" WHERE "slug" = :slug AND "isSystem" = true LIMIT 1`,
        { replacements: { slug: s.slug } }
      );
      if (existing && existing.length > 0) continue;

      await queryInterface.bulkInsert("AgentTemplates", [
        {
          slug: s.slug,
          label: s.label,
          description: s.description || null,
          prompt: s.prompt || null,
          extractionInstructions: s.extractionInstructions || null,
          scope: s.scope || "ambos",
          niche: s.niche || null,
          isSystem: true,
          active: true,
          sortOrder: s.sortOrder || 0,
          companyId: null,
          createdAt: now,
          updatedAt: now
        }
      ]);
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const slugs = agentTemplatesSeedEsEn.map(s => s.slug);
    await queryInterface.sequelize.query(
      `DELETE FROM "AgentTemplates" WHERE "isSystem" = true AND "slug" IN (:slugs)`,
      { replacements: { slugs } }
    );
  }
};
