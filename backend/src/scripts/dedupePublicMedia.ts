/**
 * Dedup retroativo da pasta public por conteúdo (hardlink).
 *
 * Percorre public/companyN, agrupa arquivos por tamanho, calcula SHA1 apenas
 * dos candidatos (mesmo tamanho) e substitui as cópias idênticas por
 * hardlinks para um único inode. NÃO apaga nenhum nome de arquivo: todas as
 * URLs/mediaUrl continuam funcionando — só o espaço em disco é liberado.
 *
 * Uso:
 *   cd /home/deploy/equipechat/backend
 *   npx ts-node src/scripts/dedupePublicMedia.ts --dry-run   # só relatório
 *   npx ts-node src/scripts/dedupePublicMedia.ts             # aplica
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const publicFolder = path.resolve(__dirname, "..", "..", "public");
const dryRun = process.argv.includes("--dry-run");
const MIN_SIZE = 64 * 1024; // ignora arquivos pequenos (ganho irrelevante)

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

const human = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;

const run = () => {
  const companies = fs
    .readdirSync(publicFolder, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith("company"))
    .map(e => path.join(publicFolder, e.name));

  let totalFreed = 0;
  let totalLinks = 0;

  for (const folder of companies) {
    const files = listFiles(folder);
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

    let freed = 0;
    let links = 0;

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
          // Já é o mesmo inode (hardlink existente): nada a fazer.
          if (keepIno && inodeOf.get(dupe) === keepIno) continue;
          freed += size;
          links += 1;
          if (dryRun) continue;
          const tmp = `${dupe}.dedup-tmp`;
          try {
            fs.linkSync(keep, tmp);
            fs.renameSync(tmp, dupe); // troca atômica: nunca fica sem arquivo
          } catch (err: any) {
            try {
              if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
            } catch {
              /* ignora */
            }
            freed -= size;
            links -= 1;
            // eslint-disable-next-line no-console
            console.warn(`falha em ${dupe}: ${err?.message}`);
          }
        }
      }
    }

    if (links > 0) {
      // eslint-disable-next-line no-console
    }
    totalFreed += freed;
    totalLinks += links;
  }

  // eslint-disable-next-line no-console
};

run();
