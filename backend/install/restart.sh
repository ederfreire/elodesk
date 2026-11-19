#!/bin/bash
# Script de atualização do backend
# Executa: git pull -> npm install -> build -> migrations -> restart PM2
# Pode ser executado com: bash backend/install/restart.sh

set -e

cd "$(dirname "$0")/.."

echo ">> [1/5] Atualizando código do repositório..."
git pull || echo "(git pull falhou/ignorado, seguindo)"

echo ">> [2/5] Instalando dependências (npm install --force)..."
npm install --force --no-audit --no-fund --legacy-peer-deps

echo ">> [3/5] Compilando TypeScript (npm run build)..."
npm run build

echo ">> [4/5] Executando migrações do banco (db:migrate)..."
npx sequelize db:migrate || {
  echo "!! Migração falhou. Verifique config/config.js e credenciais do banco."
  exit 1
}

echo ">> [5/5] Reiniciando PM2..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart all --update-env || pm2 restart all
else
  echo "(pm2 não encontrado, pule este passo se estiver usando outro gerenciador)"
fi

# Atualização opcional do microserviço wacalls-voip (Go).
# Só roda se: (a) a pasta existe no repo, (b) Go está instalado.
# Assim quem não usa o microserviço não vê erro.
WACALLS_DIR="$(cd .. && pwd)/wacalls-voip"
if [ -d "$WACALLS_DIR" ] && [ -x "$WACALLS_DIR/install/restart.sh" ]; then
  if command -v go >/dev/null 2>&1; then
    echo ""
    echo ">> [extra] Atualizando microserviço wacalls-voip..."
    bash "$WACALLS_DIR/install/restart.sh" || echo "!! wacalls-voip restart falhou (veja logs acima)"
  else
    echo "(Go não instalado — pulando update do wacalls-voip)"
  fi
fi

echo ""
echo "✅ Backend atualizado com sucesso."

