/**
 * Diagnóstico das conexões WhatsApp: mostra quantas existem, em que estado
 * estão e quais estão custando recurso à toa a cada reinício do backend.
 *
 * POR QUE ISSO IMPORTA
 *
 *   Toda conexão que não está CONNECTED continua sendo iniciada no arranque
 *   do backend. Cada arranque de sessão Baileys custa um handshake Noise
 *   (Curve25519, caro em CPU), leitura das chaves Signal no Redis e um
 *   websocket TLS. Uma conexão que ninguém vai mais parear paga esse preço em
 *   TODO restart, para sempre, sem servir para nada.
 *
 * SEGURANÇA
 *
 *   - Este script é SOMENTE LEITURA. Não existe modo "--aplicar".
 *   - Não apaga, não altera, não desconecta nada.
 *   - Lê as credenciais do .env e nunca as imprime.
 *   - A decisão de apagar uma conexão é sua, e deve ser feita pela tela de
 *     Conexões do sistema — que cuida de derrubar a sessão e limpar as
 *     chaves no Redis. Apagar direto no banco deixa lixo para trás.
 *
 * USO
 *
 *   cd /home/deploy/SUA_PASTA/backend
 *   node scripts/diagnostico-conexoes.js
 *   node scripts/diagnostico-conexoes.js --empresa 1
 *   node scripts/diagnostico-conexoes.js --dias 30   # corte de "abandonada"
 */

require("dotenv").config();
const { Sequelize, QueryTypes } = require("sequelize");

const idxEmpresa = process.argv.indexOf("--empresa");
const EMPRESA = idxEmpresa > -1 ? Number(process.argv[idxEmpresa + 1]) : null;

const idxDias = process.argv.indexOf("--dias");
const DIAS_ABANDONO = idxDias > -1 ? Number(process.argv[idxDias + 1]) : 15;

const ESTADOS_SAUDAVEIS = ["CONNECTED"];

function barra(texto) {
  console.log("");
  console.log("─".repeat(72));
  console.log(texto);
  console.log("─".repeat(72));
}

function diasDesde(data) {
  if (!data) return null;
  return Math.floor((Date.now() - new Date(data).getTime()) / 86400000);
}

(async () => {
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      dialect: "postgres",
      logging: false
    }
  );

  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error("Não consegui conectar ao banco. Rode de dentro da pasta");
    console.error("backend, onde está o .env. Detalhe:", err.message);
    process.exit(1);
  }

  const filtroEmpresa = EMPRESA ? `AND w."companyId" = ${Number(EMPRESA)}` : "";

  try {
    // ── 1. Panorama por estado ──────────────────────────────────────────
    const porStatus = await sequelize.query(
      `SELECT COALESCE(w.status, '(sem status)') AS status,
              COUNT(*)::int AS total
         FROM "Whatsapps" w
        WHERE 1=1 ${filtroEmpresa}
        GROUP BY w.status
        ORDER BY total DESC`,
      { type: QueryTypes.SELECT }
    );

    barra("CONEXÕES POR ESTADO (todos os canais)");
    let totalGeral = 0;
    let totalSaudavel = 0;
    porStatus.forEach(l => {
      totalGeral += l.total;
      if (ESTADOS_SAUDAVEIS.includes(l.status)) totalSaudavel += l.total;
      console.log(`  ${String(l.status).padEnd(20)} ${String(l.total).padStart(5)}`);
    });
    console.log("");
    console.log(`  TOTAL                ${String(totalGeral).padStart(5)}`);
    console.log(`  Conectadas           ${String(totalSaudavel).padStart(5)}`);
    console.log("");
    console.log("  Atenção: este bloco conta TODOS os canais. Só as conexões");
    console.log("  Baileys fazem handshake no arranque — API Oficial, Webchat e");
    console.log("  Telegram são webhook e não custam nada aqui. O número que");
    console.log("  interessa está no RESUMO, mais abaixo.");

    // Quantas conexões BAILEYS existem (é o que pesa no arranque).
    const baileysTotal = await sequelize.query(
      `SELECT COUNT(*)::int AS total
         FROM "Whatsapps" w
        WHERE (w.channel = 'whatsapp' OR w.channel IS NULL)
          AND (w."zapiInstanceId" IS NULL OR w."zapiInstanceId" = '')
          ${filtroEmpresa}`,
      { type: QueryTypes.SELECT }
    );
    const totalBaileys = baileysTotal[0] ? baileysTotal[0].total : 0;

    // ── 2. Conexões que não conectam ────────────────────────────────────
    const problemas = await sequelize.query(
      `SELECT w.id,
              w.name,
              w.status,
              w."companyId",
              c.name AS empresa,
              w.channel,
              w."updatedAt"
         FROM "Whatsapps" w
         LEFT JOIN "Companies" c ON c.id = w."companyId"
        WHERE (w.status IS NULL OR w.status <> 'CONNECTED')
          AND (w.channel = 'whatsapp' OR w.channel IS NULL)
          ${filtroEmpresa}
        ORDER BY w."updatedAt" ASC`,
      { type: QueryTypes.SELECT }
    );

    barra(`CONEXÕES QUE NÃO ESTÃO CONECTADAS (${problemas.length})`);

    if (problemas.length === 0) {
      console.log("  Nenhuma. Todas as conexões Baileys estão conectadas.");
    } else {
      console.log(
        "  " +
          "ID".padEnd(6) +
          "EMPRESA".padEnd(22) +
          "NOME".padEnd(22) +
          "ESTADO".padEnd(14) +
          "PARADA HÁ"
      );
      problemas.forEach(w => {
        const dias = diasDesde(w.updatedAt);
        const idade = dias === null ? "?" : `${dias} dia(s)`;
        const marca = dias !== null && dias >= DIAS_ABANDONO ? "  <-- candidata" : "";

        // Sem nome de empresa significa que a linha em "Companies" não existe
        // mais (empresa apagada) — a conexão ficou órfã e ninguém a enxerga
        // em tela nenhuma, mas ela continua sendo iniciada a cada restart.
        // Antes isso aparecia como um "?" mudo, sem explicar o que era.
        const empresa = w.empresa
          ? String(w.empresa)
          : `ÓRFÃ (empresa ${w.companyId != null ? w.companyId : "?"})`;

        console.log(
          "  " +
            String(w.id).padEnd(6) +
            empresa.slice(0, 20).padEnd(22) +
            String(w.name || "(sem nome)").slice(0, 20).padEnd(22) +
            String(w.status || "(nulo)").padEnd(14) +
            idade +
            marca
        );
      });
    }

    // ── 3. Candidatas a remoção ─────────────────────────────────────────
    const candidatas = problemas.filter(w => {
      const d = diasDesde(w.updatedAt);
      return d !== null && d >= DIAS_ABANDONO;
    });

    const orfas = problemas.filter(w => !w.empresa);

    barra("RESUMO");
    console.log(
      `  Conexões Baileys iniciadas a cada restart: ${totalBaileys}`
    );
    console.log(
      `  Dessas, sem conectar:                     ${problemas.length}`
    );
    console.log(
      `  Paradas há ${String(DIAS_ABANDONO).padStart(3)}+ dias (candidatas):        ${candidatas.length}`
    );
    if (orfas.length > 0) {
      console.log(
        `  ÓRFÃS (empresa não existe mais):          ${orfas.length}`
      );
      console.log("");
      console.log("  Conexão órfã é a pior de todas: a empresa dona foi apagada,");
      console.log("  ninguém enxerga essa conexão em tela nenhuma, e mesmo assim");
      console.log("  ela é iniciada em todo restart. IDs: " +
        orfas.map(o => o.id).join(", "));
    }

    if (candidatas.length > 0) {
      console.log("");
      console.log("  Cada uma dessas paga handshake Noise + Redis + websocket");
      console.log("  em TODO restart do backend, sem servir para nada.");
      console.log("");
      console.log("  O que fazer, em ordem de preferência:");
      console.log("   1. Se o cliente ainda usa: peça para ler o QR na tela.");
      console.log("   2. Se não usa mais: apague pela tela de Conexões do");
      console.log("      sistema (NÃO apague direto no banco — a tela também");
      console.log("      derruba a sessão e limpa as chaves no Redis).");
    }

    // ── 4. Empresas ativas (afeta o tempo de arranque) ──────────────────
    const empresas = await sequelize.query(
      `SELECT COUNT(*)::int AS total FROM "Companies" WHERE status = true`,
      { type: QueryTypes.SELECT }
    );
    const totalEmpresas = empresas[0] ? empresas[0].total : 0;

    barra("TEMPO ESTIMADO DE ARRANQUE");
    console.log(`  Empresas ativas: ${totalEmpresas}`);
    console.log("");
    console.log("  A partir da v289 as empresas sobem UMA DE CADA VEZ, com o");
    console.log("  lote interno de 3 sessões (5s entre sessões, 10s entre");
    console.log("  lotes). Isso troca pico de CPU por tempo de arranque.");
    console.log("");
    const estimativaSeg = totalEmpresas * 5 + Math.ceil(totalGeral / 3) * 10;
    console.log(
      `  Estimativa grosseira: ~${Math.ceil(estimativaSeg / 60)} min para tudo subir.`
    );
    console.log("");
    console.log("  Se achar lento e a VPS aguentar, aumente no .env:");
    console.log("    BOOT_COMPANY_CONCURRENCY=2");
    console.log("");
  } catch (err) {
    console.error("Erro ao consultar:", err.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
