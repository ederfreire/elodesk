/**
 * Confere se todas as dependências declaradas realmente resolvem.
 *
 * POR QUE EXISTE
 *
 * Um `npm install` interrompido — rede caindo, disco cheio, timeout — deixa a
 * árvore de node_modules pela metade sem falhar de forma clara. O `npm run
 * build` ainda passa (o TypeScript usa os tipos, não o pacote instalado) e o
 * problema só aparece quando o processo sobe:
 *
 *   Error: Cannot find module 'X'
 *   Require stack: - /home/deploy/<empresa>/backend/dist/server.js
 *   code: 'MODULE_NOT_FOUND'
 *
 * Nesse ponto nada indica que a causa foi a instalação, e o log do PM2
 * costuma cortar justamente a linha que diz qual módulo faltou.
 *
 * Rodando isto logo depois do npm install, o erro aparece na hora certa, com
 * o nome de cada pacote ausente.
 *
 * Uso:  node scripts/verifica-dependencias.js
 * Sai com código 1 se algo faltar.
 */

const path = require("path");

const pacote = require(path.join(__dirname, "..", "package.json"));
const declaradas = Object.keys(pacote.dependencies || {});

const faltando = [];

for (const nome of declaradas) {
  try {
    require.resolve(nome, { paths: [path.join(__dirname, "..")] });
  } catch (erro) {
    // Alguns pacotes não expõem um ponto de entrada exigível (só tipos, ou
    // apenas binários). Nesses casos a pasta existir já basta.
    try {
      require("fs").accessSync(
        path.join(__dirname, "..", "node_modules", nome)
      );
    } catch (e) {
      faltando.push(nome);
    }
  }
}

if (faltando.length > 0) {
  console.error(
    `\n>> [BACKEND] ${faltando.length} dependência(s) declarada(s) não estão instaladas:`
  );
  faltando.forEach(n => console.error(`   - ${n}`));
  console.error(
    ">> A instalação do npm ficou incompleta. Refaça antes de subir o serviço.\n"
  );
  process.exit(1);
}

console.log(
  `>> [BACKEND] ${declaradas.length} dependências declaradas, todas resolvem.`
);
