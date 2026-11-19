import * as fsp from 'fs/promises';
import path from "path";
import * as fs from "fs";

/**
 * Grava logs de depuração (importação de mensagens, etc.) em disco.
 *
 * IMPORTANTE: por padrão esta função é um no-op para evitar o crescimento
 * descontrolado de arquivos em `backend/logs/` (que pode consumir muita
 * memória/disco em produção). Para habilitar a escrita defina a variável de
 * ambiente `ENABLE_DEBUG_LOGS=true`.
 */
const LOGS_ENABLED = String(process.env.ENABLE_DEBUG_LOGS || "").toLowerCase() === "true";

export async function addLogs({ fileName, text, forceNewFile = false }) {
  if (!LOGS_ENABLED) return;

  const logs = path.resolve(__dirname, "..", "..", "logs");
  const filePath = path.resolve(logs, fileName);

  try {
    if (!fs.existsSync(logs)) {
      fs.mkdirSync(logs);
    }
  } catch (error) {
    /* ignora */
  }

  try {
    if (forceNewFile) {
      await fsp.writeFile(filePath, `${text} \n`);
    } else {
      await fsp.appendFile(filePath, `${text} \n`);
    }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await fsp.writeFile(filePath, `${text} \n`);
    } else {
      console.error('Erro ao manipular o arquivo de log:', err);
    }
  }
}
