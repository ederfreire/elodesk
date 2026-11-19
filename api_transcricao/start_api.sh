#!/bin/bash
#
# Sobe a API de Transcrição em primeiro plano, para teste manual.
#
# Este arquivo tinha caminhos fixos de outra instalação (/home/multi100 e
# /home/multi10), inclusive um "rm -rf" apontando para uma pasta que não é a
# desta máquina. Agora ele se localiza sozinho e não apaga nada.
#
# Para instalar/reinstalar de verdade (dependências + PM2), use:
#   bash install-python-app.sh

set -eu

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR_SCRIPT"

if [ ! -x "${DIR_SCRIPT}/venv/bin/python3" ]; then
  echo "venv não encontrada. Rode antes:  bash ${DIR_SCRIPT}/install-python-app.sh"
  exit 1
fi

echo "Iniciando a API de Transcrição na porta 4002 (Ctrl+C para parar)..."
exec "${DIR_SCRIPT}/venv/bin/python3" "${DIR_SCRIPT}/main.py"
