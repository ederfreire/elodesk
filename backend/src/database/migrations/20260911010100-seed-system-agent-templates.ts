import { QueryInterface } from "sequelize";
import agentTemplatesSeed from "../seeds/agentTemplatesSeed";

/**
 * Semeia os quatro modelos de sistema (SDR, Recuperação, Pós-venda, Vendedor
 * direto) que antes viviam presos no agentTemplates.js do frontend.
 *
 * O conteúdo vem de seeds/agentTemplatesSeed.ts — compilado junto pelo tsc,
 * então não depende de nenhum asset .json ser copiado no build.
 *
 * IDEMPOTENTE: só insere um slug de sistema que ainda não exista. Rodar de novo
 * não duplica nem sobrescreve ajustes da empresa (a empresa duplica o de
 * sistema; não edita o original).
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const now = new Date();

    for (const s of agentTemplatesSeed) {
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
    await queryInterface.bulkDelete("AgentTemplates", { isSystem: true } as any);
  }
};
