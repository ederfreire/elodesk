import { QueryInterface } from "sequelize";

/**
 * As mídias recebidas/enviadas pelo canal WhatsApp Plus (wacalls-chat) foram,
 * por um período, gravadas com a extensão que a stdlib do Go devolve em
 * primeiro lugar para "video/mp4": ".f4v" (Flash Video). Celular e navegador
 * não reconhecem esse container, então o vídeo aparecia como não abrível.
 *
 * O código já foi corrigido para sempre usar a extensão canônica. Esta
 * migration acerta o histórico: reescreve `Messages.mediaUrl` das linhas que
 * ficaram apontando para os nomes ruins. Os arquivos em disco devem ser
 * renomeados com o mesmo mapeamento (ver comando no README/instalador):
 *
 *   find public -name '*.f4v' -exec bash -c 'mv "$0" "${0%.f4v}.mp4"' {} \;
 *
 * A migration é idempotente e não toca em nenhuma outra linha.
 */
const REPLACEMENTS: Array<[string, string]> = [
  [".f4v", ".mp4"],
  [".m4v", ".mp4"],
  [".oga", ".ogg"],
  [".mpga", ".mp3"],
  [".jpe", ".jpg"],
  [".3g2", ".3gp"]
];

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    for (const [bad, good] of REPLACEMENTS) {
      await queryInterface.sequelize.query(
        `UPDATE "Messages"
            SET "mediaUrl" = LEFT("mediaUrl", LENGTH("mediaUrl") - ${bad.length}) || :good
          WHERE "mediaUrl" LIKE :pattern`,
        { replacements: { good, pattern: `%${bad}` } }
      );
    }
  },

  down: async (queryInterface: QueryInterface) => {
    // Sem rollback: reverter reintroduziria extensões que quebram a
    // reprodução da mídia no cliente.
    return Promise.resolve();
  }
};
