#!/bin/bash
#
# Instalador da API de Transcrição de Áudio.
#
# Roda tanto na instalação nova quanto na atualização. É idempotente: rodar de
# novo em cima de uma instalação existente não quebra nada, só reinstala as
# dependências e reaponta o PM2.

set -u

echo "=================================================="
echo "   API de Transcrição de Áudio — instalação"
echo "=================================================="

# ─────────────────────────────────────────────────────────────────────────────
# 1. DESCOBRIR ONDE O SISTEMA ESTÁ INSTALADO
#
# Antes este script procurava o nome da instalação num caminho fixo
# (/root/instalador_single_oficial/VARIAVEIS_INSTALACAO). Quem baixou o
# instalador numa pasta com outro nome não tinha esse arquivo, o script caía no
# padrão "equipechat" e montava /home/deploy/equipechat/api_transcricao/main.py
# — que não existe quando a instalação tem outro nome. Dava
# "ERRO: Arquivo não encontrado" e a transcrição não subia.
#
# A correção não depende de arquivo nenhum: este script MORA dentro da pasta da
# instalação, em /home/deploy/<empresa>/api_transcricao/. O próprio caminho
# dele já é a resposta certa, sempre.
# ─────────────────────────────────────────────────────────────────────────────
DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR_INSTALACAO="$(dirname "$DIR_SCRIPT")"        # /home/deploy/<empresa>
empresa="${empresa:-$(basename "$DIR_INSTALACAO")}"

CAMINHO_API="${DIR_SCRIPT}/main.py"
REQUISITOS="${DIR_SCRIPT}/requirements.txt"
VENV="${DIR_SCRIPT}/venv"
PY="${VENV}/bin/python3"
PIP="${VENV}/bin/pip"
APP_NAME="api_transcricao"

echo "📁 Instalação detectada: ${DIR_INSTALACAO}  (empresa: ${empresa})"

if [ ! -f "$CAMINHO_API" ]; then
  echo "❌ ERRO: main.py não encontrado em ${CAMINHO_API}"
  echo "   A pasta api_transcricao parece incompleta. Rode a atualização de código antes."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. PACOTES DO SISTEMA
# ─────────────────────────────────────────────────────────────────────────────
echo
echo "── Pacotes do sistema ──────────────────────────────"

# Só o índice. Um "apt upgrade -y" aqui já derrubou serviço no meio de uma
# atualização de sistema — não é papel deste script atualizar o servidor.
sudo apt-get update -y >/dev/null 2>&1 || true

# ffmpeg: o pydub converte o áudio recebido com ele. Um ffmpeg quebrado
# (bibliotecas faltando) é pior que ffmpeg ausente, porque falha só na hora de
# transcrever — por isso o teste com ldd.
FFMPEG_BIN="$(command -v ffmpeg || true)"
if [ -n "$FFMPEG_BIN" ] && ! ldd "$FFMPEG_BIN" 2>/dev/null | grep -q "not found"; then
  echo "✅ ffmpeg: $(ffmpeg -version 2>/dev/null | head -1)"
else
  if [ -n "$FFMPEG_BIN" ]; then
    echo "📦 ffmpeg existente está quebrado (libs ausentes). Removendo..."
    sudo rm -f "$FFMPEG_BIN" "$(command -v ffprobe 2>/dev/null)" "$(command -v ffplay 2>/dev/null)" 2>/dev/null || true
    sudo apt-get remove --purge ffmpeg -y >/dev/null 2>&1 || true
  fi
  echo "📦 Instalando ffmpeg..."
  sudo apt-get install -y ffmpeg
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "❌ ERRO: falha ao instalar ffmpeg."
    exit 1
  fi
  if ldd "$(command -v ffmpeg)" 2>/dev/null | grep -q "not found"; then
    echo "❌ ERRO: ffmpeg instalado mas com bibliotecas faltando:"
    ldd "$(command -v ffmpeg)" | grep "not found"
    exit 1
  fi
  echo "✅ ffmpeg: $(ffmpeg -version | head -1)"
fi

# python3-venv vem separado no Ubuntu/Debian e é obrigatório aqui.
# flac é usado pelo SpeechRecognition ao falar com o reconhecedor.
for pacote in python3 python3-pip python3-venv flac; do
  if dpkg -s "$pacote" >/dev/null 2>&1; then
    echo "✅ ${pacote} já instalado"
  else
    echo "📦 Instalando ${pacote}..."
    sudo apt-get install -y "$pacote"
  fi
done

if ! python3 -m venv --help >/dev/null 2>&1; then
  # Em algumas imagens o pacote genérico não basta; precisa o da versão exata.
  VERSAO_PY="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null)"
  echo "📦 Instalando python${VERSAO_PY}-venv..."
  sudo apt-get install -y "python${VERSAO_PY}-venv" || true
fi

if ! python3 -m venv --help >/dev/null 2>&1; then
  echo "❌ ERRO: python3-venv indisponível. Instale manualmente e rode de novo."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. AMBIENTE VIRTUAL
#
# POR QUE VENV E NÃO "pip3 install" GLOBAL
#
#   a) O instalador, ao ATUALIZAR, procura ${DIR_SCRIPT}/venv/bin/pip. Como a
#      instalação nunca criava venv, a atualização imprimia
#      "venv nao encontrada - pulando" e NUNCA instalava dependência nova.
#      Código novo que exigisse pacote novo subia e quebrava no import.
#   b) A instalação global usava "pip3 install flask ..." SEM versão, enquanto o
#      requirements.txt fixa Werkzeug==2.2.2. Flask 2.1.0 com Werkzeug moderno
#      quebra com "cannot import name 'url_quote'". Instalar sem pin era uma
#      bomba-relógio.
#   c) Ubuntu 23.04+ recusa pip global com "externally-managed-environment".
#
# A venv resolve os três e ainda deixa a atualização funcionando como já estava
# escrita no instalador.
# ─────────────────────────────────────────────────────────────────────────────
echo
echo "── Ambiente Python ─────────────────────────────────"

venv_saudavel() {
  [ -x "$PY" ] && [ -x "$PIP" ] && "$PY" -c "import sys" >/dev/null 2>&1
}

if venv_saudavel; then
  echo "✅ venv existente reaproveitada ($("$PY" --version 2>&1))"
else
  if [ -d "$VENV" ]; then
    echo "⚠️  venv existente está quebrada. Recriando..."
    rm -rf "$VENV"
  fi
  echo "📦 Criando ambiente virtual em ${VENV}..."
  python3 -m venv "$VENV"
  if ! venv_saudavel; then
    echo "❌ ERRO: não consegui criar a venv em ${VENV}"
    exit 1
  fi
  echo "✅ venv criada ($("$PY" --version 2>&1))"
fi

"$PIP" install --upgrade pip setuptools wheel >/dev/null 2>&1 || true

if [ ! -f "$REQUISITOS" ]; then
  echo "❌ ERRO: requirements.txt não encontrado em ${REQUISITOS}"
  exit 1
fi

echo "📦 Instalando dependências do requirements.txt..."
if ! "$PIP" install -r "$REQUISITOS"; then
  echo "❌ ERRO: falha ao instalar as dependências Python."
  echo "   O serviço antigo continua como estava — nada foi derrubado."
  exit 1
fi

# Prova real: se um import falhar, o serviço subiria e morreria no primeiro
# áudio. "Instalou sem erro" não é garantia de que carrega.
echo "🔍 Conferindo se os módulos carregam..."
if ! "$PY" - <<'PYCHECK'
import sys
faltando = []
for modulo in ("flask", "speech_recognition", "pydub", "ffmpeg", "dotenv", "requests", "werkzeug"):
    try:
        __import__(modulo)
    except Exception as erro:
        faltando.append(f"{modulo}: {erro}")
if faltando:
    print("MODULOS COM PROBLEMA:")
    for item in faltando:
        print("  -", item)
    sys.exit(1)
print("todos os módulos carregaram")
PYCHECK
then
  echo "❌ ERRO: as dependências instalaram mas não carregam. Veja a lista acima."
  exit 1
fi
echo "✅ dependências ok"

# ─────────────────────────────────────────────────────────────────────────────
# 4. PM2
#
# O ecosystem.config.js chamava o app de "api-transcricao" (hífen) e este script
# de "api_transcricao" (sublinhado). Quem passou pelos dois ficava com DUAS
# entradas no PM2 rodando a mesma porta 4002 — a segunda morria em loop com
# "Address already in use". Aqui removemos os dois nomes antes de subir.
#
# O --cwd também importa: o main.py chama load_dotenv(), que lê o .env do
# diretório de trabalho. Sem --cwd, o PM2 herdava a pasta de quem rodou o
# instalador e o .env simplesmente não era lido.
# ─────────────────────────────────────────────────────────────────────────────
echo
echo "── Serviço (PM2) ───────────────────────────────────"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "📦 Instalando PM2..."
  sudo npm install -g pm2
fi

for nome_antigo in api_transcricao api-transcricao transcricao; do
  if pm2 describe "$nome_antigo" >/dev/null 2>&1; then
    echo "🧹 Removendo entrada antiga do PM2: ${nome_antigo}"
    pm2 delete "$nome_antigo" >/dev/null 2>&1 || true
  fi
done

pm2 start "$CAMINHO_API" \
  --name "$APP_NAME" \
  --interpreter "$PY" \
  --cwd "$DIR_SCRIPT"

pm2 save

# pm2 startup só funciona como root; num shell do deploy ele imprime o comando
# a rodar. Não é erro fatal, então não derruba a instalação.
pm2 startup >/dev/null 2>&1 || true

# ─────────────────────────────────────────────────────────────────────────────
# 5. CONFERÊNCIA FINAL
#
# "Subiu no PM2" não prova nada: o processo pode morrer 2 segundos depois. Aqui
# esperamos e perguntamos ao próprio serviço se ele está atendendo na 4002.
# ─────────────────────────────────────────────────────────────────────────────
echo
echo "── Conferência ─────────────────────────────────────"
sleep 5

STATUS="$(pm2 jlist 2>/dev/null | grep -o "\"name\":\"${APP_NAME}\".*\"status\":\"[a-z]*\"" | grep -o '"status":"[a-z]*"' | head -1 | cut -d'"' -f4)"
echo "estado no PM2: ${STATUS:-desconhecido}"

if command -v curl >/dev/null 2>&1; then
  # Sem "|| echo 000": o proprio -w ja imprime 000 quando a conexao falha, e o
  # echo extra concatenava virando "000000" — que nao casa com o teste abaixo e
  # fazia o script dizer "respondendo" mesmo com o servico fora do ar.
  CODIGO="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:4002/ 2>/dev/null)"
  if [ -z "$CODIGO" ] || [ "$CODIGO" = "000" ]; then
    echo "⚠️  A porta 4002 não respondeu. Veja o log com:  pm2 logs ${APP_NAME} --lines 50"
  else
    echo "✅ Porta 4002 respondendo (HTTP ${CODIGO})"
  fi
fi

echo
echo "=================================================="
echo " Instalação concluída ✅"
echo " Serviço no PM2: ${APP_NAME}"
echo " Pasta:          ${DIR_SCRIPT}"
echo " Python:         ${PY}"
echo " Porta:          4002"
echo "=================================================="
echo
echo " Comandos úteis:"
echo "   pm2 logs ${APP_NAME} --lines 50"
echo "   pm2 restart ${APP_NAME}"
echo "=================================================="
