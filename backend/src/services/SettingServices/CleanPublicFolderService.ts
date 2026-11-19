import path from "path";
import fs from "fs";
import moment from "moment";
import { Op, Sequelize } from "sequelize";
import Message from "../../models/Message";
import logger from "../../utils/logger";
import {
  MediaCategory,
  categoryOfFile,
  getDefaultMediaCategories,
  parseMediaCategories
} from "./mediaCategories";


const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");

/**
 * Monta um mapa nomeDoArquivo -> data da mensagem mais recente que o
 * referencia (companyId escopado). Existe porque confiar só no mtime do
 * arquivo em disco pra decidir "quão antiga é essa mídia" é frágil: toda vez
 * que a pasta public é reextraída/recopiada numa atualização do sistema (ex:
 * `unzip`/`cp -r` sem preservar timestamp), o mtime de TODOS os arquivos
 * vira "agora" — e a limpeza passa a achar que nada é antigo o suficiente
 * pra remover, mesmo com anos de mídia acumulada (sintoma relatado: "Seria
 * liberado: 0 B" com a pasta cheia). O createdAt da Message no banco não
 * muda nunca, então é a fonte de verdade de quando aquela mídia realmente
 * chegou — o mtime só entra como fallback pra arquivos sem mensagem
 * correspondente (foto de perfil, anexo de campanha, etc.).
 */
const buildMediaDateMap = async (
  companyId: number
): Promise<Map<string, Date>> => {
  const map = new Map<string, Date>();
  try {
    const rows: any[] = await Message.findAll({
      attributes: [
        "mediaUrl",
        [Sequelize.fn("MAX", Sequelize.col("createdAt")), "lastCreatedAt"]
      ],
      where: {
        companyId,
        mediaUrl: { [Op.ne]: null }
      },
      group: ["mediaUrl"],
      raw: true
    });
    for (const row of rows) {
      const name = row?.mediaUrl;
      const when = row?.lastCreatedAt;
      if (name && when) {
        map.set(String(name), new Date(when));
      }
    }
  } catch (err: any) {
    logger.warn(
      `[CleanPublicFolder] Falha ao montar mapa de datas por mensagem (empresa ${companyId}), caindo pra mtime puro: ${err?.message}`
    );
  }
  return map;
};

// Limite máximo de meses de retenção suportados (Desativada + 1..24)
export const MAX_RETENTION_MONTHS = 24;

interface Request {
  companyId: number;
  retentionMonths: number; // quantidade de meses mantidos (1..24)
  // Categorias que PODEM ser apagadas por idade (audio/video/image/document/
  // other). O que não estiver aqui nunca é removido — foi assim que áudios de
  // atendimento acabaram apagados quando a limpeza varria tudo.
  mediaTypes?: MediaCategory[] | string;
  // Quando true, apenas CALCULA o que seria removido (pra alimentar o
  // card "Tamanho após limpeza" no front) sem apagar nada de verdade.
  dryRun?: boolean;
}

interface Response {
  deletedFiles: number;
  freedBytes: number;
  totalBeforeBytes: number;
  remainingBytes: number;
  // Tamanho/quantidade das categorias selecionadas, de QUALQUER idade.
  // Diferente de freedBytes, que conta só o que é antigo o bastante.
  selectedBytes: number;
  selectedFiles: number;
  cutoff: string;
  mediaTypes: MediaCategory[];
  dryRun?: boolean;
}


/**
 * Calcula o tamanho total (bytes) e a quantidade de arquivos de uma pasta.
 */
export const getFolderSize = (
  dir: string
): { totalBytes: number; fileCount: number } => {
  let totalBytes = 0;
  let fileCount = 0;

  if (!fs.existsSync(dir)) {
    return { totalBytes, fileCount };
  }

  // Com o dedup por hardlink (helpers/DedupeMedia), o MESMO conteúdo aparece
  // com vários nomes apontando pro mesmo inode. Somar stat.size de cada nome
  // inflaria o total (o disco guarda os bytes uma única vez), então contamos
  // cada inode só na primeira vez.
  const seenInodes = new Set<number>();

  const walk = (current: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          fileCount += 1;
          if (stat.nlink > 1) {
            if (seenInodes.has(stat.ino)) continue;
            seenInodes.add(stat.ino);
          }
          totalBytes += stat.size;
        }
      } catch (err) {
        /* ignora */
      }
    }
  };

  walk(dir);
  return { totalBytes, fileCount };
};

/**
 * Remove arquivos antigos da pasta public da empresa, mantendo apenas
 * os meses mais recentes conforme a retenção configurada.
 *
 * retentionMonths = 1 => mantém apenas o mês atual
 * retentionMonths = 2 => mantém o mês atual + o anterior
 * retentionMonths = N => mantém o mês atual + os (N-1) anteriores
 */
const CleanPublicFolderService = async ({
  companyId,
  retentionMonths,
  mediaTypes,
  dryRun = false
}: Request): Promise<Response> => {
  const months = Math.max(
    1,
    Math.min(MAX_RETENTION_MONTHS, Number(retentionMonths) || 1)
  );

  // Sem categorias explícitas, cai no default do sistema (vazio por padrão):
  // nada é apagado por idade.
  const categories =
    mediaTypes === undefined || mediaTypes === null
      ? getDefaultMediaCategories()
      : parseMediaCategories(mediaTypes);
  const allowed = new Set<MediaCategory>(categories);

  // Início do mês limite: começo do mês atual menos (months - 1) meses.
  const cutoff = moment()
    .startOf("month")
    .subtract(months - 1, "months")
    .toDate();

  const companyFolder = path.resolve(publicFolder, `company${companyId}`);

  let deletedFiles = 0;
  let freedBytes = 0;
  // Total das categorias selecionadas (qualquer idade) — ver comentário no
  // walk. Serve pra tela explicar por que "seria liberado" deu zero.
  let selectedBytes = 0;
  let selectedFiles = 0;

  if (!fs.existsSync(companyFolder) || allowed.size === 0) {
    const info = fs.existsSync(companyFolder)
      ? getFolderSize(companyFolder)
      : { totalBytes: 0, fileCount: 0 };
    return {
      deletedFiles,
      freedBytes,
      totalBeforeBytes: info.totalBytes,
      remainingBytes: info.totalBytes,
      selectedBytes: 0,
      selectedFiles: 0,
      cutoff: cutoff.toISOString(),
      mediaTypes: categories,
      dryRun
    };
  }

  const before = getFolderSize(companyFolder);
  const mediaDateMap = await buildMediaDateMap(companyId);
  let matchedByMessage = 0;
  let matchedByMtime = 0;
  let skippedProtected = 0;


  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      try {
        if (entry.isDirectory()) {
          walk(fullPath);

          // Remove diretórios que ficaram vazios após a limpeza — só de
          // verdade, nunca em dryRun (senão o "preview" apagaria pastas).
          if (!dryRun) {
            try {
              if (fs.readdirSync(fullPath).length === 0) {
                fs.rmdirSync(fullPath);
              }
            } catch (err) {
              /* ignora */
            }
          }
        } else if (entry.isFile()) {
          // Só apaga o que o admin marcou (ex: vídeo e imagem). Áudio, PDF
          // e qualquer categoria não selecionada ficam intactos.
          if (!allowed.has(categoryOfFile(entry.name))) {
            skippedProtected += 1;
            continue;
          }

          const stat = fs.statSync(fullPath);

          // Tamanho TOTAL da(s) categoria(s) escolhida(s), independente da
          // idade. A tela mostrava "Tamanho atual" (a pasta inteira) ao lado
          // de "Seria liberado" (só a categoria e só o que é antigo) — dois
          // números que medem coisas diferentes. Quando dava "0 B liberado",
          // não havia como saber se era porque não existe documento nenhum
          // ou porque nenhum documento é velho o bastante. Com este número a
          // tela consegue dizer as duas coisas.
          selectedBytes += stat.size;
          selectedFiles += 1;
          // Prioriza a data da Message no banco (estável, nunca some num
          // redeploy) — só cai pro mtime do arquivo quando não existe
          // mensagem correspondente (foto de perfil, anexo de campanha,
          // arquivo órfão, etc.).
          const dbDate = mediaDateMap.get(entry.name);
          const effectiveDate = dbDate || stat.mtime;
          if (dbDate) {
            matchedByMessage += 1;
          } else {
            matchedByMtime += 1;
          }
          if (effectiveDate < cutoff) {
            freedBytes += stat.size;
            deletedFiles += 1;
            // Em dryRun só CONTA o que seria removido — não mexe no disco.
            if (!dryRun) {
              fs.unlinkSync(fullPath);
            }
          }
        }

      } catch (err: any) {
        logger.warn(
          `[CleanPublicFolder] Falha ao processar ${fullPath}: ${err?.message}`
        );
      }
    }
  };

  walk(companyFolder);

  const remainingBytes = Math.max(0, before.totalBytes - freedBytes);

  logger.info(
    `[CleanPublicFolder] Empresa ${companyId}: ${deletedFiles} arquivo(s) ${dryRun ? "seriam removidos (preview)" : "removido(s)"} (${(
      freedBytes /
      (1024 * 1024)
    ).toFixed(2)} MB) anteriores a ${moment(cutoff).format("DD/MM/YYYY")} — tipos: ${categories.join(",") || "nenhum"}, data por mensagem: ${matchedByMessage}, data por mtime (órfão): ${matchedByMtime}, preservados (tipo não selecionado): ${skippedProtected}`
  );

  return {
    deletedFiles,
    freedBytes,
    totalBeforeBytes: before.totalBytes,
    remainingBytes,
    selectedBytes,
    selectedFiles,
    cutoff: cutoff.toISOString(),
    mediaTypes: categories,
    dryRun
  };

};

export default CleanPublicFolderService;
