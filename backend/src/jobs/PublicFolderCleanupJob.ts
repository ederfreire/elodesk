import Setting from "../models/Setting";
import Company from "../models/Company";
import CleanPublicFolderService from "../services/SettingServices/CleanPublicFolderService";
import DedupePublicFolderService from "../services/SettingServices/DedupePublicFolderService";
import {
  getDefaultMediaCategories,
  parseMediaCategories
} from "../services/SettingServices/mediaCategories";
import logger from "../utils/logger";

const CronJob = require("cron").CronJob;

export const SETTING_KEY = "publicFolderRetentionMonths";
export const TYPES_SETTING_KEY = "publicFolderCleanTypes";

/**
 * Retenção padrão aplicada às empresas que NÃO configuraram o setting.
 */
export const DEFAULT_RETENTION_MONTHS = Math.max(
  1,
  Number(process.env.PUBLIC_FOLDER_RETENTION_MONTHS || 1)
);

const parseRetention = (value: any): number | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  // "disabled"/"0"/vazio = usuário desligou explicitamente -> respeita
  if (raw === "disabled" || raw === "desativada" || raw === "0") return null;
  const v = Number(raw);
  if (Number.isFinite(v) && v >= 1) return v;
  return NaN as unknown as number; // sem valor válido -> usa default
};

/**
 * Passada de manutenção:
 *  1. Deduplicação (sempre) — não destrutiva, só troca cópias idênticas por
 *     hardlink. É a rotina que realmente resolveu o disco cheio.
 *  2. Limpeza por idade (opcional) — só nas categorias de mídia que o admin
 *     marcou nas Configurações. Sem seleção, nada é apagado.
 */
export const runCleanupForAllCompanies = async () => {
  try {
    const companies = await Company.findAll({
      attributes: ["id", "status"]
    });

    const settings = await Setting.findAll({
      where: { key: [SETTING_KEY, TYPES_SETTING_KEY] as any }
    });
    const retentionByCompany = new Map<number, any>();
    const typesByCompany = new Map<number, any>();
    settings.forEach(s => {
      if (s.key === SETTING_KEY) {
        retentionByCompany.set(Number(s.companyId), s.value);
      } else {
        typesByCompany.set(Number(s.companyId), s.value);
      }
    });

    for (const company of companies) {
      if (company.status !== true) continue;

      // 1) Dedup sempre — seguro, nenhuma mídia desaparece.
      try {
        await DedupePublicFolderService({ companyId: company.id });
      } catch (err: any) {
        logger.error(
          `[PublicFolderCleanup] Erro no dedup da empresa ${company.id}: ${err?.message}`
        );
      }

      // 2) Limpeza por idade — só nas categorias selecionadas pelo admin.
      const rawTypes = typesByCompany.get(Number(company.id));
      const mediaTypes =
        rawTypes === undefined
          ? getDefaultMediaCategories()
          : parseMediaCategories(rawTypes);
      if (mediaTypes.length === 0) continue;

      const parsed = parseRetention(retentionByCompany.get(Number(company.id)));
      if (parsed === null) continue; // limpeza desativada pela empresa

      const retentionMonths = Number.isFinite(parsed)
        ? Number(parsed)
        : DEFAULT_RETENTION_MONTHS;

      try {
        await CleanPublicFolderService({
          companyId: company.id,
          retentionMonths,
          mediaTypes
        });
      } catch (err: any) {
        logger.error(
          `[PublicFolderCleanup] Erro na empresa ${company.id}: ${err?.message}`
        );
      }
    }
  } catch (err: any) {
    logger.error(`[PublicFolderCleanup] Erro no job: ${err?.message}`);
  }
};

/**
 * Job de manutenção das pastas public.
 * Executa diariamente às 03:00.
 */
export const startPublicFolderCleanupJob = () => {
  const job = new CronJob(
    "0 0 3 * * *", // Todos os dias às 03:00
    async () => {
      logger.info("[PublicFolderCleanup] Iniciando manutenção diária das pastas public...");
      await runCleanupForAllCompanies();
      logger.info("[PublicFolderCleanup] Manutenção diária concluída.");
    },
    null,
    true,
    "America/Sao_Paulo"
  );

  logger.info(
    `[PublicFolderCleanup] Job inicializado - diariamente às 03:00 (dedup sempre; retenção padrão: ${DEFAULT_RETENTION_MONTHS} mês(es) apenas nos tipos selecionados)`
  );

  // Passagem inicial 2 min após o boot (não bloqueia o start do servidor).
  setTimeout(() => {
    runCleanupForAllCompanies().catch(err =>
      logger.error(`[PublicFolderCleanup] Erro na limpeza inicial: ${err?.message}`)
    );
  }, 2 * 60 * 1000);

  return job;
};

export default startPublicFolderCleanupJob;
