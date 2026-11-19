import { Request, Response } from "express";
import { exec, execFile } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { Sequelize } from "sequelize";
import database from "../database";

const safeUnlink = (filePath: string) => {
  fs.unlink(filePath, err => {
    if (err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        `Erro ao remover arquivo temporário ${filePath}:`,
        err.message
      );
    }
  });
};

const getDbConfig = () => ({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || "5432",
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS
});

export const backupSQL = async (
  req: Request,
  res: Response
): Promise<Response | void> => {
  const config = getDbConfig();

  if (!config.database || !config.username) {
    return res.status(500).json({ error: "Configuração do banco incompleta." });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup_${config.database}_${timestamp}.sql`;
  const filePath = path.join(os.tmpdir(), filename);

  const env = { ...process.env, PGPASSWORD: config.password };

  const args = [
    "-h", String(config.host),
    "-p", String(config.port),
    "-U", String(config.username),
    "-d", String(config.database),
    "-F", "c",
    "--no-owner",
    "--no-acl",
    "-f", filePath
  ];

  return new Promise((resolve) => {
    execFile("pg_dump", args, { env }, (error) => {
      if (error) {
        console.error("Backup SQL error:", error.message);
        res.status(500).json({ error: "Falha ao gerar backup SQL." });
        return resolve(undefined);
      }

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/sql");

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on("end", () => safeUnlink(filePath));
      stream.on("error", () => {
        safeUnlink(filePath);
        res.status(500).json({ error: "Erro ao enviar arquivo." });
      });

      resolve(undefined);
    });
  });
};

export const backupJSON = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const sequelize = database as unknown as Sequelize;

    const [tables]: any = await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );

    const backup: Record<string, any[]> = {};

    for (const { tablename } of tables) {
      const [rows]: any = await sequelize.query(
        `SELECT * FROM "${tablename}"`
      );
      backup[tablename] = rows;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup_${process.env.DB_NAME}_${timestamp}.json`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");

    return res.status(200).json(backup);
  } catch (error: any) {
    console.error("Backup JSON error:", error.message);
    return res.status(500).json({ error: "Falha ao gerar backup JSON." });
  }
};

export const restoreSQL = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const file = req.file as Express.Multer.File;

  if (!file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado." });
  }

  const config = getDbConfig();

  if (!config.database || !config.username) {
    return res.status(500).json({ error: "Configuração do banco incompleta." });
  }

  const env = { ...process.env, PGPASSWORD: config.password };

  // Detectar formato do arquivo (custom ou plain SQL)
  const fileBuffer = fs.readFileSync(file.path);
  const isCustomFormat = fileBuffer[0] === 0x50 && fileBuffer[1] === 0x47; // "PG" magic bytes do pg_dump custom

  let cmd: string;
  if (isCustomFormat) {
    // Formato custom (-F c): usar pg_restore com --clean para dropar objetos antes de recriar
    cmd = `pg_restore -h ${config.host} -p ${config.port} -U ${config.username} -d ${config.database} --clean --if-exists --no-owner --no-acl --single-transaction "${file.path}" 2>&1 || true`;
  } else {
    // Formato plain SQL: dropar e recriar schema antes de restaurar
    const preCleanCmd = `psql -h ${config.host} -p ${config.port} -U ${config.username} -d ${config.database} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${config.username}; GRANT ALL ON SCHEMA public TO public;"`;
    cmd = `${preCleanCmd} && psql -h ${config.host} -p ${config.port} -U ${config.username} -d ${config.database} -v ON_ERROR_STOP=0 -f "${file.path}" 2>&1`;
  }

  // Comando para resetar todas as sequências após o restore
  const resetSeqCmd = `psql -h ${config.host} -p ${config.port} -U ${config.username} -d ${config.database} -c "
    DO \\$\\$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT s.relname AS seq_name, t.relname AS table_name, a.attname AS col_name
        FROM pg_class s
        JOIN pg_depend d ON d.objid = s.oid
        JOIN pg_class t ON d.refobjid = t.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
        WHERE s.relkind = 'S'
      ) LOOP
        EXECUTE format('SELECT setval(''%I'', COALESCE((SELECT MAX(%I) FROM %I), 1))', r.seq_name, r.col_name, r.table_name);
      END LOOP;
    END \\$\\$;
  "`;

  return new Promise((resolve) => {
    exec(cmd, { env, maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      // Limpar arquivo temporário
      safeUnlink(file.path);

      const output = stdout || stderr || "";
      const hasRealError = error && !output.includes("pg_restore: warning");

      if (hasRealError) {
        console.error("Restore error:", error?.message);
        // Mesmo com erro, tentar resetar sequências
        exec(resetSeqCmd, { env }, () => {});
        resolve(
          res.status(500).json({
            error: "Falha ao restaurar backup. Verifique os detalhes.",
            details: output.substring(0, 2000)
          })
        );
        return;
      }

      // Resetar sequências para evitar conflitos de ID
      exec(resetSeqCmd, { env }, (seqErr) => {
        if (seqErr) {
          console.error("Erro ao resetar sequências:", seqErr.message);
        }
        resolve(
          res.status(200).json({
            message: "Banco restaurado com sucesso. Reinicie o servidor para aplicar as mudanças.",
            details: output.substring(0, 500)
          })
        );
      });
    });
  });
};

/* ============================================================
 * Backup por empresa (apenas dados de uma companyId específica)
 * Gera arquivo .sql plain com INSERTs, útil para migrar uma
 * empresa para outra VPS/plataforma com o mesmo schema.
 * ============================================================ */

const escapeSqlValue = (value: any): string => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'`;
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

const getTablesWithCompanyId = async (sequelize: Sequelize): Promise<string[]> => {
  const [rows]: any = await sequelize.query(`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'companyId'
    ORDER BY table_name
  `);
  return rows.map((r: any) => r.table_name);
};

export const backupCompanySQL = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const companyId = Number(req.params.companyId);
  if (!companyId || Number.isNaN(companyId)) {
    return res.status(400).json({ error: "companyId inválido." });
  }

  try {
    const sequelize = database as unknown as Sequelize;

    const [companyRows]: any = await sequelize.query(
      `SELECT * FROM "Companies" WHERE id = :id`,
      { replacements: { id: companyId } }
    );
    if (!companyRows.length) {
      return res.status(404).json({ error: "Empresa não encontrada." });
    }

    const tables = await getTablesWithCompanyId(sequelize);

    const buildInserts = (tableName: string, rows: any[]): string => {
      if (!rows.length) return `-- ${tableName}: 0 registros\n`;
      const cols = Object.keys(rows[0]);
      const colsSql = cols.map(c => `"${c}"`).join(", ");
      const lines = rows.map(row => {
        const vals = cols.map(c => escapeSqlValue(row[c])).join(", ");
        return `INSERT INTO "${tableName}" (${colsSql}) VALUES (${vals}) ON CONFLICT DO NOTHING;`;
      });
      return `-- ${tableName}: ${rows.length} registros\n${lines.join("\n")}\n`;
    };

    let sql = "";
    sql += `-- Backup da empresa #${companyId}\n`;
    sql += `-- Gerado em ${new Date().toISOString()}\n`;
    sql += `-- Restaure em um banco com o MESMO schema (mesma versão da aplicação)\n\n`;
    sql += `BEGIN;\n`;
    sql += `SET session_replication_role = replica;\n\n`;

    // Companies primeiro
    sql += buildInserts("Companies", companyRows);

    for (const table of tables) {
      if (table === "Companies") continue;
      const [rows]: any = await sequelize.query(
        `SELECT * FROM "${table}" WHERE "companyId" = :id`,
        { replacements: { id: companyId } }
      );
      sql += buildInserts(table, rows);
    }

    sql += `\n-- Resetar sequências\n`;
    sql += `DO $$\nDECLARE\n  r RECORD;\nBEGIN\n  FOR r IN (\n    SELECT s.relname AS seq_name, t.relname AS table_name, a.attname AS col_name\n    FROM pg_class s\n    JOIN pg_depend d ON d.objid = s.oid\n    JOIN pg_class t ON d.refobjid = t.oid\n    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid\n    WHERE s.relkind = 'S'\n  ) LOOP\n    EXECUTE format('SELECT setval(''%I'', COALESCE((SELECT MAX(%I) FROM %I), 1))', r.seq_name, r.col_name, r.table_name);\n  END LOOP;\nEND $$;\n`;
    sql += `\nSET session_replication_role = DEFAULT;\nCOMMIT;\n`;

    const companyName = String(companyRows[0].name || `company${companyId}`)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 40);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup_${companyName}_${companyId}_${timestamp}.sql`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/sql");
    return res.status(200).send(sql);
  } catch (error: any) {
    console.error("Backup company SQL error:", error.message);
    return res.status(500).json({ error: "Falha ao gerar backup da empresa." });
  }
};

export const backupCompanyJSON = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const companyId = Number(req.params.companyId);
  if (!companyId || Number.isNaN(companyId)) {
    return res.status(400).json({ error: "companyId inválido." });
  }

  try {
    const sequelize = database as unknown as Sequelize;

    const [companyRows]: any = await sequelize.query(
      `SELECT * FROM "Companies" WHERE id = :id`,
      { replacements: { id: companyId } }
    );
    if (!companyRows.length) {
      return res.status(404).json({ error: "Empresa não encontrada." });
    }

    const tables = await getTablesWithCompanyId(sequelize);
    const backup: Record<string, any[]> = { Companies: companyRows };

    for (const table of tables) {
      if (table === "Companies") continue;
      const [rows]: any = await sequelize.query(
        `SELECT * FROM "${table}" WHERE "companyId" = :id`,
        { replacements: { id: companyId } }
      );
      backup[table] = rows;
    }

    const companyName = String(companyRows[0].name || `company${companyId}`)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 40);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup_${companyName}_${companyId}_${timestamp}.json`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(backup);
  } catch (error: any) {
    console.error("Backup company JSON error:", error.message);
    return res.status(500).json({ error: "Falha ao gerar backup da empresa." });
  }
};
