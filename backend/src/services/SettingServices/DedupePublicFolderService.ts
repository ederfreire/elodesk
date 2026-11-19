import fs from "fs";
import path from "path";
import crypto from "crypto";
import logger from "../../utils/logger";

const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");

// Arquivos pequenos não valem o custo de hash (ganho irrelevante).
const MIN_SIZE = 64 * 1024;

interface Request {
  companyId: number;
  dryRun?: boolean;
}

interface Response {
  duplicates: number;
  freedBytes: number;
  scannedFiles: number;
  dryRun: boolean;
}

const listFiles = (dir: string, out: string[] = []): string[] => {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
};

const hashFile = (file: string): string => {
  const hash = crypto.createHash("sha1");
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let read = 0;
    // eslint-disable-next-line no-cond-assign
    while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
};

/**
 * Deduplicação NÃO destrutiva da pasta public de uma empresa.
 *
 * Agrupa por tamanho, calcula SHA1 só dos candidatos e substitui cópias
 * idênticas por hardlink para um único inode. Nenhum nome de arquivo
 * desaparece: todas as `mediaUrl` do banco continuam válidas — o disco só
 * para de guardar os mesmos bytes várias vezes.
 *
 * É essa rotina que resolve o caso real de vídeo de 163 MB repetido 7x na
 * mesma empresa, sem apagar histórico de conversa.
 */
const DedupePublicFolderService = async ({
  companyId,
  dryRun = false
}: Request): Promise<Response> => {
  const companyFolder = path.resolve(publicFolder, `company${companyId}`);

  if (!fs.existsSync(companyFolder)) {
    return { duplicates: 0, freedBytes: 0, scannedFiles: 0, dryRun };
  }

  const files = listFiles(companyFolder);
  const bySize = new Map<number, string[]>();
  const inodeOf = new Map<string, number>();

  for (const file of files) {
    try {
      const st = fs.statSync(file);
      if (st.size < MIN_SIZE) continue;
      inodeOf.set(file, st.ino);
      const arr = bySize.get(st.size) || [];
      arr.push(file);
      bySize.set(st.size, arr);
    } catch {
      /* ignora */
    }
  }

  let duplicates = 0;
  let freedBytes = 0;

  for (const [size, group] of bySize) {
    if (group.length < 2) continue;

    const byHash = new Map<string, string[]>();
    for (const file of group) {
      try {
        const h = hashFile(file);
        const arr = byHash.get(h) || [];
        arr.push(file);
        byHash.set(h, arr);
      } catch {
        /* ignora */
      }
    }

    for (const [, dupes] of byHash) {
      if (dupes.length < 2) continue;
      const [keep, ...rest] = dupes;
      const keepIno = inodeOf.get(keep);

      for (const dupe of rest) {
        // Já aponta pro mesmo inode: nada a fazer.
        if (keepIno && inodeOf.get(dupe) === keepIno) continue;
        if (dryRun) {
          duplicates += 1;
          freedBytes += size;
          continue;
        }
        const tmp = `${dupe}.dedup-tmp`;
        try {
          fs.linkSync(keep, tmp);
          fs.renameSync(tmp, dupe); // troca atômica: nunca fica sem arquivo
          duplicates += 1;
          freedBytes += size;
        } catch (err: any) {
          try {
            if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
          } catch {
            /* ignora */
          }
          logger.warn(
            `[DedupePublicFolder] Falha em ${dupe}: ${err?.message}`
          );
        }
      }
    }
  }

  logger.info(
    `[DedupePublicFolder] Empresa ${companyId}: ${duplicates} duplicata(s), ${(
      freedBytes /
      (1024 * 1024)
    ).toFixed(2)} MB ${dryRun ? "seriam liberados" : "liberados"}`
  );

  return { duplicates, freedBytes, scannedFiles: files.length, dryRun };
};

export default DedupePublicFolderService;
