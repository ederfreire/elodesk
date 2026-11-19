/**
 * Conserta os contatos que já foram gravados com o número mascarado no lugar
 * do nome ("+34•••••31", "+55·····27") ou com o próprio número/LID repetido.
 *
 * A correção no código impede que novos entrem assim, mas não mexe no que já
 * está salvo — por isso este script.
 *
 * SEGURANÇA
 *
 *   - Roda em modo SIMULAÇÃO por padrão: mostra o que faria e não grava nada.
 *   - Só troca o nome por `number`. Não apaga contato, não junta duplicado,
 *     não toca em mais nenhum campo.
 *   - Nome legítimo com dígitos ("Loja 24h") não é tocado.
 *
 * USO
 *
 *   cd /home/deploy/SUA_PASTA/backend
 *   node scripts/corrigir-nomes-mascarados.js            # simula
 *   node scripts/corrigir-nomes-mascarados.js --aplicar  # grava
 *   node scripts/corrigir-nomes-mascarados.js --aplicar --empresa 1
 */

require("dotenv").config();
const { Sequelize } = require("sequelize");

const APLICAR = process.argv.includes("--aplicar");
const idxEmpresa = process.argv.indexOf("--empresa");
const EMPRESA = idxEmpresa > -1 ? Number(process.argv[idxEmpresa + 1]) : null;

// Mesma regra do helper backend/src/helpers/NomeDeContato.ts. Se mudar lá,
// mude aqui — são propositalmente independentes para o script rodar sem build.
const CARACTERES_DE_MASCARA = /[•·⋅∙●⚫*]/;

function nomeInvalido(nome) {
  if (!nome) return true;
  const limpo = String(nome).trim();
  if (!limpo) return true;
  if (CARACTERES_DE_MASCARA.test(limpo)) {
    if (limpo.replace(/[\d\s()+\-•·⋅∙●⚫*]/g, "").length === 0) return true;
  }
  const digitos = limpo.replace(/\D/g, "");
  if (/^[\d\s()+\-]+$/.test(limpo) && digitos.length >= 8) return true;
  return false;
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
    console.error("Não consegui conectar no banco:", err.message);
    process.exit(1);
  }

  const filtroEmpresa = EMPRESA ? `and "companyId" = ${EMPRESA}` : "";

  // Traz só os candidatos: nome com caractere de máscara OU nome igual a algo
  // que parece número. O filtro fino fica no JS, que é onde está a regra.
  const [linhas] = await sequelize.query(`
    select id, "companyId", name, number, "isGroup"
      from "Contacts"
     where "isGroup" = false
       ${filtroEmpresa}
       and (
            name ~ '[•·⋅∙●⚫*]'
         or name ~ '^[0-9()+\\- ]{8,}$'
       )
     order by id
  `);

  const paraCorrigir = linhas.filter(c => nomeInvalido(c.name) && c.number && c.name !== c.number);

  console.log("==================================================");
  console.log(` Contatos analisados........: ${linhas.length}`);
  console.log(` Com nome inválido..........: ${paraCorrigir.length}`);
  console.log(` Modo.......................: ${APLICAR ? "APLICANDO" : "SIMULAÇÃO (nada é gravado)"}`);
  if (EMPRESA) console.log(` Empresa....................: ${EMPRESA}`);
  console.log("==================================================");

  if (paraCorrigir.length === 0) {
    console.log("Nada a fazer.");
    await sequelize.close();
    return;
  }

  for (const c of paraCorrigir.slice(0, 20)) {
    console.log(`  #${c.id}  "${c.name}"  ->  "${c.number}"`);
  }
  if (paraCorrigir.length > 20) {
    console.log(`  ... e mais ${paraCorrigir.length - 20}`);
  }

  if (!APLICAR) {
    console.log("\nRode de novo com --aplicar para gravar.");
    await sequelize.close();
    return;
  }

  let corrigidos = 0;
  for (const c of paraCorrigir) {
    await sequelize.query(
      `update "Contacts" set name = :nome, "updatedAt" = now() where id = :id`,
      { replacements: { nome: c.number, id: c.id } }
    );
    corrigidos++;
  }

  console.log(`\n✅ ${corrigidos} contato(s) corrigido(s).`);
  await sequelize.close();
})();
