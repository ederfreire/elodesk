/**
 * Limpeza imediata das pastas public (uso manual, sob demanda).
 *
 * Uso:
 *   cd /home/deploy/equipechat/backend
 *   npx ts-node src/scripts/cleanPublicFolderNow.ts            # usa retenção padrão/por empresa
 *   PUBLIC_FOLDER_RETENTION_MONTHS=1 npx ts-node src/scripts/cleanPublicFolderNow.ts
 */
import "../bootstrap";
import "../database";
import { runCleanupForAllCompanies, DEFAULT_RETENTION_MONTHS } from "../jobs/PublicFolderCleanupJob";
import logger from "../utils/logger";

(async () => {
  logger.info(
    `[CleanPublicFolderNow] Iniciando limpeza manual (retenção padrão: ${DEFAULT_RETENTION_MONTHS} mês(es))`
  );
  await runCleanupForAllCompanies();
  logger.info("[CleanPublicFolderNow] Concluído.");
  process.exit(0);
})();
