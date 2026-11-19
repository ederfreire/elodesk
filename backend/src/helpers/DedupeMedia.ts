import fs from "fs";
import path from "path";
import crypto from "crypto";
import logger from "../utils/logger";

/**
 * Deduplicação de mídia em disco por conteúdo (hardlink).
 *
 * Motivo: a mesma mídia (vídeo de campanha, encaminhamento em massa, etc.)
 * era gravada uma vez POR MENSAGEM. Num diagnóstico real: o mesmo vídeo de
 * 163 MB aparecia 7 vezes na pasta de uma única empresa — 3.229 MP4s
 * somando 30 GB em menos de uma semana.
 *
 * Solução: mantemos um índice oculto `.dedup/<sha1>` dentro da pasta da
 * empresa. Se o conteúdo já existe, criamos um HARDLINK com o nome novo em
 * vez de gravar os bytes de novo. Consequências:
 *  - Cada mensagem continua com seu próprio `mediaUrl` (nada muda no banco
 *    nem nas URLs públicas).
 *  - O disco guarda os bytes UMA vez; N cópias custam só a entrada de
 *    diretório.
 *  - Apagar um arquivo (limpeza por retenção) é seguro: o conteúdo só é
 *    liberado quando o último link é removido.
 *
 * Hardlink exige mesmo filesystem — como índice e arquivo ficam na mesma
 * pasta da empresa, isso é sempre verdade. Qualquer falha cai no fallback
 * de gravação normal, então nunca perdemos mídia por causa do dedup.
 */

const DEDUP_DIR = ".dedup";

export const sha1 = (buffer: Buffer): string =>
  crypto.createHash("sha1").update(buffer).digest("hex");

export const writeMediaDeduped = async (
  folder: string,
  filename: string,
  buffer: Buffer
): Promise<{ path: string; deduped: boolean }> => {
  const target = path.join(folder, filename);

  try {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
      fs.chmodSync(folder, 0o777);
    }

    const indexDir = path.join(folder, DEDUP_DIR);
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true });
    }

    const hash = sha1(buffer);
    const indexPath = path.join(indexDir, hash);

    // Conteúdo já conhecido -> só cria mais um nome apontando pros mesmos bytes.
    if (fs.existsSync(indexPath)) {
      try {
        if (fs.existsSync(target)) fs.unlinkSync(target);
        fs.linkSync(indexPath, target);
        return { path: target, deduped: true };
      } catch (err: any) {
        logger.warn(
          `[DedupeMedia] Falha ao criar hardlink para ${filename}: ${err?.message} — gravando cópia normal`
        );
      }
    }

    fs.writeFileSync(target, buffer);
    try {
      // Índice vira apenas outro link pro mesmo inode.
      if (!fs.existsSync(indexPath)) fs.linkSync(target, indexPath);
    } catch (err: any) {
      logger.warn(
        `[DedupeMedia] Falha ao indexar ${filename}: ${err?.message}`
      );
    }
    return { path: target, deduped: false };
  } catch (err: any) {
    // Fallback absoluto: nunca deixar de salvar a mídia por causa do dedup.
    logger.warn(
      `[DedupeMedia] Erro no dedup de ${filename}: ${err?.message} — gravação direta`
    );
    fs.writeFileSync(target, buffer);
    return { path: target, deduped: false };
  }
};

export default writeMediaDeduped;
