const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const nodeModules = path.join(root, "node_modules");
const lockFile = path.join(root, "package-lock.json");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

// Módulos internos que o build do react-scripts (CRA 5) precisa resolver.
const requiredModules = [
  "react-scripts/scripts/build",
  "ajv/dist/compile/codegen", // só existe no ajv@8
  "caniuse-lite/dist/unpacker/agents",
  "browserslist"
];

function whichFail() {
  const failed = [];
  for (const mod of requiredModules) {
    try {
      require.resolve(mod, { paths: [root] });
    } catch (error) {
      failed.push(mod);
    }
  }
  return failed;
}

function runNpm(args) {
  const result = spawnSync(npmCommand, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NPM_CONFIG_PRODUCTION: "false" }
  });
  return result.status === 0;
}

function cleanInstall() {
  fs.rmSync(nodeModules, { recursive: true, force: true });
  fs.rmSync(lockFile, { force: true });
  return runNpm([
    "install",
    "--no-audit",
    "--no-fund",
    // "--force" removido: ele faz o npm ignorar conflitos e sobrescrever
    // pacotes pela metade. Depois de algumas execuções, a árvore fica com
    // versões misturadas entre pacotes que precisam casar entre si (foi
    // assim que @mui/utils ficou em 5.17.1 com o resto do MUI em 5.18.0,
    // quebrando o build com "does not contain a default export" em arquivo
    // interno do próprio MUI). --legacy-peer-deps já resolve conflito de
    // peer dependency, que era o motivo real de terem colocado --force,
    // sem corromper a árvore.
    "--include=dev",
    "--legacy-peer-deps"
  ]);
}

// Causa raiz do erro "Cannot find module 'ajv/dist/compile/codegen'":
// o npm pode subir o ajv@6 (dependência transitiva) para o topo, mas alguns
// pacotes do build precisam resolver ajv@8 no topo. Forçamos apenas o ajv@8.
// Não forçamos schema-utils/ajv-keywords globais porque loaders antigos do CRA
// esperam a API antiga validateOptions; schema-utils@4 causa "validateOptions is not a function".
function forceAjv8() {
  console.log(">> Forçando ajv@8 no topo (correção react-scripts 5)");
  return runNpm([
    "install",
    "ajv@8.17.1",
    "--no-audit",
    "--no-fund",
    "--legacy-peer-deps",
    "--save-exact=false"
  ]);
}

function patchFile(file, replacements) {
  if (!file || !fs.existsSync(file)) return false;
  let source = fs.readFileSync(file, "utf8");
  const original = source;
  for (const [from, to] of replacements) {
    source = source.replace(from, to);
  }
  if (source !== original) {
    fs.writeFileSync(file, source);
    return true;
  }
  return false;
}

// Marcador para evitar aplicar o shim duas vezes.
const SCHEMA_UTILS_MARKER = "__cra5_schema_utils_compat__";

// Shim anexado ao main de cada schema-utils encontrado.
// Causa raiz: loaders antigos do CRA 5 (ex.: babel-loader@8.3.0) fazem
//   const validateOptions = require("schema-utils");
// e chamam validateOptions(...) — esperando que o módulo SEJA uma função.
// O schema-utils@3/@4 exporta um objeto { validate, ValidationError, ... },
// então a chamada falha com "validateOptions is not a function".
// Em vez de adivinhar a linha exata de cada loader, tornamos o próprio
// schema-utils chamável: module.exports vira uma função (= validate) que
// também mantém todas as propriedades originais (validate, ValidationError...).
const SCHEMA_UTILS_SHIM =
  "\n\n// " + SCHEMA_UTILS_MARKER + "\n" +
  ";(function () {\n" +
  "  try {\n" +
  "    var __e = module.exports;\n" +
  "    if (__e && typeof __e !== 'function' && typeof __e.validate === 'function') {\n" +
  "      var __fn = function () { return __e.validate.apply(__e, arguments); };\n" +
  "      Object.keys(__e).forEach(function (k) { try { __fn[k] = __e[k]; } catch (e) {} });\n" +
  "      module.exports = __fn;\n" +
  "    }\n" +
  "  } catch (e) {}\n" +
  "})();\n";

function findSchemaUtilsMains(dir, found, depth) {
  // Varre node_modules atrás de todos os pacotes schema-utils (hoisted e aninhados).
  if (depth > 8 || !fs.existsSync(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === "schema-utils") {
      const pkgPath = path.join(full, "package.json");
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        const main = pkg.main || "dist/index.js";
        const mainPath = path.join(full, main);
        if (fs.existsSync(mainPath)) found.add(mainPath);
      } catch (e) {
        // ignora schema-utils sem package.json válido
      }
    }
    // continua descendo em node_modules aninhados e scopes (@org)
    if (entry.name === "node_modules" || entry.name.startsWith("@") || depth === 0) {
      findSchemaUtilsMains(full, found, depth + 1);
    }
  }
}

function patchSchemaUtilsCompatibility() {
  const found = new Set();
  // Pega o resolvido principal primeiro (garante pelo menos o do topo).
  try {
    found.add(require.resolve("schema-utils", { paths: [root] }));
  } catch (e) {
    // pode ainda não estar instalado; a varredura abaixo cobre os demais.
  }
  findSchemaUtilsMains(nodeModules, found, 0);

  const patched = [];
  for (const mainPath of found) {
    try {
      const source = fs.readFileSync(mainPath, "utf8");
      if (source.includes(SCHEMA_UTILS_MARKER)) continue; // já aplicado
      fs.writeFileSync(mainPath, source + SCHEMA_UTILS_SHIM);
      patched.push(path.relative(nodeModules, mainPath));
    } catch (e) {
      // arquivo somente leitura ou inexistente: ignora
    }
  }

  if (patched.length) {
    console.log(">> Compatibilidade schema-utils aplicada (export chamável): " + patched.join(", "));
  } else {
    console.log(">> schema-utils já compatível");
  }
}

// Causa raiz do erro "Unknown keyword formatMinimum":
// fork-ts-checker-webpack-plugin tem um schema-utils aninhado que carrega
// ajv-keywords@5 — esse pacote precisa do ajv@8, mas o npm às vezes deixa um
// ajv@6 aninhado próximo. Removemos qualquer ajv@<8 aninhado dentro de
// node_modules para forçar resolução do ajv@8 hoisted no topo.
function findNestedAjvDirs(dir, found, depth) {
  if (depth > 10 || !fs.existsSync(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === "ajv" && depth > 0) {
      // só nos importam ajv ANINHADOS (depth>0 = dentro de outro node_modules)
      const pkgPath = path.join(full, "package.json");
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        const major = parseInt(String(pkg.version).split(".")[0], 10);
        if (major < 8) found.push(full);
      } catch (e) {}
    }
    if (entry.name === "node_modules" || entry.name.startsWith("@") || depth === 0) {
      findNestedAjvDirs(full, found, depth + 1);
    }
  }
}

function removeNestedLegacyAjv() {
  const found = [];
  findNestedAjvDirs(nodeModules, found, 0);
  for (const dir of found) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(">> Removido ajv legado aninhado: " + path.relative(nodeModules, dir));
    } catch (e) {
      console.log(">> Falha ao remover " + dir + ": " + e.message);
    }
  }
  if (!found.length) console.log(">> Sem ajv@<8 aninhado");
}

let failed = whichFail();

if (failed.length) {
  console.log(">> Dependências do build ausentes: " + failed.join(", "));
  console.log(">> Reparando com instalação limpa (react-scripts)");
  cleanInstall();
  failed = whichFail();
}

// Se ainda faltar o ajv@8 (típico em VPS onde o npm sobe o ajv@6), força o ajv@8.
if (failed.includes("ajv/dist/compile/codegen") || failed.length) {
  forceAjv8();
  failed = whichFail();
}

patchSchemaUtilsCompatibility();
removeNestedLegacyAjv();

// Causa raiz do erro "Unknown keyword formatMinimum":
// schema-utils@2.x (aninhado em fork-ts-checker-webpack-plugin) usa ajv@6 + ajv-keywords@3,
// mas o overrides força ajv-keywords@5 no topo. O ajv-keywords@5 não tem as keywords
// formatMinimum/formatMaximum (foram substituídas por range/exclusiveRange).
// Patchamos todos os validate.js do schema-utils@2.x aninhados para remover essas keywords.
function patchSchemaUtilsV2Keywords() {
  const found = [];
  function walk(dir, depth) {
    if (depth > 8 || !fs.existsSync(dir)) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === "schema-utils") {
        const pkgPath = path.join(full, "package.json");
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          const major = parseInt(String(pkg.version).split(".")[0], 10);
          if (major < 3) {
            const validatePath = path.join(full, "dist", "validate.js");
            if (fs.existsSync(validatePath)) found.push(validatePath);
          }
        } catch (e) {}
      }
      if (entry.name === "node_modules" || entry.name.startsWith("@") || depth === 0) {
        walk(full, depth + 1);
      }
    }
  }
  walk(nodeModules, 0);

  const patched = [];
  for (const file of found) {
    try {
      const source = fs.readFileSync(file, "utf8");
      const marker = "// __ajv_keywords_compat__";
      if (source.includes(marker)) continue;
      const next = source
        .replace("['instanceof', 'formatMinimum', 'formatMaximum', 'patternRequired']", "['instanceof', 'patternRequired']")
        .replace("['instanceof', 'formatMinimum', 'formatMaximum', 'patternRequired']", "['instanceof', 'patternRequired']");
      if (next !== source) {
        fs.writeFileSync(file, next + "\n" + marker + "\n");
        patched.push(path.relative(nodeModules, file));
      }
    } catch (e) {}
  }
  if (patched.length) {
    console.log(">> Compatibilidade schema-utils@2 aplicada (keywords): " + patched.join(", "));
  } else {
    console.log(">> schema-utils@2 keywords já compatível");
  }
}

patchSchemaUtilsV2Keywords();

if (failed.length) {
  console.error(
    ">> Erro: não foi possível resolver as dependências do build após reinstalar: " +
      failed.join(", ")
  );
  process.exit(1);
}

console.log(">> Dependências do build OK");
