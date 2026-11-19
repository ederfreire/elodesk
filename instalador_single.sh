#!/bin/bash

GREEN='\033[1;32m'
BLUE='\033[1;34m'
WHITE='\033[1;37m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
CYAN='\033[1;36m'
MAGENTA='\033[1;35m'

# Variaveis Padrão
ARCH=$(uname -m)
# Versão do Ubuntu pelo /etc/os-release (o lsb_release nem sempre vem
# instalado nas imagens mínimas do 24.04 em diante).
UBUNTU_VERSION="$(. /etc/os-release 2>/dev/null && echo "${VERSION_ID}")"
UBUNTU_CODENAME="$(. /etc/os-release 2>/dev/null && echo "${VERSION_CODENAME:-${UBUNTU_CODENAME}}")"
[ -z "${UBUNTU_VERSION}" ] && UBUNTU_VERSION=$(lsb_release -sr 2>/dev/null)
[ -z "${UBUNTU_CODENAME}" ] && UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null)
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
ARQUIVO_VARIAVEIS="VARIAVEIS_INSTALACAO"
ARQUIVO_ETAPAS="ETAPA_INSTALACAO"
FFMPEG="$(pwd)/ffmpeg.x"
FFMPEG_DIR="$(pwd)/ffmpeg"
ip_atual=$(curl -s http://checkip.amazonaws.com)
jwt_secret=$(openssl rand -base64 32)
jwt_refresh_secret=$(openssl rand -base64 32)
default_apioficial_port=6000


# ─────────────── Compatibilidade com Ubuntu 20.04 a 26.04 ───────────────
# Versões testadas pelo instalador: 20.04, 22.04, 24.04, 25.04, 25.10, 26.04.
UBUNTU_SUPORTADOS="20.04 22.04 24.04 25.04 25.10 26.04"

ubuntu_preparar() {
  # Ubuntu 22.04+: o needrestart abre uma tela perguntando quais serviços
  # reiniciar depois de cada apt install e a instalação fica parada nela.
  # Aqui ele passa a reiniciar sozinho, sem perguntar.
  if [ -d /etc/needrestart ] || dpkg -s needrestart >/dev/null 2>&1; then
    mkdir -p /etc/needrestart/conf.d 2>/dev/null
    echo "\$nrconf{restart} = 'a';" > /etc/needrestart/conf.d/99-instalador.conf 2>/dev/null || true
  fi
  if ! echo " ${UBUNTU_SUPORTADOS} " | grep -q " ${UBUNTU_VERSION} "; then
    printf "${YELLOW} >> Ubuntu ${UBUNTU_VERSION:-desconhecido} (${UBUNTU_CODENAME:-?}) não está na lista testada (${UBUNTU_SUPORTADOS}). A instalação continua, mas confira os avisos.${WHITE}\n"
    sleep 3
  fi
}

# O pacote tem versão disponível no apt? (pacote "virtual" não conta)
pacote_existe() {
  apt-cache policy "$1" 2>/dev/null | grep -q "Candidate: [^(]"
}

# Recebe nomes de pacote (alternativas separadas por "|") e devolve só os que
# existem nesta versão do Ubuntu. Do 24.04 em diante muitas bibliotecas
# ganharam o sufixo "t64" (ex.: libasound2 -> libasound2t64) e outras
# sumiram (libgconf-2-4, gconf-service, libappindicator1). Antes um único nome
# inexistente fazia o apt recusar a lista inteira.
escolher_pacotes() {
  local saida="" item alt escolhido
  for item in "$@"; do
    escolhido=""
    for alt in ${item//|/ }; do
      if pacote_existe "${alt}t64"; then escolhido="${alt}t64"; break; fi
      if pacote_existe "${alt}"; then escolhido="${alt}"; break; fi
    done
    [ -n "${escolhido}" ] && saida="${saida} ${escolhido}"
  done
  echo "${saida}"
}

ubuntu_preparar

# Verifica se porta está em uso (true=ocupada, false=livre)
porta_em_uso() {
  local p="$1"
  if command -v lsof &>/dev/null && lsof -i:"${p}" &>/dev/null; then
    return 0
  fi
  if command -v ss &>/dev/null && ss -lnt 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}$"; then
    return 0
  fi
  if grep -rhE "^(PORT|SERVER_PORT|PROXY_PORT|RABBITMQ_PORT|DB_PORT)=${p}\b" /home/deploy/*/backend/.env /home/deploy/*/frontend/.env 2>/dev/null | grep -q .; then
    return 0
  fi
  return 1
}

# Encontra a próxima porta livre a partir de um valor inicial
sugerir_porta_livre() {
  local start="$1"
  local p="${start}"
  local max=$((start + 200))
  while [ "${p}" -le "${max}" ]; do
    if ! porta_em_uso "${p}"; then
      echo "${p}"
      return 0
    fi
    p=$((p + 1))
  done
  echo "${start}"
}

if [ "$EUID" -ne 0 ]; then
  echo
  printf "${WHITE} >> Este script precisa ser executado como root ${RED}ou com privilégios de superusuário${WHITE}.\n"
  echo
  sleep 2
  exit 1
fi

VERSAO_INSTALADOR="7.1"
DATA_INSTALADOR="04/08/2026"

banner() {
  clear
  printf "${BLUE}"
  printf "\n"
  printf "  ███████╗ ██████╗ ██╗   ██╗██╗██████╗ ███████╗ ██████╗██╗  ██╗ █████╗ ████████╗\n"
  printf "  ██╔════╝██╔═══██╗██║   ██║██║██╔══██╗██╔════╝██╔════╝██║  ██║██╔══██╗╚══██╔══╝\n"
  printf "  █████╗  ██║   ██║██║   ██║██║██████╔╝█████╗  ██║     ███████║███████║   ██║   \n"
  printf "  ██╔══╝  ██║▄▄ ██║██║   ██║██║██╔═══╝ ██╔══╝  ██║     ██╔══██║██╔══██║   ██║   \n"
  printf "  ███████╗╚██████╔╝╚██████╔╝██║██║     ███████╗╚██████╗██║  ██║██║  ██║   ██║   \n"
  printf "  ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝╚═╝     ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   \n"
  printf "${WHITE}\n"
  printf "  ${CYAN}Equipechat${WHITE} By ${GREEN}Raphael Batista${WHITE}\n"
  printf "  ${WHITE}Suporte: ${YELLOW}81 99998-8876${WHITE}\n"
  printf "  ${WHITE}Versão do Instalador: ${BLUE}${VERSAO_INSTALADOR}${WHITE} (Unificado — ${DATA_INSTALADOR})\n"
  printf "\n"
  printf "  ${RED}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "  ${RED}║${WHITE}  ${RED}⚠  AVISO LEGAL:${WHITE} Pirataria é crime (Lei 9.609/98).        ${RED}║${WHITE}\n"
  printf "  ${RED}║${WHITE}  Este sistema é licenciado e protegido por direitos          ${RED}║${WHITE}\n"
  printf "  ${RED}║${WHITE}  autorais. O uso não autorizado, cópia, redistribuição       ${RED}║${WHITE}\n"
  printf "  ${RED}║${WHITE}  ou engenharia reversa é ${RED}PROIBIDO${WHITE} e sujeito a penalidades.  ${RED}║${WHITE}\n"
  printf "  ${RED}║${WHITE}                                                              ${RED}║${WHITE}\n"
  printf "  ${RED}║${WHITE}  ${YELLOW}🔍 Seu IP está sendo monitorado: ${CYAN}${ip_atual}${WHITE}           ${RED}║${WHITE}\n"
  printf "  ${RED}║${WHITE}  ${YELLOW}📅 Data: ${CYAN}$(date '+%d/%m/%Y %H:%M:%S')${WHITE}                      ${RED}║${WHITE}\n"
  printf "  ${RED}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  printf "\n"
  printf "  ${GREEN}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "  ${GREEN}║${WHITE}${CYAN}  >> Inscreva-se no canal Vem Fazer e ajude o projeto!        ${WHITE}${GREEN}║${WHITE}\n"
  printf "  ${GREEN}║${WHITE}${BLUE}     https://www.youtube.com/@vemfazer                        ${WHITE}${GREEN}║${WHITE}\n"
  printf "  ${GREEN}║${WHITE}${YELLOW}     Quem é inscrito tem desconto - fale com o suporte.       ${WHITE}${GREEN}║${WHITE}\n"
  printf "  ${GREEN}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  printf "\n"
}

# Função para manipular erros e encerrar o script
trata_erro() {
  printf "${RED}Erro encontrado na etapa $1. Encerrando o script.${WHITE}\n"
  salvar_etapa "$1"
  exit 1
}

# Salvar variáveis
salvar_variaveis() {
  echo "subdominio_backend=${subdominio_backend}" >$ARQUIVO_VARIAVEIS
  echo "subdominio_frontend=${subdominio_frontend}" >>$ARQUIVO_VARIAVEIS
  echo "email_deploy=${email_deploy}" >>$ARQUIVO_VARIAVEIS
  echo "empresa=${empresa}" >>$ARQUIVO_VARIAVEIS
  echo "senha_deploy=${senha_deploy}" >>$ARQUIVO_VARIAVEIS
  echo "senha_master=${senha_master}" >>$ARQUIVO_VARIAVEIS
  echo "nome_titulo=${nome_titulo}" >>$ARQUIVO_VARIAVEIS
  echo "numero_suporte=${numero_suporte}" >>$ARQUIVO_VARIAVEIS
  echo "facebook_app_id=${facebook_app_id}" >>$ARQUIVO_VARIAVEIS
  echo "facebook_app_secret=${facebook_app_secret}" >>$ARQUIVO_VARIAVEIS
  echo "proxy=${proxy}" >>$ARQUIVO_VARIAVEIS
  echo "backend_port=${backend_port}" >>$ARQUIVO_VARIAVEIS
  echo "frontend_port=${frontend_port}" >>$ARQUIVO_VARIAVEIS
  echo "modo_instalacao=${modo_instalacao}" >>$ARQUIVO_VARIAVEIS
}

# Carregar variáveis
carregar_variaveis() {
  if [ -f $ARQUIVO_VARIAVEIS ]; then
    source $ARQUIVO_VARIAVEIS
  else
    empresa="equipechat"
    nome_titulo="Equipechat Prime"
    modo_instalacao=""
    token_git=""
    repo_git=""
  fi
}

# Auto-detectar diretório de instalação se o backend .env não existir
detectar_instalacao() {
  local backend_env_path="/home/deploy/${empresa}/backend/.env"
  if [ -f "${backend_env_path}" ]; then
    return 0
  fi
  
  printf "${YELLOW} >> Instalação não encontrada em /home/deploy/${empresa}. Procurando...${WHITE}\n"
  local found_dir=""
  for dir in /home/deploy/*/backend/.env; do
    if [ -f "$dir" ]; then
      found_dir=$(dirname "$(dirname "$dir")")
      break
    fi
  done
  
  if [ -n "${found_dir}" ]; then
    empresa=$(basename "${found_dir}")
    printf "${GREEN} >> Instalação detectada: ${found_dir}${WHITE}\n"
    return 0
  fi
  
  printf "${YELLOW} >> Nenhuma instalação detectada automaticamente.${WHITE}\n"
  printf "${WHITE} >> Digite o nome da pasta da instalação em /home/deploy/ (ex: equipechat): \n"
  read -p "> " empresa
  
  if [ ! -f "/home/deploy/${empresa}/backend/.env" ]; then
    printf "${RED} >> ERRO: .env do backend não encontrado em /home/deploy/${empresa}/backend/.env${WHITE}\n"
    sleep 3
    return 1
  fi
  return 0
}

# Salvar etapa concluída
salvar_etapa() {
  echo "$1" >$ARQUIVO_ETAPAS
}

# Carregar última etapa
carregar_etapa() {
  if [ -f $ARQUIVO_ETAPAS ]; then
    etapa=$(cat $ARQUIVO_ETAPAS)
    if [ -z "$etapa" ]; then
      etapa="0"
    fi
  else
    etapa="0"
  fi
}

# === Checkpoint por instância para a opção 11 (multi-instância) ===
NOVA_CHECKPOINT_DIR="/var/lib/equipechat"

nova_ensure_dir() {
  sudo mkdir -p "${NOVA_CHECKPOINT_DIR}" 2>/dev/null || mkdir -p "${NOVA_CHECKPOINT_DIR}" 2>/dev/null || true
  sudo chmod 755 "${NOVA_CHECKPOINT_DIR}" 2>/dev/null || true
}

nova_step_file()  { echo "${NOVA_CHECKPOINT_DIR}/nova_${1}.step"; }
nova_vars_file()  { echo "${NOVA_CHECKPOINT_DIR}/nova_${1}.vars"; }

salvar_etapa_nova() {
  local emp="$1"; local step="$2"
  nova_ensure_dir
  echo "${step}" | sudo tee "$(nova_step_file "${emp}")" >/dev/null 2>&1 || \
    echo "${step}" > "$(nova_step_file "${emp}")"
}

carregar_etapa_nova() {
  local f
  f="$(nova_step_file "$1")"
  if [ -f "${f}" ]; then cat "${f}"; else echo "0"; fi
}

salvar_vars_nova() {
  local emp="$1"
  nova_ensure_dir
  local f tmp
  f="$(nova_vars_file "${emp}")"
  tmp="$(mktemp)"
  cat > "${tmp}" <<NOVAVARS
nova_subdominio_backend='${nova_subdominio_backend}'
nova_subdominio_frontend='${nova_subdominio_frontend}'
nova_email_deploy='${nova_email_deploy}'
nova_empresa='${nova_empresa}'
nova_senha_deploy='${nova_senha_deploy}'
nova_senha_master='${nova_senha_master}'
nova_nome_titulo='${nova_nome_titulo}'
nova_numero_suporte='${nova_numero_suporte}'
nova_facebook_app_id='${nova_facebook_app_id}'
nova_facebook_app_secret='${nova_facebook_app_secret}'
nova_backend_port='${nova_backend_port}'
nova_frontend_port='${nova_frontend_port}'
nova_jwt_secret='${nova_jwt_secret}'
nova_jwt_refresh_secret='${nova_jwt_refresh_secret}'
modo_nova_instalacao='${modo_nova_instalacao}'
token_git_nova='${token_git_nova}'
repo_git_nova='${repo_git_nova}'
NOVAVARS
  sudo mv "${tmp}" "${f}" 2>/dev/null || mv "${tmp}" "${f}"
  sudo chmod 600 "${f}" 2>/dev/null || chmod 600 "${f}" 2>/dev/null || true
}

carregar_vars_nova() {
  local f
  f="$(nova_vars_file "$1")"
  [ -f "${f}" ] && source "${f}"
}

# Lista instâncias com checkpoint incompleto (step < 10)
listar_instalacoes_nova_incompletas() {
  local out=""
  shopt -s nullglob
  for f in "${NOVA_CHECKPOINT_DIR}"/nova_*.step; do
    local name step
    name=$(basename "${f}" .step)
    name="${name#nova_}"
    step=$(cat "${f}" 2>/dev/null)
    if [ -n "${step}" ] && [ "${step}" -lt 10 ] 2>/dev/null; then
      out+="${name}|${step}"$'\n'
    fi
  done
  shopt -u nullglob
  echo -n "${out}"
}

limpar_checkpoint_nova() {
  local emp="$1"
  sudo rm -f "$(nova_step_file "${emp}")" "$(nova_vars_file "${emp}")" 2>/dev/null || \
    rm -f "$(nova_step_file "${emp}")" "$(nova_vars_file "${emp}")" 2>/dev/null || true
}

# Resetar etapas e variáveis
resetar_instalacao() {
  rm -f $ARQUIVO_VARIAVEIS $ARQUIVO_ETAPAS
  printf "${GREEN} >> Instalação resetada! Iniciando uma nova instalação...${WHITE}\n"
  sleep 2
  instalacao_base
}

# Pergunta se deseja continuar ou recomeçar
verificar_arquivos_existentes() {
  if [ -f $ARQUIVO_VARIAVEIS ] && [ -f $ARQUIVO_ETAPAS ]; then
    banner
    printf "${YELLOW} >> Dados de instalação anteriores detectados.\n"
    echo
    carregar_etapa
    if [ "$etapa" -eq 21 ]; then
      printf "${WHITE}>> Instalação já concluída.\n"
      printf "${WHITE}>> Deseja resetar as etapas e começar do zero? (S/N): ${WHITE}\n"
      echo
      read -p "> " reset_escolha
      echo
      reset_escolha=$(echo "${reset_escolha}" | tr '[:lower:]' '[:upper:]')
      if [ "$reset_escolha" == "S" ]; then
        resetar_instalacao
      else
        printf "${GREEN} >> Voltando para o menu principal...${WHITE}\n"
        sleep 2
        menu
      fi
    elif [ "$etapa" -lt 21 ]; then
      printf "${YELLOW} >> Instalação Incompleta Detectada na etapa $etapa. \n"
      printf "${WHITE} >> Deseja continuar de onde parou? (S/N): ${WHITE}\n"
      echo
      read -p "> " escolha
      echo
      escolha=$(echo "${escolha}" | tr '[:lower:]' '[:upper:]')
      if [ "$escolha" == "S" ]; then
        instalacao_base
      else
        printf "${GREEN} >> Voltando ao menu principal...${WHITE}\n"
        printf "${WHITE} >> Caso deseje resetar as etapas, apague os arquivos ETAPAS_INSTALAÇÃO da pasta root...${WHITE}\n"
        sleep 5
        menu
      fi
    fi
  else
    escolher_modo_instalacao
    instalacao_base
  fi
}

# Função para instalar API WhatsMeow
instalar_whatsmeow() {
  banner
  printf "${YELLOW}══════════════════════════════════════════════════════════════════${WHITE}\n"
  printf "${YELLOW}⚠️  ATENÇÃO:${WHITE}\n"
  echo
  printf "${WHITE}   A WhatsMeow é uma API Alternativa à Bayles, muito estável.${WHITE}\n"
  printf "${WHITE}   Ela está disponível apenas para a versão do Equipechat Prime PRO${WHITE}\n"
  printf "${WHITE}   - A partir da Versão ${BLUE}6.4.4${WHITE}.${WHITE}\n"
  echo
  printf "${YELLOW}══════════════════════════════════════════════════════════════════${WHITE}\n"
  echo
  printf "${WHITE}   Deseja continuar? (S/N):${WHITE}\n"
  echo
  read -p "> " confirmacao_whatsmeow
  confirmacao_whatsmeow=$(echo "${confirmacao_whatsmeow}" | tr '[:lower:]' '[:upper:]')
  echo
  
  if [ "${confirmacao_whatsmeow}" != "S" ]; then
    printf "${GREEN} >> Operação cancelada. Voltando ao menu de ferramentas...${WHITE}\n"
    sleep 2
    return
  fi
  
  banner
  printf "${WHITE} >> Digite o TOKEN de autorização do GitHub para acesso ao repositório equipechat-pro:${WHITE}\n"
  echo
  read -p "> " TOKEN_AUTH
  
  if [ -z "$TOKEN_AUTH" ]; then
    printf "${RED}❌ ERRO: Token de autorização não pode estar vazio.${WHITE}\n"
    sleep 2
    return
  fi
  
  printf "${BLUE} >> Token de autorização recebido. Validando...${WHITE}\n"
  echo
  
  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  TEST_DIR="${INSTALADOR_DIR}/test_clone_$(date +%s)"
  REPO_URL="https://${TOKEN_AUTH}@github.com/scriptswhitelabel/equipechat-pro.git"
  
  printf "${WHITE} >> Validando token com teste de git clone...\n"
  echo
  
  if git clone --depth 1 "${REPO_URL}" "${TEST_DIR}" >/dev/null 2>&1; then
    rm -rf "${TEST_DIR}" >/dev/null 2>&1
    printf "${GREEN}✅ Token validado com sucesso! Git clone funcionou corretamente.${WHITE}\n"
    echo
    sleep 2
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    WHATSMEOW_SCRIPT="${SCRIPT_DIR}/instalador_whatsmeow.sh"
    
    if [ -f "$WHATSMEOW_SCRIPT" ]; then
      printf "${GREEN} >> Executando Instalador API WhatsMeow...${WHITE}\n"
      echo
      bash "$WHATSMEOW_SCRIPT"
      echo
      printf "${GREEN} >> Pressione Enter para voltar ao menu de ferramentas...${WHITE}\n"
      read -r
    else
      printf "${RED} >> Erro: Arquivo ${WHATSMEOW_SCRIPT} não encontrado!${WHITE}\n"
      printf "${RED} >> Certifique-se de que o arquivo instalador_whatsmeow.sh está no mesmo diretório do instalador.${WHITE}\n"
      sleep 3
    fi
  else
    rm -rf "${TEST_DIR}" >/dev/null 2>&1
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${RED}❌ ERRO: Token de autorização inválido!${WHITE}\n"
    echo
    printf "${RED}   O teste de git clone falhou. O token informado não tem acesso ao repositório equipechat-pro.${WHITE}\n"
    echo
    printf "${YELLOW}   ⚠️  IMPORTANTE:${WHITE}\n"
    printf "${YELLOW}   O Equipechat Prime é um projeto fechado e requer autorização especial.${WHITE}\n"
    printf "${YELLOW}   Para solicitar acesso, entre em contato com o suporte:${WHITE}\n"
    echo
    printf "${BLUE}   📱 WhatsApp: ${WHITE}81 99998-8876${WHITE}\n"
    echo
    printf "${RED}   Instalação interrompida.${WHITE}\n"
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    echo
    printf "${GREEN} >> Pressione Enter para voltar ao menu de ferramentas...${WHITE}\n"
    read -r
  fi
}

# ============================================================
# Go toolchain — usado só pelo wacalls-chat agora (wacalls-voip removido
# do instalador; o app não fala mais com ele desde a migração pro
# wacalls-chat, que faz mensagem + chamada num serviço só).
#
# IMPORTANTE: a versão do Go NÃO pode ser fixa. O go.mod do wacalls-chat
# evolui (hoje exige go 1.26.4) e um Go antigo já instalado na VPS faz o
# build falhar com "go.mod requires go >= X". Aqui a versão mínima é lida
# direto do go.mod do fonte e o Go é instalado/atualizado quando necessário.
# ============================================================
GO_BIN="go"

_go_ver_ge() { # _go_ver_ge <tem> <precisa>  -> 0 se tem >= precisa
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

_wacalls_ensure_go() {
  local src_gomod="$1"
  local req_ver=""
  [ -f "$src_gomod" ] && req_ver=$(grep -E '^go[[:space:]]+[0-9]' "$src_gomod" | head -1 | awk '{print $2}')
  [ -z "$req_ver" ] && req_ver="1.22.6"
  # go.mod pode trazer só "1.26" — o tarball precisa de x.y.0 nesse caso.
  local dl_ver="$req_ver"
  [ "$(echo "$dl_ver" | awk -F. '{print NF}')" -lt 3 ] && dl_ver="${dl_ver}.0"

  local cur_ver=""
  if command -v go >/dev/null 2>&1; then
    cur_ver=$(go version 2>/dev/null | awk '{print $3}' | sed 's/^go//')
  elif [ -x /usr/local/go/bin/go ]; then
    cur_ver=$(/usr/local/go/bin/go version 2>/dev/null | awk '{print $3}' | sed 's/^go//')
  fi

  if [ -n "$cur_ver" ] && _go_ver_ge "$cur_ver" "$req_ver"; then
    printf "${GREEN} >> [wacalls-chat] Go ${cur_ver} OK (go.mod exige ${req_ver}).${WHITE}\n"
  else
    local arch
    case "$(uname -m)" in
    aarch64 | arm64) arch="arm64" ;;
    *) arch="amd64" ;;
    esac
    if [ -n "$cur_ver" ]; then
      printf "${YELLOW} >> [wacalls-chat] Go ${cur_ver} é antigo (go.mod exige ${req_ver}) — atualizando para ${dl_ver}...${WHITE}\n"
    else
      printf "${BLUE} >> [wacalls-chat] Instalando Go ${dl_ver}...${WHITE}\n"
    fi
    local ok=0
    if curl -fsSL "https://go.dev/dl/go${dl_ver}.linux-${arch}.tar.gz" -o /tmp/go.tgz; then
      ok=1
    else
      # A release exata do go.mod pode não existir como tarball (ex.: versão
      # de toolchain). Cai pra "última estável" e deixa o GOTOOLCHAIN=auto do
      # build baixar o toolchain exigido pelo go.mod.
      local last_ver
      last_ver=$(curl -fsSL "https://go.dev/VERSION?m=text" 2>/dev/null | head -1 | sed 's/^go//')
      if [ -n "$last_ver" ] && curl -fsSL "https://go.dev/dl/go${last_ver}.linux-${arch}.tar.gz" -o /tmp/go.tgz; then
        printf "${YELLOW} >> [wacalls-chat] Go ${dl_ver} indisponível — instalando Go ${last_ver} (o toolchain exato é baixado no build).${WHITE}\n"
        ok=1
      fi
    fi
    if [ "$ok" = "1" ]; then
      rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tgz
      rm -f /tmp/go.tgz
      # Remove um go de pacote (apt/snap) do PATH pra não mascarar o novo.
      rm -f /usr/bin/go /usr/bin/gofmt 2>/dev/null || true
      ln -sf /usr/local/go/bin/go /usr/local/bin/go
      ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
    else
      printf "${RED} >> [wacalls-chat] Não consegui baixar o Go (sem internet?) — tentando com o que já existe na máquina.${WHITE}\n"
    fi
  fi

  if [ -x /usr/local/go/bin/go ]; then
    GO_BIN="/usr/local/go/bin/go"
  else
    GO_BIN="$(command -v go 2>/dev/null || echo go)"
  fi
  printf "${WHITE} >> [wacalls-chat] Usando: $($GO_BIN version 2>/dev/null || echo 'go não encontrado')${WHITE}\n"
}



# ------------------------------------------------------------
# wacalls-chat (github.com/raphaelbat/wacalls-chat) — substitui o
# wacalls-voip por completo: mensagem E chamada de voz real (áudio via
# WebRTC/DataChannel) num serviço só, com um QR só pra parear. Diferente
# do wacalls-voip, esse serviço fala SOMENTE com o backend Node em
# 127.0.0.1 — não precisa de exposição pública nem bloco de Nginx.
# ------------------------------------------------------------
WACALLS_CHAT_DIR="/home/deploy/wacalls-chat"
WACALLS_CHAT_SERVICE="wacalls-chat"
WACALLS_CHAT_PORT=8091
# Só usado como referência/documentação — não é mais usado pra clonar nada em
# tempo de instalação. O código-fonte vem local, na pasta wacalls-chat/ ao
# lado do instalador (ver instala_wacalls_chat_base), igual backend/frontend.
WACALLS_CHAT_REPO="https://github.com/raphaelbat/wacalls-chat.git"

# ---------------------------------------------------------------------------
# VOZ NATURAL GRATUITA (Piper)
#
# A URA de voz fala por TTS. O espeak-ng (instalado acima) resolve, mas soa
# robótico. O Piper dá uma voz natural, roda LOCAL e é gratuito. Sem ele e
# sem o espeak-ng, a URA atendia a ligação e ficava MUDA (só falava com
# chave do ElevenLabs/OpenAI).
#
# Idempotente: se o bridge já responde, não refaz nada. Nunca aborta a
# instalação — sem Piper a URA continua funcionando com o espeak-ng.
# ---------------------------------------------------------------------------
instalar_voz_piper() {
  if curl -sf -m 3 http://127.0.0.1:5005/healthz >/dev/null 2>&1; then
    printf "${GREEN} >> [voz] Piper já está de pé em 127.0.0.1:5005 — nada a fazer.${WHITE}\n"
    return 0
  fi
  printf "${WHITE} >> [voz] Instalando a voz natural gratuita (Piper). Pode levar alguns minutos.${WHITE}\n"

  # 1) Docker
  if ! command -v docker >/dev/null 2>&1; then
    printf "${WHITE} >> [voz] Instalando Docker...${WHITE}\n"
    apt-get update -y >/dev/null 2>&1 || true
    apt-get install -y ca-certificates curl gnupg lsb-release >/dev/null 2>&1 || true
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    chmod a+r /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    # Repositório do Docker pela versão do Ubuntu; se ainda não tiver a versão
    # (lançamento muito novo), usa o do 24.04 (noble). Um repositório que não
    # existe deixava o "apt update" com erro em todas as etapas seguintes.
    _docker_codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
    curl -fsI "https://download.docker.com/linux/ubuntu/dists/${_docker_codename}/Release" >/dev/null 2>&1 || _docker_codename="noble"
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${_docker_codename} stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y >/dev/null 2>&1 || true
    apt-get install -y docker-ce docker-ce-cli containerd.io || apt-get install -y docker.io || printf "${YELLOW} >> [voz] Falha instalando docker${WHITE}\n"
    systemctl enable --now docker >/dev/null 2>&1 || true
  fi

  # 2) Container wyoming-piper (porta 10200, voz PT-BR)
  mkdir -p /var/lib/piper-data
  if docker ps -a --format '{{.Names}}' | grep -q '^piper$'; then
    printf "${WHITE} >> [voz] Atualizando container piper...${WHITE}\n"
    docker pull rhasspy/wyoming-piper >/dev/null 2>&1 || true
    docker rm -f piper >/dev/null 2>&1 || true
  fi
  docker run -d --name piper --restart unless-stopped \
    -p 127.0.0.1:10200:10200 \
    -v /var/lib/piper-data:/data \
    rhasspy/wyoming-piper \
    --voice pt_BR-faber-medium >/dev/null 2>&1 || printf "${YELLOW} >> [voz] Falha ao iniciar container piper${WHITE}\n"

  # 3) Dependências do wrapper e conversão de áudio (ElevenLabs MP3 -> PCM da chamada)
  apt-get install -y python3 python3-pip python3-venv ffmpeg espeak-ng >/dev/null 2>&1 || true
  python3 -m venv /opt/piper-bridge >/dev/null 2>&1 || true
  /opt/piper-bridge/bin/pip install --quiet --upgrade pip >/dev/null 2>&1 || true
  /opt/piper-bridge/bin/pip install --quiet aiohttp wyoming >/dev/null 2>&1 || \
    printf "${YELLOW} >> [voz] Falha ao instalar wyoming/aiohttp${WHITE}\n"

  printf "${WHITE} >> [voz] Pré-aquecendo voz Piper pt_BR-faber-medium (primeira vez pode demorar)...${WHITE}\n"
  timeout 180 docker exec piper python3 - <<'PYEOF' >/dev/null 2>&1 || true
from pathlib import Path
try:
    from piper.voice import PiperVoice
    model = None
    for path in Path('/data').rglob('pt_BR-faber-medium.onnx'):
        model = str(path)
        break
    if model:
        voice = PiperVoice.load(model)
        with open('/tmp/piper-warmup.raw', 'wb') as f:
            voice.synthesize('olá', f)
except Exception:
    pass
PYEOF

  # 4) Wrapper HTTP: POST /api/tts {text, voice?} -> PCM 16k LE mono
  cat > /opt/piper-bridge/bridge.py <<'PYEOF'
#!/usr/bin/env python3
import asyncio, audioop, hashlib, os
from pathlib import Path
from aiohttp import web
from wyoming.client import AsyncTcpClient
from wyoming.tts import Synthesize, SynthesizeVoice
from wyoming.audio import AudioChunk, AudioStop

PIPER_HOST = os.environ.get("PIPER_HOST", "127.0.0.1")
PIPER_PORT = int(os.environ.get("PIPER_PORT", "10200"))
BIND_HOST  = os.environ.get("BIND_HOST", "127.0.0.1")
BIND_PORT  = int(os.environ.get("BIND_PORT", "5005"))
PIPER_TIMEOUT = int(os.environ.get("PIPER_TIMEOUT", "210"))
CACHE_DIR = Path(os.environ.get("PIPER_CACHE_DIR", "/var/cache/piper-bridge"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
LOCK = asyncio.Lock()

def cache_path(text: str, voice: str | None) -> Path:
    h = hashlib.sha1(((voice or "") + "\0" + text).encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{h}.pcm"

async def synth(text: str, voice: str | None) -> bytes:
    cp = cache_path(text, voice)
    if cp.exists() and cp.stat().st_size > 0:
        return cp.read_bytes()
    # Piper/Wyoming can block during first voice load. Serialize generation so
    # multiple inbound calls do not all trigger the expensive warm-up at once.
    async with LOCK:
        if cp.exists() and cp.stat().st_size > 0:
            return cp.read_bytes()
        async with AsyncTcpClient(PIPER_HOST, PIPER_PORT) as client:
            sv = SynthesizeVoice(name=voice) if voice else None
            await client.write_event(Synthesize(text=text, voice=sv).event())
            pcm = bytearray()
            rate = 22050
            width = 2
            channels = 1
            while True:
                ev = await asyncio.wait_for(client.read_event(), timeout=PIPER_TIMEOUT)
                if ev is None:
                    break
                if AudioChunk.is_type(ev.type):
                    ch = AudioChunk.from_event(ev)
                    rate, width, channels = ch.rate, ch.width, ch.channels
                    pcm.extend(ch.audio)
                elif AudioStop.is_type(ev.type):
                    break
        data = bytes(pcm)
        if not data:
            raise RuntimeError("piper returned empty audio")
        if channels == 2:
            data = audioop.tomono(data, width, 1, 1)
        if width != 2:
            data = audioop.lin2lin(data, width, 2)
            width = 2
        if rate != 16000:
            data, _ = audioop.ratecv(data, width, 1, rate, 16000, None)
        tmp = cp.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(cp)
        return data

async def handle_tts(request: web.Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    text = (body.get("text") or "").strip()
    voice = body.get("voice") or None
    if not text:
        return web.Response(status=400, text="missing text")
    try:
        pcm = await asyncio.wait_for(synth(text, voice), timeout=PIPER_TIMEOUT + 10)
    except Exception as e:
        return web.Response(status=502, text=f"piper error: {e}")
    return web.Response(body=pcm, content_type="application/octet-stream")

async def healthz(_):
    return web.Response(text="ok")

app = web.Application()
app.router.add_post("/api/tts", handle_tts)
app.router.add_get("/healthz", healthz)

if __name__ == "__main__":
    web.run_app(app, host=BIND_HOST, port=BIND_PORT, print=None)
PYEOF

  # 5) systemd unit do wrapper
  cat > /etc/systemd/system/piper-bridge.service <<'EOF'
[Unit]
Description=Piper HTTP bridge (Wyoming -> PCM16k)
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=simple
Environment=PIPER_TIMEOUT=210
Environment=PIPER_CACHE_DIR=/var/cache/piper-bridge
ExecStart=/opt/piper-bridge/bin/python /opt/piper-bridge/bridge.py
Restart=always
RestartSec=3
TimeoutStartSec=180

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable piper-bridge.service >/dev/null 2>&1 || true
  systemctl restart piper-bridge.service || printf "${YELLOW} >> [voz] Falha ao iniciar piper-bridge${WHITE}\n"

  sleep 2
  if curl -sf http://127.0.0.1:5005/healthz >/dev/null 2>&1; then
    printf "${WHITE} >> [voz] Aquecendo endpoint TTS para evitar timeout na primeira URA...${WHITE}\n"
    curl --max-time 180 -sf \
      -H 'Content-Type: application/json' \
      -o /tmp/wacalls-piper-warmup.pcm \
      -d '{"text":"olá","voice":"pt_BR-faber-medium"}' \
      http://127.0.0.1:5005/api/tts >/dev/null 2>&1 || \
      printf "${YELLOW} >> [voz] Warm-up do Piper não respondeu ainda; veja: journalctl -u piper-bridge -n 80${WHITE}\n"
    rm -f /tmp/wacalls-piper-warmup.pcm >/dev/null 2>&1 || true
    printf "${GREEN} >> [voz] Piper TTS pronto em http://127.0.0.1:5005/api/tts (voz pt_BR-faber-medium).${WHITE}\n"
  else
    printf "${YELLOW} >> [voz] piper-bridge ainda inicializando. Verifique: systemctl status piper-bridge${WHITE}\n"
  fi

  return 0
}

instalar_wacalls_chat() {
  instala_wacalls_chat_base
  read -p " Pressione Enter para continuar..." _
}

atualizar_wacalls_chat() {
  atualiza_wacalls_chat_base
  liberar_portas_audio_wacalls || true
  read -p " Enter para continuar..." _
}

remover_wacalls_chat() {
  banner
  printf "${RED} >> Removendo wacalls-chat... (dados em ${WACALLS_CHAT_DIR}/data serão APAGADOS)${WHITE}\n"
  read -p " Confirmar? [s/N] " _c
  case "$_c" in [sSyY]*) ;; *) return ;; esac
  systemctl disable --now ${WACALLS_CHAT_SERVICE} 2>/dev/null || true
  rm -f /etc/systemd/system/${WACALLS_CHAT_SERVICE}.service
  systemctl daemon-reload
  rm -rf "$WACALLS_CHAT_DIR"
  printf "${GREEN} >> Removido${WHITE}\n"
  printf "${YELLOW} >> Lembre de apagar WACALLS_CHAT_URL/EMAIL/PASSWORD do .env do backend se não for reinstalar.${WHITE}\n"
  read -p " Enter para continuar..." _
}

# ------------------------------------------------------------
# Versão não-interativa, idempotente (usada tanto na instalação quanto na
# atualização). Igual ao backend/frontend: o código-fonte do wacalls-chat
# fica numa pasta LOCAL ao lado do instalador (wacalls-chat/) e é copiado
# via rsync pra $WACALLS_CHAT_DIR — não depende de 'git clone'/'git pull'
# em tempo de instalação. Isso elimina o problema de patch local vs. git
# pull (mudança não commitada travando atualização futura) porque o patch
# de reação já vem aplicado direto na pasta que é distribuída com o
# instalador. Pra trazer melhorias futuras do repositório público
# (github.com/raphaelbat/wacalls-chat), é só atualizar essa pasta local e
# gerar um novo pacote do instalador — o mesmo fluxo que já é usado pra
# backend/frontend.
# ------------------------------------------------------------
instala_wacalls_chat_base() {
  # O `banner` limpa a tela. No fluxo de ATUALIZAÇÃO isso apagava tudo que
  # já tinha sido mostrado (backend, frontend, APIs) e dava a impressão de
  # que a etapa do WhatsApp Plus nem tinha rodado. Só limpa quando é uma
  # instalação avulsa (menu de Ferramentas), nunca no meio da atualização.
  if [ "${WACALLS_DENTRO_DA_ATUALIZACAO}" != "1" ]; then
    banner
  fi
  printf "${WHITE} >> [wacalls-chat] Instalando mensagem + chamada de voz WhatsApp...${WHITE}\n"
  echo

  # Detecta a instalação do CRM sozinho: a pasta certa é a que tem
  # backend/.env (assim nunca confunde com wacalls-chat/, go/, .cache etc.).
  if [ -z "${empresa}" ] || [ ! -f "/home/deploy/${empresa}/backend/.env" ]; then
    for _d in /home/deploy/*/backend/.env; do
      [ -f "$_d" ] || continue
      empresa=$(basename "$(dirname "$(dirname "$_d")")")
      break
    done
    [ -z "${empresa}" ] && empresa=$(ls -1 /home/deploy 2>/dev/null | grep -vE '^(wacalls-voip|wacalls-chat|go|\..*)$' | head -1)
    printf "${YELLOW} >> [wacalls-chat] Instalação detectada automaticamente como '${empresa}'.${WHITE}\n"
  fi


  # Go é verificado DEPOIS do rsync (logo abaixo), porque a versão mínima
  # é lida do go.mod que vem no código-fonte novo.
  apt-get install -y build-essential sqlite3 ca-certificates >/dev/null 2>&1 || true

  # VOZ DA URA (espeak-ng).
  #
  # A URA de voz precisa FALAR. O código tenta primeiro o Piper (voz natural,
  # em http://127.0.0.1:5005) e, se ele não responder, cai no espeak-ng local.
  # Sem nenhum dos dois, a URA atende a ligação e fica MUDA. São poucos MB,
  # não usa docker, não precisa de chave de API e não depende de internet.
  apt-get install -y espeak-ng >/dev/null 2>&1 || \
    printf "${YELLOW} >> [wacalls-chat] Não instalei o espeak-ng: a URA de voz vai ficar sem voz até instalar (apt install espeak-ng).${WHITE}\n"

  # Voz NATURAL gratuita. O espeak-ng acima é a rede de segurança; o Piper é a
  # voz que o cliente ouve quando tudo está no lugar.
  instalar_voz_piper || true

  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local SRC_DIR="${INSTALADOR_DIR}/wacalls-chat"

  if [ -d "${SRC_DIR}" ]; then
    printf "${WHITE} >> [wacalls-chat] Copiando código-fonte local (${SRC_DIR})...${WHITE}\n"
    mkdir -p "$WACALLS_CHAT_DIR"
    # --delete só dentro do que foi enviado (via --exclude) pra não apagar
    # o binário já compilado nem a pasta data/ (banco sqlite das sessões já
    # pareadas) caso algum arquivo tenha sido removido no fonte local.
    rsync -a --delete --exclude='data' --exclude='/wacalls-chat' --exclude='wacalls-chat.db' --exclude='.git' \
      "${SRC_DIR}/" "${WACALLS_CHAT_DIR}/"
  elif [ -d "$WACALLS_CHAT_DIR/cmd/server" ]; then
    printf "${YELLOW} >> [wacalls-chat] Pasta 'wacalls-chat/' não encontrada ao lado do instalador — mantendo código já instalado em ${WACALLS_CHAT_DIR} sem alterações.${WHITE}\n"
  else
    printf "${RED} >> [wacalls-chat] ERRO: pasta 'wacalls-chat/' não encontrada ao lado do instalador e nenhuma instalação prévia existe.${WHITE}\n"
    printf "${RED} >>                 Coloque a pasta wacalls-chat/ (código-fonte) junto do instalador_single.sh e rode de novo.${WHITE}\n"
    return 1
  fi
  mkdir -p "$WACALLS_CHAT_DIR/data"

  # `media/in` é somente staging: depois do backend copiar o anexo para
  # public/companyN, a versão nova o remove via DELETE autenticado. Esta
  # retenção é uma rede de segurança para arquivos de versões antigas ou
  # downloads cujo ACK se perdeu, impedindo que o staging volte a encher o disco.
  mkdir -p "$WACALLS_CHAT_DIR/media/in"
  cat > /etc/tmpfiles.d/wacalls-chat-media.conf <<EOF
d ${WACALLS_CHAT_DIR}/media/in 0755 deploy deploy 7d
EOF
  systemd-tmpfiles --create /etc/tmpfiles.d/wacalls-chat-media.conf 2>/dev/null || true
  systemd-tmpfiles --clean /etc/tmpfiles.d/wacalls-chat-media.conf 2>/dev/null || true

  chown -R deploy:deploy "$WACALLS_CHAT_DIR"

  # Agora sim: garante um Go compatível com o go.mod que acabou de chegar.
  _wacalls_ensure_go "${WACALLS_CHAT_DIR}/go.mod"

  printf "${BLUE} >> Compilando wacalls-chat (pode demorar 1-2 min)...${WHITE}\n"
  local BUILD_LOG="/tmp/wacalls-chat-build.log"
  # GOTOOLCHAIN=auto: se o Go instalado ainda for mais antigo que o exigido
  # pelo go.mod, o próprio Go baixa o toolchain certo em vez de abortar.
  local BUILD_CMD="cd ${WACALLS_CHAT_DIR} && export GOTOOLCHAIN=auto GOFLAGS=-mod=mod GOPATH=/home/deploy/go GOCACHE=/home/deploy/.cache/go-build PATH=/usr/local/go/bin:\$PATH && ${GO_BIN} mod download && ${GO_BIN} build -o wacalls-chat ./cmd/server"
  if su - deploy -c "$BUILD_CMD" >"$BUILD_LOG" 2>&1; then
    printf "${GREEN} >> [wacalls-chat] Build concluído.${WHITE}\n"
  else
    # Fallback automático: às vezes o build como 'deploy' falha por
    # permissão/cache (GOPATH/GOCACHE sem dono). Tenta como root e devolve
    # o binário pro dono certo — sem exigir nada manual do usuário.
    printf "${YELLOW} >> [wacalls-chat] Build como 'deploy' falhou — tentando novamente como root...${WHITE}\n"
    chown -R deploy:deploy /home/deploy/go /home/deploy/.cache 2>/dev/null || true
    if bash -lc "cd ${WACALLS_CHAT_DIR} && export GOTOOLCHAIN=auto GOFLAGS=-mod=mod PATH=/usr/local/go/bin:\$PATH && ${GO_BIN} mod download && ${GO_BIN} build -o wacalls-chat ./cmd/server" >>"$BUILD_LOG" 2>&1; then
      chown deploy:deploy "${WACALLS_CHAT_DIR}/wacalls-chat"
      printf "${GREEN} >> [wacalls-chat] Build concluído (root).${WHITE}\n"
    else
      printf "${RED} >> [wacalls-chat] Falha no build. Últimas linhas do log (${BUILD_LOG}):${WHITE}\n"
      tail -n 20 "$BUILD_LOG"
      if [ -x "${WACALLS_CHAT_DIR}/wacalls-chat" ]; then
        printf "${YELLOW} >> [wacalls-chat] Mantendo o binário anterior em funcionamento (serviço não foi derrubado).${WHITE}\n"
      else
        printf "${RED} >> [wacalls-chat] Nenhum binário anterior — WhatsApp Plus ficará indisponível até o build passar.${WHITE}\n"
      fi
      return 1
    fi
  fi




  BACKEND_ENV="/home/deploy/${empresa}/backend/.env"

  # Reaproveita a conta de serviço já existente no .env — só gera uma nova
  # se ainda não tiver, pra não invalidar um login que já está funcionando
  # numa atualização. O próprio wacalls-chat cria essa conta sozinho no
  # primeiro start (flag -seed-admin-*), então não precisa criar via UI.
  SEED_EMAIL=""
  SEED_PASS=""
  if [ -f "$BACKEND_ENV" ]; then
    SEED_EMAIL=$(grep -E "^WACALLS_CHAT_EMAIL=" "$BACKEND_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
    SEED_PASS=$(grep -E "^WACALLS_CHAT_PASSWORD=" "$BACKEND_ENV" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
  fi
  # Sanitiza: nome de empresa com caractere estranho (ou linha vazia no .env)
  # gerava "invalid email" no seed do wacalls-chat e o serviço subia sem conta
  # de serviço — o backend nunca conseguia logar e o QR nunca aparecia.
  _EMP_SLUG=$(printf '%s' "${empresa}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]//g')
  [ -z "$_EMP_SLUG" ] && _EMP_SLUG="equipechat"
  case "$SEED_EMAIL" in
    ?*@?*.?*) ;;
    *) SEED_EMAIL="servico@${_EMP_SLUG}.wacalls.local" ;;
  esac
  [ -z "$SEED_PASS" ] && SEED_PASS=$(openssl rand -hex 16)


  # UID do usuário 'deploy' — usado pra apontar o wacalls-chat pro socket do
  # PulseAudio de sessão dele (ver instala_sip_baresip logo abaixo). Se por
  # algum motivo o usuário ainda não existir aqui, cai pra 1000 (UID padrão
  # do primeiro usuário criado em Debian/Ubuntu) só pra não deixar a unit
  # com uma variável vazia — o setup do SIP corrige isso rodando de novo.
  DEPLOY_UID=$(id -u deploy 2>/dev/null || echo 1000)

  # SESSION_SECRET do wacalls-chat: gerado UMA vez por instalação e reutilizado
  # em toda atualização (se for trocado, as credenciais da Cloud API já
  # gravadas no banco deixam de ser decifráveis).
  if [ ! -s /etc/equipechat-wacalls-secret.env ]; then
    printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)" > /etc/equipechat-wacalls-secret.env
    chmod 600 /etc/equipechat-wacalls-secret.env
  fi


  # Nome que aparece no celular do cliente em "Dispositivos conectados" ao
  # parear a conexão WhatsApp Plus. Antes ficava fixo como "EquipeChat" no
  # código Go, então instalação com marca própria aparecia com o nome errado
  # no aparelho do cliente. Busca o appName do whitelabel no banco; se não
  # houver, o próprio binário cai no padrão.
  WACALLS_DEVICE_NAME=$(sudo -u postgres psql -tAc \
    "SELECT value FROM \"Settings\" WHERE key='appName' AND value <> '' LIMIT 1;" \
    "${empresa}" 2>/dev/null | tr -d '[:space:]' || true)
  [ -z "${WACALLS_DEVICE_NAME}" ] && WACALLS_DEVICE_NAME="EquipeChat"

  cat > /etc/systemd/system/${WACALLS_CHAT_SERVICE}.service <<EOF
[Unit]
Description=wacalls-chat (mensagem + chamada de voz WhatsApp)
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=${WACALLS_CHAT_DIR}
ExecStart=${WACALLS_CHAT_DIR}/wacalls-chat -addr :${WACALLS_CHAT_PORT} -db ${WACALLS_CHAT_DIR}/data/wacalls-chat.db -seed-admin-email ${SEED_EMAIL} -seed-admin-password ${SEED_PASS}
Restart=always
RestartSec=3
Environment=HOME=${WACALLS_CHAT_DIR}
Environment=WACALLS_DEVICE_NAME=${WACALLS_DEVICE_NAME}
# Troncal SIP (baresip) — cada empresa tem sua PRÓPRIA troncal isolada,
# spawnada sob demanda pelo próprio wacalls-chat (ver cmd/server/sipregistry.go),
# não mais um baresip.service único do sistema. XDG_RUNTIME_DIR/PULSE_SERVER
# continuam necessários: é como o wacalls-chat consegue (a) rodar `pactl`
# pra criar os dispositivos de áudio virtuais de cada empresa e (b) os
# processos baresip que ele mesmo spawna (filhos, herdam esse ambiente)
# conseguem abrir o PulseAudio de sessão do usuário 'deploy' (ver
# instala_sip_baresip_base). Sem isso tudo falha com "connection refused"
# mesmo com o wacalls-chat rodando normalmente.
Environment=XDG_RUNTIME_DIR=/run/user/${DEPLOY_UID}
Environment=PULSE_SERVER=unix:/run/user/${DEPLOY_UID}/pulse/native
# BARESIP_BIN/BARESIP_MOD_DIR/SIP_AUDIO_BACKEND/SIP_TRUNKS_DIR são escritos
# por instala_sip_baresip_base (menu Ferramentas → Instalar troncal SIP) — o
# "-" faz o systemd ignorar de boa se o arquivo ainda não existir (SIP fica
# indisponível até essa opção ser instalada, sem quebrar o resto do sistema).
EnvironmentFile=-/etc/equipechat-wacalls-sip-audio.env
# Retenção/manutenção automática (ver cmd/server/maintenance.go): evita que o
# SQLite e a pasta media/ cresçam sem limite como aconteceu antes (89 GB).
# Teto de memória do Go. Sem isso o coletor de lixo só age quando a memória
# já dobrou, e o processo vai acumulando por dias sem devolver nada ao
# sistema (foi visto chegando a 4,4 GB). Com GOMEMLIMIT o Go passa a coletar
# de forma mais agressiva ao se aproximar do limite, mantendo o consumo
# estável. MemoryMax é a rede de segurança do systemd: se algo escapar do
# controle do Go, o serviço é reiniciado em vez de comprometer a VPS.
Environment=GOMEMLIMIT=1500MiB
MemoryMax=2G
Environment=WACALLS_RETENTION_DAYS=180
Environment=WACALLS_AUDIT_RETENTION_DAYS=90
Environment=WACALLS_MEDIA_RETENTION_DAYS=7
Environment=WACALLS_MESSAGE_RETENTION_DAYS=0
# Chave usada para cifrar credenciais da Cloud API no banco. Gerada uma única
# vez por instalação; sem ela o serviço cai num arquivo local .wacalls_secret.
EnvironmentFile=-/etc/equipechat-wacalls-secret.env



[Install]
WantedBy=multi-user.target
EOF
  # Remove unit antiga criada manualmente em outro caminho/porta, se houver.
  systemctl daemon-reload
  systemctl enable ${WACALLS_CHAT_SERVICE} >/dev/null 2>&1
  systemctl restart ${WACALLS_CHAT_SERVICE}

  # Injeta WACALLS_CHAT_URL/EMAIL/PASSWORD no backend — é assim que o Node
  # loga no wacalls-chat e mantém o cookie de sessão pra mensagem e chamada.
  # Só fala em 127.0.0.1: não precisa expor porta nem mexer no Nginx.
  if [ -f "$BACKEND_ENV" ]; then
    grep -q "^WACALLS_CHAT_URL=" "$BACKEND_ENV" && sed -i "s|^WACALLS_CHAT_URL=.*|WACALLS_CHAT_URL=http://127.0.0.1:${WACALLS_CHAT_PORT}|" "$BACKEND_ENV" || echo "WACALLS_CHAT_URL=http://127.0.0.1:${WACALLS_CHAT_PORT}" >> "$BACKEND_ENV"
    grep -q "^WACALLS_CHAT_EMAIL=" "$BACKEND_ENV" && sed -i "s|^WACALLS_CHAT_EMAIL=.*|WACALLS_CHAT_EMAIL=${SEED_EMAIL}|" "$BACKEND_ENV" || echo "WACALLS_CHAT_EMAIL=${SEED_EMAIL}" >> "$BACKEND_ENV"
    grep -q "^WACALLS_CHAT_PASSWORD=" "$BACKEND_ENV" && sed -i "s|^WACALLS_CHAT_PASSWORD=.*|WACALLS_CHAT_PASSWORD=${SEED_PASS}|" "$BACKEND_ENV" || echo "WACALLS_CHAT_PASSWORD=${SEED_PASS}" >> "$BACKEND_ENV"
    su - deploy -c "pm2 restart all --update-env" >/dev/null 2>&1 || pm2 restart all --update-env >/dev/null 2>&1 || true
    printf "${GREEN} >> [wacalls-chat] WACALLS_CHAT_URL/EMAIL/PASSWORD garantidos em ${BACKEND_ENV}${WHITE}\n"
  else
    printf "${YELLOW} >> [wacalls-chat] Backend .env não encontrado em ${BACKEND_ENV} — configure manualmente depois.${WHITE}\n"
  fi

  # Health-check automático: espera a porta responder de verdade (até ~20s)
  # em vez de só olhar "is-active", e já valida se a conta de serviço foi
  # criada. Assim a instalação/atualização termina sem nenhum passo manual.
  local _ok=0 _i=0
  while [ $_i -lt 20 ]; do
    if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${WACALLS_CHAT_PORT}/" \
      || curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${WACALLS_CHAT_PORT}/api/session"; then
      _ok=1; break
    fi
    _i=$((_i+1)); sleep 1
  done

  if [ "$_ok" = "1" ] && systemctl is-active --quiet ${WACALLS_CHAT_SERVICE}; then
    printf "${GREEN} >> wacalls-chat ATIVO e respondendo em 127.0.0.1:${WACALLS_CHAT_PORT}${WHITE}\n"
  else
    # Uma segunda tentativa automática antes de desistir (cobre corrida de
    # porta ainda em TIME_WAIT depois de trocar a unit).
    printf "${YELLOW} >> [wacalls-chat] Não respondeu ainda — reiniciando uma vez...${WHITE}\n"
    systemctl restart ${WACALLS_CHAT_SERVICE}; sleep 5
    if systemctl is-active --quiet ${WACALLS_CHAT_SERVICE}; then
      printf "${GREEN} >> wacalls-chat ATIVO na porta ${WACALLS_CHAT_PORT}${WHITE}\n"
    else
      printf "${RED} >> wacalls-chat NÃO subiu. Logs: journalctl -u ${WACALLS_CHAT_SERVICE} -n 50 --no-pager${WHITE}\n"
      journalctl -u ${WACALLS_CHAT_SERVICE} -n 15 --no-pager 2>/dev/null || true
    fi
  fi

  if journalctl -u ${WACALLS_CHAT_SERVICE} -n 40 --no-pager 2>/dev/null | grep -q "seed admin failed"; then
    printf "${RED} >> [wacalls-chat] Conta de serviço não pôde ser criada (seed admin failed) — verifique WACALLS_CHAT_EMAIL no .env.${WHITE}\n"
  fi

  printf "${WHITE}    Conta de serviço: ${SEED_EMAIL}${WHITE}\n"
  printf "${WHITE}    Status:           systemctl status ${WACALLS_CHAT_SERVICE}${WHITE}\n"
  echo
  return 0

}

# Wrapper de update usado pelo atualizar_base — a própria instala_wacalls_chat_base
# já é idempotente (rsync do código local + reaproveita credenciais existentes),
# então só repassa.
atualiza_wacalls_chat_base() {
  printf "${WHITE} >> [wacalls-chat] Atualizando (código local + rebuild)...${WHITE}\n"
  WACALLS_DENTRO_DA_ATUALIZACAO=1
  instala_wacalls_chat_base
  local _rc=$?
  WACALLS_DENTRO_DA_ATUALIZACAO=0
  return $_rc
}

# ------------------------------------------------------------
# Troncal SIP (baresip) — permite ligar/receber por uma linha SIP comum
# (Asterisk, FreePBX, operadora VoIP) pelo MESMO discador do WhatsApp Plus,
# sem depender do WhatsApp. CADA EMPRESA tem sua própria troncal isolada:
# processo baresip próprio, socket ctrl_tcp próprio e par de dispositivos de
# áudio próprio — o wacalls-chat spawna/gerencia esses processos ele mesmo
# (ver cmd/server/sipregistry.go), sob demanda, quando uma empresa salva
# host/usuário/senha na tela de conexão do CRM. Esta função do instalador só
# prepara a BASE compartilhada por todas as empresas:
#   - pacote baresip instalado
#   - detecção de onde ficam os módulos .so e o binário
#   - backend de áudio (PulseAudio de sessão do usuário 'deploy', ou ALSA
#     Loopback quando disponível) — servidor de áudio ÚNICO que hospeda N
#     pares de dispositivo virtual, um por empresa
#   - essas informações num arquivo de env que a unit do wacalls-chat já lê
#     (EnvironmentFile=-/etc/equipechat-wacalls-sip-audio.env)
#
# ANTES disso era uma troncal (config, processo, dispositivos de áudio) só
# pro servidor inteiro — se uma segunda empresa configurasse SIP, a config
# dela sobrescrevia a da primeira, e as duas empresas viam a ligação uma da
# outra. Não existe mais "instalar UMA troncal": esta função só garante que
# o TERRENO pra qualquer número de empresas ligarem SIP está pronto.
#
# AVISO: este setup nunca foi testado contra um baresip/troncal real — foi
# escrito com base na documentação oficial do baresip (ctrl_tcp, accounts,
# audio_player/audio_source). É esperado precisar de ajuste fino no primeiro
# uso (ex.: nome exato do pacote baresip na sua distro, se o módulo ctrl_tcp
# já vem habilitado por padrão).
# ------------------------------------------------------------
SIP_TRUNKS_DIR="/home/deploy/.baresip-trunks"

# ------------------------------------------------------------
# Versão não-interativa, idempotente (usada tanto na instalação do zero
# quanto na atualização, ver instalacao_base/atualizar_base) — mesma
# convenção do wacalls-chat (instala_wacalls_chat_base). Sem nenhum
# 'read -p' aqui dentro: quem precisa pausar pra usuário ler é só o wrapper
# interativo do menu (instala_sip_baresip, logo abaixo).
# ------------------------------------------------------------
instala_sip_baresip_base() {
  banner
  printf "${WHITE} >> [SIP] Preparando base da troncal SIP (baresip + PulseAudio)...${WHITE}\n"
  echo

  if ! id deploy >/dev/null 2>&1; then
    printf "${RED} >> [SIP] Usuário 'deploy' não existe ainda — instale o backend/wacalls-chat primeiro.${WHITE}\n"
    return 1
  fi

  # Limpeza de instalações antigas (antes da troncal-por-empresa): versões
  # anteriores criavam um "baresip.service" ÚNICO pro servidor inteiro via
  # systemd de SISTEMA. Se ele continuar rodando depois da atualização, fica
  # brigando pela mesma conta/porta que o processo baresip isolado da empresa
  # (spawnado pelo próprio wacalls-chat) tenta usar — sintoma: a tela de
  # troncal SIP do CRM mostra "desconectado"/"desabilitada" mesmo depois de
  # salvar de novo. Idempotente: silencioso se essa unit nunca existiu.
  if systemctl list-unit-files 2>/dev/null | grep -q "^baresip\.service"; then
    printf "${YELLOW} >> [SIP] Encontrada troncal SIP antiga (baresip.service único do sistema) — desativando, pois cada empresa agora tem a própria troncal isolada...${WHITE}\n"
    systemctl disable --now baresip.service 2>/dev/null || true
    rm -f /etc/systemd/system/baresip.service
    systemctl daemon-reload 2>/dev/null || true
  fi

  printf "${BLUE} >> [SIP] Instalando pacotes (baresip, pulseaudio, alsa-utils)...${WHITE}\n"
  apt-get update -y >/dev/null 2>&1 || true
  apt-get install -y baresip baresip-x11 pulseaudio pulseaudio-utils alsa-utils >/dev/null 2>&1
  if ! command -v baresip >/dev/null 2>&1; then
    apt-get install -y baresip >/dev/null 2>&1
  fi
  if ! command -v baresip >/dev/null 2>&1; then
    printf "${RED} >> [SIP] Pacote 'baresip' não encontrado nos repositórios desta distro.${WHITE}\n"
    printf "${RED} >>       Instale manualmente (compilando do fonte: https://github.com/baresip/baresip) e rode esta opção de novo (instalador → Ferramentas → Instalar troncal SIP).${WHITE}\n"
    return 1
  fi
  BARESIP_BIN=$(command -v baresip)

  DEPLOY_UID=$(id -u deploy)
  # Lingering: mantém a sessão (e o PulseAudio dela) viva mesmo sem login
  # interativo — essencial pra rodar áudio de usuário num servidor headless
  # controlado só por systemd.
  loginctl enable-linger deploy >/dev/null 2>&1 || true

  mkdir -p "${SIP_TRUNKS_DIR}"
  chown deploy:deploy "${SIP_TRUNKS_DIR}"

  # Backend de áudio da ponte SIP (ver wacalls-chat/cmd/server/sipaudio.go):
  # tenta ALSA Loopback (módulo de kernel snd-aloop) primeiro, porque não
  # depende de sessão de usuário/D-Bus — foi exatamente essa dependência que
  # causou toda a instabilidade intermitente do PulseAudio ("Connection
  # refused" indo e voltando, pulseaudio.service em crash-loop) depurada
  # nesse servidor. Se o kernel não tiver o módulo disponível (comum em
  # alguns kernels de VPS customizados/containers), cai pro PulseAudio
  # normalmente — caminho já testado e funcional. NOTA: o backend ALSA só
  # isola até 4 empresas simultâneas por padrão (8 subdispositivos
  # snd-aloop, 2 por empresa — ver sipregistry.go); o backend PulseAudio não
  # tem esse limite (dispositivos virtuais criados sob demanda, um par por
  # empresa, sem teto prático).
  #
  # AVISO: o backend ALSA nunca foi testado ao vivo contra um baresip real
  # (sem esse hardware/software disponível no ambiente onde isso foi
  # escrito) — se depois de instalar o áudio não fluir com "backend=alsa"
  # nos logs do wacalls-chat, o mais provável é o pareamento de
  # subdispositivos do snd-aloop (ver comentário em sipaudio.go/sipregistry.go)
  # precisar de ajuste fino nesse kernel específico.
  SIP_AUDIO_BACKEND="pulse"
  modprobe snd-aloop 2>/dev/null || true
  if [ -e /proc/asound/Loopback ] || (command -v aplay >/dev/null 2>&1 && aplay -l 2>/dev/null | grep -qi loopback); then
    SIP_AUDIO_BACKEND="alsa"
    if ! grep -qx "snd-aloop" /etc/modules 2>/dev/null; then
      echo "snd-aloop" >> /etc/modules
    fi
    printf "${GREEN} >> [SIP] snd-aloop (ALSA Loopback) disponível — usando como backend de áudio da troncal.${WHITE}\n"
  else
    printf "${YELLOW} >> [SIP] snd-aloop não disponível nesse kernel — usando PulseAudio como backend de áudio (funcional, sem limite de empresas).${WHITE}\n"
  fi

  # Descobre onde o pacote instalou de fato os módulos .so do baresip — o
  # wacalls-chat usa isso pra montar "module_path" na config de cada troncal
  # que ele mesmo gera (ver sipregistry.go). Sem isso os módulos falham com
  # "No such file or directory" (foi exatamente isso que aconteceu no design
  # original: ctrl_tcp.so nunca carregava, a porta de controle nunca abria).
  # Varia por distro/arquitetura, então detecta em vez de fixar um caminho só.
  BARESIP_MOD_DIR=""
  for _cand in \
    "/usr/lib/$(dpkg --print-architecture 2>/dev/null)-linux-gnu/baresip/modules" \
    "/usr/lib/$(uname -m)-linux-gnu/baresip/modules" \
    "/usr/lib/baresip/modules" \
    "/usr/local/lib/baresip/modules" \
    "/usr/lib64/baresip/modules"; do
    if [ -d "$_cand" ] && ls "$_cand"/*.so >/dev/null 2>&1; then
      BARESIP_MOD_DIR="$_cand"
      break
    fi
  done
  if [ -z "$BARESIP_MOD_DIR" ]; then
    # Última tentativa: pergunta ao dpkg onde ele realmente colocou os .so.
    BARESIP_MOD_DIR=$(dpkg -L baresip 2>/dev/null | grep '\.so$' | head -1 | xargs -r dirname)
  fi
  if [ -z "$BARESIP_MOD_DIR" ]; then
    printf "${YELLOW} >> [SIP] Não encontrei a pasta de módulos do baresip automaticamente — os módulos (ctrl_tcp, pulse, g711) podem não carregar pras troncais que forem criadas. Rode 'dpkg -L baresip | grep .so' pra achar o caminho manualmente e defina BARESIP_MOD_DIR em /etc/equipechat-wacalls-sip-audio.env.${WHITE}\n"
  else
    printf "${WHITE}    Módulos do baresip encontrados em ${BARESIP_MOD_DIR}${WHITE}\n"
  fi

  # Configs/contas de cada empresa são geradas pelo PRÓPRIO wacalls-chat
  # (sipregistry.go) na primeira vez que ela salva a troncal — nada fixo é
  # escrito aqui. Só persistimos o que é comum a todas: backend de áudio,
  # binário/módulos do baresip, e onde ficam as configs por empresa.
  cat > /etc/equipechat-wacalls-sip-audio.env <<EOF
SIP_AUDIO_BACKEND=${SIP_AUDIO_BACKEND}
BARESIP_BIN=${BARESIP_BIN}
BARESIP_MOD_DIR=${BARESIP_MOD_DIR}
SIP_TRUNKS_DIR=${SIP_TRUNKS_DIR}
EOF

  if [ "$SIP_AUDIO_BACKEND" = "pulse" ]; then
    printf "${BLUE} >> [SIP] Criando serviço systemd (PulseAudio de sessão)...${WHITE}\n"
    # PulseAudio "de sessão" do usuário deploy, mantido vivo via linger. Não é
    # 'pulseaudio --system' (desaconselhado pelo próprio projeto) — é a
    # instância de usuário normal, só que iniciada por systemd em vez de por
    # login gráfico. Serve de servidor de áudio COMPARTILHADO: cada empresa
    # ganha seu próprio PAR de dispositivos virtuais dentro dessa mesma
    # sessão (criados sob demanda pelo wacalls-chat via `pactl`, não mais
    # fixos aqui no instalador — ver sipregistry.go/ensurePulseDevices).
    #
    # NÃO usamos o pulseaudio.service padrão do pacote (mesmo com um
    # override de Restart=). Em produção ele ficou preso em crash-loop
    # ("Main process exited, code=exited, status=1/FAILURE" repetido até o
    # systemd desistir com "Start request repeated too quickly") — o binário
    # dele tem algum conflito nesse ambiente (unit/socket do pacote, D-Bus da
    # sessão sem login gráfico, etc.) que não foi possível confirmar sem um
    # log verboso. `pulseaudio --start` direto (o comando de autospawn do
    # próprio pulseaudio, sem depender da unit do pacote) sobe sem erro nesse
    # mesmo servidor — então usamos uma unit systemd NOSSA, que roda o
    # binário do pulseaudio direto (sem depender da unit/socket do pacote,
    # que ficam desativados) e o systemd supervisiona com Restart=always de
    # verdade.
    su - deploy -c "XDG_RUNTIME_DIR=/run/user/${DEPLOY_UID} systemctl --user disable --now pulseaudio.service pulseaudio.socket" 2>/dev/null || true
    su - deploy -c "XDG_RUNTIME_DIR=/run/user/${DEPLOY_UID} systemctl --user mask pulseaudio.service pulseaudio.socket" 2>/dev/null || true
    rm -rf /home/deploy/.config/systemd/user/pulseaudio.service.d
    mkdir -p /home/deploy/.config/systemd/user
    cat > /home/deploy/.config/systemd/user/wacalls-pulseaudio.service <<'EOF'
[Unit]
Description=PulseAudio dedicado (ponte de audio SIP/WhatsApp Plus) — nao usa a unit padrao do pacote pulseaudio, que se mostrou instavel neste tipo de ambiente (servidor sem sessao grafica)

[Service]
Type=simple
# Remove um pidfile travado de uma instancia anterior que morreu sem limpar
# (causa comum de falha silenciosa ao subir de novo).
ExecStartPre=-/bin/rm -f %t/pulse/pid
ExecStart=/usr/bin/pulseaudio --daemonize=no --exit-idle-time=-1 --disallow-exit
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
EOF
    chown -R deploy:deploy /home/deploy/.config/systemd
    su - deploy -c "XDG_RUNTIME_DIR=/run/user/${DEPLOY_UID} systemctl --user daemon-reload" 2>/dev/null || true
    su - deploy -c "XDG_RUNTIME_DIR=/run/user/${DEPLOY_UID} systemctl --user enable --now wacalls-pulseaudio.service" 2>/dev/null || \
      su - deploy -c "XDG_RUNTIME_DIR=/run/user/${DEPLOY_UID} pulseaudio --start" 2>/dev/null || true
  else
    printf "${BLUE} >> [SIP] Backend de áudio ALSA (snd-aloop) — sem serviço de PulseAudio adicional.${WHITE}\n"
    # ALSA Loopback é módulo de kernel, não depende de sessão de usuário —
    # não precisa de nenhum serviço de áudio separado (o dispositivo
    # hw:Loopback já existe assim que o módulo carrega, sem lifecycle de
    # sessão pra esperar).
  fi

  # O wacalls-chat precisa reiniciar pra pegar as novas variáveis de ambiente
  # (via EnvironmentFile=-/etc/equipechat-wacalls-sip-audio.env, já
  # referenciado na unit dele — ver instala_wacalls_chat_base) — isso também
  # dispara a restauração automática (RestoreAll, sipregistry.go) de
  # qualquer troncal que alguma empresa já tivesse habilitado antes. Só
  # reinicia se ele já estiver instalado.
  if systemctl list-unit-files 2>/dev/null | grep -q "^${WACALLS_CHAT_SERVICE}\.service"; then
    systemctl restart ${WACALLS_CHAT_SERVICE} 2>/dev/null || true
    sleep 2
    if systemctl is-active --quiet ${WACALLS_CHAT_SERVICE}; then
      printf "${GREEN} >> [SIP] Base pronta, wacalls-chat reiniciado.${WHITE}\n"
    else
      printf "${RED} >> [SIP] wacalls-chat NÃO subiu depois do restart. Logs: journalctl -u ${WACALLS_CHAT_SERVICE} -n 50 --no-pager${WHITE}\n"
    fi
  else
    printf "${YELLOW} >> [SIP] wacalls-chat ainda não está instalado — a base SIP já está pronta e vai ser usada assim que ele subir.${WHITE}\n"
  fi
  printf "${WHITE}    Agora cada empresa configura host/usuário/senha da PRÓPRIA troncal na tela de conexão do WhatsApp Plus no CRM (aba SIP do discador) — a troncal daquela empresa é criada na hora, isolada das demais.${WHITE}\n"
  printf "${WHITE}    Logs de uma troncal específica: journalctl -u ${WACALLS_CHAT_SERVICE} -n 200 --no-pager | grep companyId${WHITE}\n"
  echo
  return 0
}

# Wrapper interativo (menu Ferramentas → Instalar troncal SIP): mesma lógica
# de cima, só com a pausa pro usuário ler o resultado antes de voltar ao menu.
instala_sip_baresip() {
  instala_sip_baresip_base
  read -p " Enter para continuar..." _
}

remover_sip_baresip() {
  banner
  printf "${RED} >> Removendo base da troncal SIP...${WHITE}\n"
  printf "${YELLOW}    Isso NÃO desliga a troncal de nenhuma empresa específica (cada uma é um processo gerido pelo próprio wacalls-chat) — pra isso, desabilite SIP na tela de conexão de cada empresa no CRM. Aqui só removemos a base compartilhada (env de backend de áudio + serviço de PulseAudio de sessão).${WHITE}\n"
  read -p " Confirmar? [s/N] " _c
  case "$_c" in [sSyY]*) ;; *) return ;; esac
  su - deploy -c "XDG_RUNTIME_DIR=/run/user/$(id -u deploy 2>/dev/null || echo 1000) systemctl --user disable --now wacalls-pulseaudio.service" 2>/dev/null || true
  rm -f /home/deploy/.config/systemd/user/wacalls-pulseaudio.service
  rm -f /etc/equipechat-wacalls-sip-audio.env
  if systemctl list-unit-files 2>/dev/null | grep -q "^${WACALLS_CHAT_SERVICE}\.service"; then
    systemctl restart ${WACALLS_CHAT_SERVICE} 2>/dev/null || true
  fi
  printf "${GREEN} >> Base removida (configs por empresa em ${SIP_TRUNKS_DIR} não foram apagadas — remova manualmente se quiser limpar tudo).${WHITE}\n"
  read -p " Enter para continuar..." _
}


# Garante as chaves VAPID (Push Notifications) no .env do backend.
# Autocontida (não depende de tools/instalar_push.sh, que é o motivo pelo
# qual "Ferramentas -> Instalar Push Notifications" vinha falhando com
# "Arquivo não encontrado" quando essa pasta não existia na VPS).
# Idempotente: se já tem chave válida, não mexe em nada. Usada tanto no
# instalador de tools quanto automaticamente na instalação nova e na
# atualização.
garantir_push_notifications_env() {
  local env_file="$1"
  local subject_email="${2:-admin@equipechat.com.br}"

  if [ ! -f "${env_file}" ]; then
    printf "${RED} >> Push Notifications: .env não encontrado em ${env_file}${WHITE}\n"
    return 1
  fi

  local pub priv
  pub=$(grep -E '^VAPID_PUBLIC_KEY=' "${env_file}" | tail -1 | cut -d'=' -f2-)
  priv=$(grep -E '^VAPID_PRIVATE_KEY=' "${env_file}" | tail -1 | cut -d'=' -f2-)

  # Considera "não configurado" tanto a ausência quanto sobras de
  # placeholder de uma geração anterior que falhou (ex: sem internet no
  # momento do install/update).
  if [ -n "${pub}" ] && [ -n "${priv}" ] \
     && [[ "${pub}" != *PLACEHOLDER* ]] && [[ "${priv}" != *PLACEHOLDER* ]]; then
    printf "${GREEN} >> Push Notifications: chaves VAPID já configuradas.${WHITE}\n"
    return 0
  fi

  printf "${WHITE} >> Push Notifications: chaves VAPID ausentes/incompletas — gerando automaticamente...${WHITE}\n"

  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  fi

  local vapid_keys vapid_pub vapid_priv
  vapid_keys=$(npx --yes web-push generate-vapid-keys --json 2>/dev/null)
  vapid_pub=$(echo "${vapid_keys}" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4)
  vapid_priv=$(echo "${vapid_keys}" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4)

  if [ -z "${vapid_pub}" ] || [ -z "${vapid_priv}" ]; then
    printf "${RED} >> Push Notifications: falha ao gerar chaves VAPID (sem acesso ao npm/registry agora?).${WHITE}\n"
    printf "${YELLOW}    Rode manualmente depois: npx web-push generate-vapid-keys${WHITE}\n"
    return 1
  fi

  # Remove qualquer linha antiga (vazia, quebrada ou placeholder) e escreve
  # as chaves novas, sem duplicar.
  sed -i '/^VAPID_PUBLIC_KEY=/d; /^VAPID_PRIVATE_KEY=/d; /^VAPID_SUBJECT=/d' "${env_file}"
  {
    echo ""
    echo "# Push Notifications (VAPID) - geradas automaticamente pelo instalador"
    echo "VAPID_PUBLIC_KEY=${vapid_pub}"
    echo "VAPID_PRIVATE_KEY=${vapid_priv}"
    echo "VAPID_SUBJECT=mailto:${subject_email}"
  } >>"${env_file}"

  printf "${GREEN} >> Push Notifications: chaves VAPID geradas e salvas em ${env_file}${WHITE}\n"
  PUSH_VAPID_RENOVADO=1
  return 0
}

# Menu de Ferramentas
menu_ferramentas() {

  while true; do
    banner
    printf "${WHITE} Selecione abaixo a ferramenta desejada: \n"
    echo
    printf "   [${BLUE}1${WHITE}] Instalador RabbitMQ\n"
    printf "   [${BLUE}2${WHITE}] Instalar Push Notifications\n"
    printf "   [${BLUE}3${WHITE}] Instalar API WhatsMeow\n"
    printf "   [${BLUE}4${WHITE}] Instalar wacalls-chat (mensagem + chamada WhatsApp)\n"
    printf "   [${BLUE}5${WHITE}] Atualizar wacalls-chat\n"
    printf "   [${BLUE}6${WHITE}] Remover wacalls-chat\n"
    printf "   [${BLUE}7${WHITE}] Instalar troncal SIP (baresip) — ligar/receber por linha SIP no discador\n"
    printf "   [${BLUE}8${WHITE}] Remover troncal SIP (baresip)\n"
    printf "   [${BLUE}9${WHITE}] Verificar e reconstruir o que estiver desatualizado\n"
    printf "   [${BLUE}0${WHITE}] Voltar ao Menu Principal\n"
    echo
    read -p "> " option_tools
    case "${option_tools}" in
    1)
      SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
      RABBIT_SCRIPT="${SCRIPT_DIR}/tools/instalador_rabbit.sh"
      if [ -f "$RABBIT_SCRIPT" ]; then
        printf "${GREEN} >> Executando Instalador RabbitMQ...${WHITE}\n"
        echo
        bash "$RABBIT_SCRIPT"
        echo
        printf "${GREEN} >> Pressione Enter para voltar ao menu de ferramentas...${WHITE}\n"
        read -r
      else
        printf "${RED} >> Erro: Arquivo ${RABBIT_SCRIPT} não encontrado!${WHITE}\n"
        sleep 3
      fi
      ;;
    2)
      banner
      printf "${GREEN} >> Instalador Push Notifications${WHITE}\n"
      echo
      SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
      PUSH_SCRIPT="${SCRIPT_DIR}/tools/instalar_push.sh"
      if [ -f "$PUSH_SCRIPT" ]; then
        # Se existir um script dedicado (customização local), ele tem
        # prioridade. Mas a instalação NÃO depende mais dele: por padrão
        # usamos a rotina embutida logo abaixo, que é o que estava
        # faltando e fazia essa opção sempre falhar com "Arquivo não
        # encontrado" em instalações sem a pasta tools/.
        printf "${GREEN} >> Executando script dedicado (tools/instalar_push.sh)...${WHITE}\n"
        echo
        bash "$PUSH_SCRIPT"
      else
        detectar_instalacao || { read -p " Enter para continuar..." _; continue; }
        local _push_env="/home/deploy/${empresa}/backend/.env"
        local _push_email
        _push_email=$(grep -E '^VAPID_SUBJECT=' "${_push_env}" 2>/dev/null | tail -1 | sed 's/^VAPID_SUBJECT=mailto:\{0,1\}//')
        [ -z "${_push_email}" ] && _push_email="admin@equipechat.com.br"

        garantir_push_notifications_env "${_push_env}" "${_push_email}"

        if [ -n "${PUSH_VAPID_RENOVADO}" ]; then
          chown deploy:deploy "${_push_env}" 2>/dev/null || true
          printf "${WHITE} >> Reiniciando backend para aplicar as novas chaves...${WHITE}\n"
          su - deploy -c "pm2 restart ${empresa}-backend --update-env" >/dev/null 2>&1 \
            || su - deploy -c "pm2 restart all --update-env" >/dev/null 2>&1 || true
          printf "${GREEN} >> Push Notifications instalado e backend reiniciado.${WHITE}\n"
          unset PUSH_VAPID_RENOVADO
        fi
      fi
      echo
      printf "${GREEN} >> Pressione Enter para voltar ao menu de ferramentas...${WHITE}\n"
      read -r
      ;;
    3)
      instalar_whatsmeow
      ;;
    4)
      instalar_wacalls_chat
      ;;
    5)
      atualizar_wacalls_chat
      ;;
    6)
      remover_wacalls_chat
      ;;
    7)
      instala_sip_baresip
      ;;
    8)
      remover_sip_baresip
      ;;
    9)
      # Confere cada artefato compilado contra o código-fonte e reconstrói o
      # que estiver para trás. Útil quando a atualização foi interrompida ou
      # quando se quer ter CERTEZA de que o que está rodando é o código atual.
      detectar_instalacao || true
      verificar_artefatos_build || true
      echo
      read -p "Pressione Enter para voltar..." _
      ;;
    0)
      return
      ;;
    *)
      printf "${RED}Opção inválida. Tente novamente.${WHITE}"
      sleep 2
      ;;
    esac
  done
}

# Verificação de pastas disponíveis no diretório do instalador (só para modo local)
verificar_pastas_disponiveis() {
  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}📂 VERIFICAÇÃO DE PASTAS DO PROJETO${WHITE}                  ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo

  local total_encontradas=0

  if [ -d "${INSTALADOR_DIR}/backend" ]; then
    printf "   ${GREEN}✅  backend${WHITE}          encontrada\n"
    total_encontradas=$((total_encontradas + 1))
  else
    printf "   ${RED}❌  backend${WHITE}          ${RED}NÃO encontrada${WHITE}\n"
  fi

  if [ -d "${INSTALADOR_DIR}/frontend" ]; then
    printf "   ${GREEN}✅  frontend${WHITE}         encontrada\n"
    total_encontradas=$((total_encontradas + 1))
  else
    printf "   ${RED}❌  frontend${WHITE}         ${RED}NÃO encontrada${WHITE}\n"
  fi

  if [ -d "${INSTALADOR_DIR}/api_oficial" ]; then
    printf "   ${GREEN}✅  api_oficial${WHITE}      encontrada\n"
    total_encontradas=$((total_encontradas + 1))
  else
    printf "   ${YELLOW}⚠️   api_oficial${WHITE}      não encontrada ${YELLOW}(opcional)${WHITE}\n"
  fi

  if [ -d "${INSTALADOR_DIR}/api_transcricao" ]; then
    printf "   ${GREEN}✅  api_transcricao${WHITE}  encontrada\n"
    total_encontradas=$((total_encontradas + 1))
  else
    printf "   ${YELLOW}⚠️   api_transcricao${WHITE}  não encontrada ${YELLOW}(opcional)${WHITE}\n"
  fi

  if [ -d "${INSTALADOR_DIR}/wacalls-chat" ]; then
    printf "   ${GREEN}✅  wacalls-chat${WHITE}     encontrada\n"
    total_encontradas=$((total_encontradas + 1))
  else
    printf "   ${YELLOW}⚠️   wacalls-chat${WHITE}     não encontrada ${YELLOW}(opcional — só necessária se for instalar mensagem/chamada wacalls)${WHITE}\n"
  fi

  echo
  printf "   ${WHITE}Total: ${BLUE}${total_encontradas}/5${WHITE} pastas encontradas\n"
  printf "   ${WHITE}Diretório: ${CYAN}${INSTALADOR_DIR}${WHITE}\n"
  echo

  # Backend e Frontend são obrigatórios
  if [ ! -d "${INSTALADOR_DIR}/backend" ] || [ ! -d "${INSTALADOR_DIR}/frontend" ]; then
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${RED}   ❌ ERRO: As pastas 'backend' e 'frontend' são OBRIGATÓRIAS!${WHITE}\n"
    printf "${RED}   Coloque-as no mesmo diretório do instalador, ou deixe o .zip do${WHITE}\n"
    printf "${RED}   sistema ao lado do instalador, e tente novamente.${WHITE}\n"
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    echo
    printf "${WHITE} >> Pressione Enter para sair...${WHITE}\n"
    read -r
    exit 1
  fi

  printf "${WHITE} >> Pressione Enter para continuar...${WHITE}\n"
  read -r
}

# Escolher modo de instalação (Local ou Git)
escolher_modo_instalacao() {
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}📦 MODO DE INSTALAÇÃO${WHITE}                                ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo
  printf "${WHITE} Selecione como deseja obter os arquivos do projeto:\n"
  echo
  printf "   [${BLUE}1${WHITE}] ${GREEN}Instalação Local${WHITE} - Pastas já estão no diretório do instalador\n"
  printf "   [${BLUE}2${WHITE}] ${CYAN}Instalação via Git${WHITE} - Clonar repositório do GitHub\n"
  echo
  read -p "> " modo_escolha
  echo

  case "${modo_escolha}" in
  1)
    modo_instalacao="local"
    printf "${GREEN} >> Modo selecionado: Instalação Local${WHITE}\n"
    sleep 1
    verificar_pastas_disponiveis
    ;;
  2)
    modo_instalacao="git"
    printf "${GREEN} >> Modo selecionado: Instalação via Git${WHITE}\n"
    sleep 1
    solicitar_dados_git
    ;;
  *)
    printf "${RED}Opção inválida. Usando instalação local como padrão.${WHITE}\n"
    modo_instalacao="local"
    sleep 2
    verificar_pastas_disponiveis
    ;;
  esac
}

# Solicitar dados do Git (token e repositório)
solicitar_dados_git() {
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}🔑 CONFIGURAÇÃO DO REPOSITÓRIO GIT${WHITE}                   ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo
  printf "${WHITE} >> Digite o TOKEN de autorização do GitHub:\n"
  echo
  read -p "> " token_git
  echo

  if [ -z "$token_git" ]; then
    printf "${RED}❌ ERRO: Token não pode estar vazio.${WHITE}\n"
    sleep 2
    solicitar_dados_git
    return
  fi

  printf "${WHITE} >> Digite a URL do repositório Git\n"
  printf "${YELLOW}    (Ex: github.com/usuario/repositorio.git):${WHITE}\n"
  echo
  read -p "> " repo_git_input
  echo

  if [ -z "$repo_git_input" ]; then
    printf "${RED}❌ ERRO: URL do repositório não pode estar vazia.${WHITE}\n"
    sleep 2
    solicitar_dados_git
    return
  fi

  # Limpar URL (remover https:// se já tiver)
  repo_git=$(echo "${repo_git_input}" | sed 's|https://||g' | sed 's|http://||g')

  # Validar token com teste de clone
  printf "${BLUE} >> Validando token e repositório...${WHITE}\n"
  echo

  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  TEST_DIR="${INSTALADOR_DIR}/test_clone_$(date +%s)"
  REPO_URL="https://${token_git}@${repo_git}"

  if git clone --depth 1 "${REPO_URL}" "${TEST_DIR}" >/dev/null 2>&1; then
    rm -rf "${TEST_DIR}" >/dev/null 2>&1
    printf "${GREEN}✅ Token e repositório validados com sucesso!${WHITE}\n"
    echo
    sleep 2
  else
    rm -rf "${TEST_DIR}" >/dev/null 2>&1
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${RED}❌ ERRO: Falha ao acessar o repositório!${WHITE}\n"
    echo
    printf "${RED}   Verifique se o token e a URL do repositório estão corretos.${WHITE}\n"
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    echo
    printf "${WHITE} >> Deseja tentar novamente? (S/N):${WHITE}\n"
    read -p "> " tentar_novamente
    tentar_novamente=$(echo "${tentar_novamente}" | tr '[:lower:]' '[:upper:]')
    if [ "$tentar_novamente" == "S" ]; then
      solicitar_dados_git
    else
      printf "${RED} >> Voltando ao menu principal...${WHITE}\n"
      sleep 2
      menu
    fi
  fi
}

# Clonar código do repositório Git
copia_codigo_git() {
  banner
  printf "${WHITE} >> Clonando repositório para /home/deploy/${empresa}...\n"
  echo

  # Validar credenciais Git antes de tentar clonar
  if [ -z "${token_git}" ] || [ -z "${repo_git}" ]; then
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${RED}❌ ERRO: Credenciais do Git ausentes (token_git ou repo_git vazios).${WHITE}\n"
    printf "${RED}   Não é possível clonar o repositório.${WHITE}\n"
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    echo
    printf "${YELLOW} >> Solicitando dados do Git novamente...${WHITE}\n"
    sleep 2
    solicitar_dados_git
    if [ -z "${token_git}" ] || [ -z "${repo_git}" ]; then
      printf "${RED}❌ ERRO: Credenciais ainda ausentes. Abortando instalação.${WHITE}\n"
      exit 1
    fi
  fi

  dest_dir="/home/deploy/${empresa}"
  REPO_URL="https://${token_git}@${repo_git}"

  {
    # Remover diretório existente se houver
    if [ -d "${dest_dir}" ]; then
      printf "${YELLOW} >> Diretório existente encontrado. Removendo...${WHITE}\n"
      rm -rf "${dest_dir}"
    fi

    # Criar diretório pai
    mkdir -p "$(dirname "${dest_dir}")"

    # Clonar repositório
    printf "${WHITE} >> Clonando repositório...\n"
    git clone "${REPO_URL}" "${dest_dir}"

    if [ $? -ne 0 ]; then
      printf "${RED}❌ ERRO: Falha ao clonar o repositório!${WHITE}\n"
      exit 1
    fi

    printf "${GREEN} >> ✅ Repositório clonado com sucesso!${WHITE}\n"
    echo

    # Verificar se as pastas obrigatórias existem
    if [ ! -d "${dest_dir}/backend" ] || [ ! -d "${dest_dir}/frontend" ]; then
      printf "${RED}❌ ERRO: Repositório não contém as pastas 'backend' e/ou 'frontend'!${WHITE}\n"
      printf "${RED}   Verifique o repositório e tente novamente.${WHITE}\n"
      exit 1
    fi
    
    # Verificar se api_oficial existe no repo
    if [ ! -d "${dest_dir}/api_oficial" ]; then
      printf "${YELLOW}⚠️  AVISO: Pasta 'api_oficial' não encontrada no repositório.${WHITE}\n"
      printf "${YELLOW}   A API Oficial não poderá ser instalada sem essa pasta.${WHITE}\n"
    fi

    # Ajustar permissões
    mkdir -p "${dest_dir}/backend/public/"
    chown deploy:deploy -R "${dest_dir}/"
    chmod 775 -R "${dest_dir}/backend/public/"

    printf "${GREEN} >> Todos os arquivos configurados com sucesso!${WHITE}\n"
    sleep 2
  } || trata_erro "copia_codigo_git"
}

# Função para instalar n8n
instalar_n8n() {
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}🔄 INSTALAÇÃO DO N8N - AUTOMAÇÃO DE WORKFLOWS${WHITE}        ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo
  printf "${WHITE}   O n8n é uma plataforma de automação de workflows que permite${WHITE}\n"
  printf "${WHITE}   criar integrações visuais entre APIs, bancos de dados,${WHITE}\n"
  printf "${WHITE}   e-mails, webhooks e muito mais.${WHITE}\n"
  echo
  printf "${YELLOW}   Requisitos:${WHITE}\n"
  printf "${WHITE}   - Node.js 18+ (será instalado se necessário)${WHITE}\n"
  printf "${WHITE}   - Subdomínio apontando para este servidor${WHITE}\n"
  printf "${WHITE}   - Porta 5678 disponível${WHITE}\n"
  echo
  printf "${WHITE}   Deseja continuar? (S/N):${WHITE}\n"
  echo
  read -p "> " confirmacao_n8n
  confirmacao_n8n=$(echo "${confirmacao_n8n}" | tr '[:lower:]' '[:upper:]')
  echo

  if [ "${confirmacao_n8n}" != "S" ]; then
    printf "${GREEN} >> Operação cancelada. Voltando ao menu...${WHITE}\n"
    sleep 2
    return
  fi

  # Verificar se já está instalado
  if command -v n8n &>/dev/null || pm2 list 2>/dev/null | grep -q "n8n"; then
    printf "${YELLOW} >> n8n já parece estar instalado neste servidor.${WHITE}\n"
    printf "${WHITE} >> Deseja reinstalar? Isso irá parar o serviço atual. (S/N):${WHITE}\n"
    echo
    read -p "> " reinstalar_n8n
    reinstalar_n8n=$(echo "${reinstalar_n8n}" | tr '[:lower:]' '[:upper:]')
    echo
    if [ "${reinstalar_n8n}" != "S" ]; then
      printf "${GREEN} >> Operação cancelada.${WHITE}\n"
      sleep 2
      return
    fi
    pm2 stop n8n 2>/dev/null
    pm2 delete n8n 2>/dev/null
  fi

  # Coletar dados
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}📋 CONFIGURAÇÃO DO N8N${WHITE}                                ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo

  printf "${WHITE} >> Digite o subdomínio para o n8n (ex: n8n.seudominio.com.br):${WHITE}\n"
  echo
  read -p "> " n8n_subdominio
  echo

  if [ -z "${n8n_subdominio}" ]; then
    printf "${RED} >> ERRO: Subdomínio não pode estar vazio.${WHITE}\n"
    sleep 3
    return
  fi

  printf "${WHITE} >> Digite seu e-mail (para SSL e admin do n8n):${WHITE}\n"
  echo
  read -p "> " n8n_email
  echo

  if [ -z "${n8n_email}" ]; then
    printf "${RED} >> ERRO: E-mail não pode estar vazio.${WHITE}\n"
    sleep 3
    return
  fi

  printf "${WHITE} >> Escolha a porta do n8n (padrão: 5678):${WHITE}\n"
  echo
  read -p "> " n8n_port
  echo
  n8n_port=${n8n_port:-5678}

  printf "${WHITE} >> Digite a senha para o usuário admin do n8n:${WHITE}\n"
  echo
  read -s -p "> " n8n_senha
  echo
  echo

  if [ -z "${n8n_senha}" ]; then
    n8n_senha=$(openssl rand -base64 12)
    printf "${YELLOW} >> Senha gerada automaticamente: ${WHITE}${n8n_senha}\n"
    echo
  fi

  # Confirmar dados
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}✅ CONFIRME OS DADOS${WHITE}                                  ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo
  printf "${WHITE}   Subdomínio:  ${CYAN}${n8n_subdominio}${WHITE}\n"
  printf "${WHITE}   E-mail:      ${CYAN}${n8n_email}${WHITE}\n"
  printf "${WHITE}   Porta:       ${CYAN}${n8n_port}${WHITE}\n"
  printf "${WHITE}   Admin:       ${CYAN}${n8n_email}${WHITE}\n"
  echo
  printf "${WHITE}   Confirmar instalação? (S/N):${WHITE}\n"
  echo
  read -p "> " confirma_dados
  confirma_dados=$(echo "${confirma_dados}" | tr '[:lower:]' '[:upper:]')
  echo

  if [ "${confirma_dados}" != "S" ]; then
    printf "${GREEN} >> Instalação cancelada.${WHITE}\n"
    sleep 2
    return
  fi

  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # ===== ETAPA 1: Instalar Node.js se necessário =====
  printf "${BLUE} >> [1/6] Verificando Node.js...${WHITE}\n"
  if ! command -v node &>/dev/null; then
    printf "${YELLOW} >> Node.js não encontrado. Instalando v20...${WHITE}\n"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  node_version=$(node -v)
  printf "${GREEN} >> Node.js ${node_version} disponível.${WHITE}\n"
  echo

  # ===== ETAPA 2: Instalar PM2 se necessário =====
  printf "${BLUE} >> [2/6] Verificando PM2...${WHITE}\n"
  if ! command -v pm2 &>/dev/null; then
    printf "${YELLOW} >> PM2 não encontrado. Instalando...${WHITE}\n"
    sudo npm install -g pm2
  fi
  printf "${GREEN} >> PM2 disponível.${WHITE}\n"
  echo

  # ===== ETAPA 3: Instalar n8n globalmente =====
  printf "${BLUE} >> [3/6] Instalando n8n...${WHITE}\n"
  sudo npm install -g n8n
  printf "${GREEN} >> n8n instalado com sucesso.${WHITE}\n"
  echo

  # ===== ETAPA 4: Criar diretório e configuração =====
  printf "${BLUE} >> [4/6] Configurando n8n...${WHITE}\n"
  N8N_HOME="/home/deploy/.n8n"
  sudo mkdir -p "${N8N_HOME}"

  # Criar arquivo de configuração do ecosystem do PM2
  cat > /tmp/n8n-ecosystem.config.js <<ECOSYSTEM
module.exports = {
  apps: [{
    name: 'n8n',
    script: '$(which n8n)',
    args: 'start',
    cwd: '${N8N_HOME}',
    env: {
      N8N_HOST: '0.0.0.0',
      N8N_PORT: '${n8n_port}',
      N8N_PROTOCOL: 'https',
      WEBHOOK_URL: 'https://${n8n_subdominio}/',
      N8N_EDITOR_BASE_URL: 'https://${n8n_subdominio}/',
      GENERIC_TIMEZONE: 'America/Sao_Paulo',
      N8N_DEFAULT_LOCALE: 'pt-BR',
      N8N_METRICS: 'true',
      N8N_USER_MANAGEMENT_DISABLED: 'false',
      N8N_BASIC_AUTH_ACTIVE: 'false',
      N8N_ENCRYPTION_KEY: '$(openssl rand -hex 24)',
      DB_TYPE: 'sqlite',
      N8N_USER_FOLDER: '${N8N_HOME}',
    },
    max_memory_restart: '512M',
    autorestart: true,
    watch: false,
  }]
};
ECOSYSTEM

  sudo mv /tmp/n8n-ecosystem.config.js "${N8N_HOME}/ecosystem.config.js"
  sudo chown -R deploy:deploy "${N8N_HOME}" 2>/dev/null || true
  printf "${GREEN} >> Configuração criada.${WHITE}\n"
  echo

  # ===== ETAPA 5: Configurar Nginx =====
  printf "${BLUE} >> [5/6] Configurando Nginx...${WHITE}\n"
  local nginx_conf="/etc/nginx/sites-available/n8n"
  local nginx_link="/etc/nginx/sites-enabled/n8n"

  sudo bash -c "cat > ${nginx_conf} <<'END'
server {
    server_name ${n8n_subdominio};

    location / {
        proxy_pass http://127.0.0.1:${n8n_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        chunked_transfer_encoding on;
    }
}
END"

  sudo ln -sf "${nginx_conf}" "${nginx_link}"

  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    printf "${GREEN} >> Nginx configurado!${WHITE}\n"
  else
    printf "${RED} >> ERRO na configuração do Nginx. Verifique manualmente.${WHITE}\n"
  fi
  echo

  # ===== ETAPA 6: SSL + Iniciar =====
  printf "${BLUE} >> [6/6] Emitindo SSL e iniciando n8n...${WHITE}\n"
  sudo certbot -m "${n8n_email}" --nginx --agree-tos --expand -n -d "${n8n_subdominio}" || {
    printf "${YELLOW} >> Aviso: Falha no SSL. Tente manualmente: certbot --nginx -d ${n8n_subdominio}${WHITE}\n"
    sleep 3
  }

  # Iniciar n8n com PM2
  cd "${N8N_HOME}"
  pm2 start ecosystem.config.js
  pm2 save
  pm2 startup 2>/dev/null

  # Aguardar n8n iniciar
  printf "${WHITE} >> Aguardando n8n iniciar...${WHITE}\n"
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${n8n_port}" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  # ===== FINALIZAÇÃO =====
  banner
  printf "${GREEN}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${GREEN}║   ✅ N8N INSTALADO COM SUCESSO!                            ║${WHITE}\n"
  printf "${GREEN}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo
  printf "${WHITE} Acesse o n8n em:${WHITE}\n"
  printf "${CYAN}    🌐 https://${n8n_subdominio}${WHITE}\n"
  echo
  printf "${WHITE} Credenciais iniciais:${WHITE}\n"
  printf "${YELLOW}    📧 E-mail:  ${n8n_email}${WHITE}\n"
  printf "${YELLOW}    🔑 Senha:   ${n8n_senha}${WHITE}\n"
  printf "${WHITE}    (Use estas credenciais no primeiro acesso para criar o admin)${WHITE}\n"
  echo
  printf "${WHITE} Comandos úteis:${WHITE}\n"
  printf "${CYAN}    pm2 logs n8n${WHITE}         - Ver logs em tempo real\n"
  printf "${CYAN}    pm2 restart n8n${WHITE}      - Reiniciar n8n\n"
  printf "${CYAN}    pm2 stop n8n${WHITE}         - Parar n8n\n"
  printf "${CYAN}    pm2 monit${WHITE}            - Monitor de processos\n"
  echo
  printf "${WHITE} Porta: ${CYAN}${n8n_port}${WHITE}\n"
  printf "${WHITE} Diretório: ${CYAN}${N8N_HOME}${WHITE}\n"
  echo

  # Salvar dados
  cat > "${INSTALADOR_DIR}/DADOS_INSTALACAO_N8N.txt" <<EOF
=== N8N - AUTOMAÇÃO DE WORKFLOWS ===
Data: $(date '+%d/%m/%Y %H:%M:%S')
URL: https://${n8n_subdominio}
E-mail: ${n8n_email}
Senha: ${n8n_senha}
Porta: ${n8n_port}
Diretório: ${N8N_HOME}
EOF
  printf "${GREEN} >> Dados salvos em: DADOS_INSTALACAO_N8N.txt${WHITE}\n"

  # Injetar N8N_URL no .env do backend e frontend
  local backend_env="/home/deploy/${empresa}/backend/.env"
  local frontend_env="/home/deploy/${empresa}/frontend/.env"
  local n8n_full_url="https://${n8n_subdominio}"

  if [ -f "$backend_env" ]; then
    if grep -q "^N8N_URL=" "$backend_env"; then
      sed -i "s|^N8N_URL=.*|N8N_URL=${n8n_full_url}|" "$backend_env"
    else
      echo "N8N_URL=${n8n_full_url}" >> "$backend_env"
    fi
    printf "${GREEN} >> N8N_URL injetada no backend .env${WHITE}\n"
  fi

  if [ -f "$frontend_env" ]; then
    if grep -q "^REACT_APP_N8N_URL=" "$frontend_env"; then
      sed -i "s|^REACT_APP_N8N_URL=.*|REACT_APP_N8N_URL=${n8n_full_url}|" "$frontend_env"
    else
      echo "REACT_APP_N8N_URL=${n8n_full_url}" >> "$frontend_env"
    fi
    printf "${GREEN} >> REACT_APP_N8N_URL injetada no frontend .env${WHITE}\n"
  fi
  echo
  printf "${WHITE} >> Pressione Enter para voltar ao menu...${WHITE}\n"
  read -r
}

# Função para desinstalar n8n
desinstalar_n8n() {
  banner
  printf "${RED}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${RED}║        ⚠️  DESINSTALAR N8N${WHITE}                                  ${RED}║${WHITE}\n"
  printf "${RED}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo

  if ! command -v n8n &>/dev/null && ! pm2 list 2>/dev/null | grep -q "n8n"; then
    printf "${YELLOW} >> n8n não parece estar instalado neste servidor.${WHITE}\n"
    sleep 3
    return
  fi

  printf "${RED} >> ATENÇÃO: Isso irá remover o n8n e todos os workflows!${WHITE}\n"
  printf "${WHITE} >> Deseja criar um backup antes? (S/N):${WHITE}\n"
  echo
  read -p "> " backup_n8n
  backup_n8n=$(echo "${backup_n8n}" | tr '[:lower:]' '[:upper:]')
  echo

  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  N8N_HOME="/home/deploy/.n8n"

  if [ "${backup_n8n}" == "S" ]; then
    BACKUP_FILE="${INSTALADOR_DIR}/backup_n8n_$(date +%Y%m%d_%H%M%S).tar.gz"
    if [ -d "${N8N_HOME}" ]; then
      tar -czf "${BACKUP_FILE}" -C "$(dirname ${N8N_HOME})" ".n8n" 2>/dev/null
      printf "${GREEN} >> Backup salvo em: ${BACKUP_FILE}${WHITE}\n"
    else
      printf "${YELLOW} >> Diretório n8n não encontrado para backup.${WHITE}\n"
    fi
    echo
  fi

  printf "${RED} >> Confirmar desinstalação do n8n? (Digite 'SIM' para confirmar):${WHITE}\n"
  echo
  read -p "> " confirma_desinstalar
  echo

  if [ "${confirma_desinstalar}" != "SIM" ]; then
    printf "${GREEN} >> Desinstalação cancelada.${WHITE}\n"
    sleep 2
    return
  fi

  printf "${WHITE} >> Parando n8n...${WHITE}\n"
  pm2 stop n8n 2>/dev/null
  pm2 delete n8n 2>/dev/null
  pm2 save 2>/dev/null

  printf "${WHITE} >> Removendo n8n...${WHITE}\n"
  sudo npm uninstall -g n8n 2>/dev/null

  printf "${WHITE} >> Removendo configuração Nginx...${WHITE}\n"
  sudo rm -f /etc/nginx/sites-enabled/n8n
  sudo rm -f /etc/nginx/sites-available/n8n
  sudo nginx -t 2>/dev/null && sudo systemctl reload nginx

  printf "${WHITE} >> Removendo diretório de dados...${WHITE}\n"
  sudo rm -rf "${N8N_HOME}"

  rm -f "${INSTALADOR_DIR}/DADOS_INSTALACAO_N8N.txt"

  printf "${GREEN} >> n8n desinstalado com sucesso!${WHITE}\n"
  echo
  printf "${WHITE} >> Pressione Enter para voltar ao menu...${WHITE}\n"
  read -r
}

################################################################
#                    INSTALAR / DESINSTALAR TYPEBOT            #
################################################################

# Função auxiliar: garantir Docker + docker compose
_typebot_garantir_docker() {
  if ! command -v docker &>/dev/null; then
    printf "${YELLOW} >> Docker não encontrado. Instalando...${WHITE}\n"
    # O script oficial recusa versões do Ubuntu que ele ainda não conhece;
    # nesse caso fica o Docker dos repositórios do próprio Ubuntu.
    curl -fsSL https://get.docker.com | sudo sh || \
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2 || \
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
    sudo usermod -aG docker deploy 2>/dev/null || true
  fi
  if ! docker compose version &>/dev/null; then
    printf "${YELLOW} >> Plugin docker compose não encontrado. Instalando...${WHITE}\n"
    sudo apt-get update -y
    sudo apt-get install -y docker-compose-plugin || {
      sudo mkdir -p /usr/local/lib/docker/cli-plugins
      sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
      sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    }
  fi
  printf "${GREEN} >> Docker $(docker --version | awk '{print $3}' | tr -d ',') OK${WHITE}\n"
}

# Função para instalar Typebot (Builder + Viewer via Docker)
instalar_typebot() {
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}🤖 INSTALAÇÃO DO TYPEBOT - CHATBOTS VISUAIS${WHITE}          ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo
  printf "${WHITE}   O Typebot é uma plataforma open-source para criar chatbots${WHITE}\n"
  printf "${WHITE}   conversacionais visuais (formulários, fluxos, integrações).${WHITE}\n"
  echo
  printf "${YELLOW}   Arquitetura:${WHITE}\n"
  printf "${WHITE}   - Builder  (editor de fluxos)     -> subdomínio próprio${WHITE}\n"
  printf "${WHITE}   - Viewer   (chat público)         -> subdomínio próprio${WHITE}\n"
  printf "${WHITE}   - PostgreSQL dedicado (Docker)${WHITE}\n"
  echo
  printf "${YELLOW}   Requisitos:${WHITE}\n"
  printf "${WHITE}   - Docker + docker compose (serão instalados se faltar)${WHITE}\n"
  printf "${WHITE}   - 2 subdomínios apontados para este servidor${WHITE}\n"
  printf "${WHITE}   - Portas internas 3000 e 3001 livres${WHITE}\n"
  echo
  printf "${WHITE}   Deseja continuar? (S/N):${WHITE}\n"
  echo
  read -p "> " confirmacao_tb
  confirmacao_tb=$(echo "${confirmacao_tb}" | tr '[:lower:]' '[:upper:]')
  echo

  if [ "${confirmacao_tb}" != "S" ]; then
    printf "${GREEN} >> Operação cancelada. Voltando ao menu...${WHITE}\n"
    sleep 2
    return
  fi

  TYPEBOT_HOME="/home/deploy/typebot"
  if [ -d "${TYPEBOT_HOME}" ] || (docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^typebot-"); then
    printf "${YELLOW} >> Typebot já parece estar instalado neste servidor.${WHITE}\n"
    printf "${WHITE} >> Deseja reinstalar? Isso irá parar/remover os containers atuais. (S/N):${WHITE}\n"
    echo
    read -p "> " reinstalar_tb
    reinstalar_tb=$(echo "${reinstalar_tb}" | tr '[:lower:]' '[:upper:]')
    echo
    if [ "${reinstalar_tb}" != "S" ]; then
      printf "${GREEN} >> Operação cancelada.${WHITE}\n"
      sleep 2
      return
    fi
    [ -f "${TYPEBOT_HOME}/docker-compose.yml" ] && (cd "${TYPEBOT_HOME}" && sudo docker compose down -v 2>/dev/null)
  fi

  # Coletar dados
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}📋 CONFIGURAÇÃO DO TYPEBOT${WHITE}                            ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo

  printf "${WHITE} >> Subdomínio do BUILDER (ex: typebot.seudominio.com.br):${WHITE}\n"
  echo
  read -p "> " tb_builder_dom
  echo
  if [ -z "${tb_builder_dom}" ]; then
    printf "${RED} >> ERRO: Subdomínio do builder não pode estar vazio.${WHITE}\n"
    sleep 3
    return
  fi

  printf "${WHITE} >> Subdomínio do VIEWER (ex: bot.seudominio.com.br):${WHITE}\n"
  echo
  read -p "> " tb_viewer_dom
  echo
  if [ -z "${tb_viewer_dom}" ]; then
    printf "${RED} >> ERRO: Subdomínio do viewer não pode estar vazio.${WHITE}\n"
    sleep 3
    return
  fi

  printf "${WHITE} >> E-mail do administrador (para SSL e primeiro login):${WHITE}\n"
  echo
  read -p "> " tb_admin_email
  echo
  if [ -z "${tb_admin_email}" ]; then
    printf "${RED} >> ERRO: E-mail não pode estar vazio.${WHITE}\n"
    sleep 3
    return
  fi

  printf "${WHITE} >> Porta interna do Builder (padrão: 3010):${WHITE}\n"
  echo
  read -p "> " tb_builder_port
  echo
  tb_builder_port=${tb_builder_port:-3010}

  printf "${WHITE} >> Porta interna do Viewer (padrão: 3011):${WHITE}\n"
  echo
  read -p "> " tb_viewer_port
  echo
  tb_viewer_port=${tb_viewer_port:-3011}

  printf "${WHITE} >> Como deseja tratar o login por e-mail?${WHITE}\n"
  printf "   [${BLUE}1${WHITE}] ${GREEN}Ativar SMTP${WHITE} - usuários podem se cadastrar e logar via magic link\n"
  printf "   [${BLUE}2${WHITE}] ${YELLOW}Desabilitar login por e-mail${WHITE} - apenas o admin (${tb_admin_email}) acessa\n"
  echo
  read -p "> " tb_auth_mode
  echo

  tb_smtp_host=""; tb_smtp_port=""; tb_smtp_user=""; tb_smtp_pass=""; tb_smtp_from=""
  tb_disable_signup="true"
  if [ "${tb_auth_mode}" == "1" ]; then
    tb_disable_signup="false"
    printf "${WHITE} >> SMTP host (ex: smtp.gmail.com):${WHITE}\n"
    read -p "> " tb_smtp_host
    printf "${WHITE} >> SMTP porta (ex: 587):${WHITE}\n"
    read -p "> " tb_smtp_port
    printf "${WHITE} >> SMTP usuário:${WHITE}\n"
    read -p "> " tb_smtp_user
    printf "${WHITE} >> SMTP senha:${WHITE}\n"
    read -s -p "> " tb_smtp_pass
    echo
    printf "${WHITE} >> SMTP remetente (ex: 'Typebot <no-reply@dominio.com>'):${WHITE}\n"
    read -p "> " tb_smtp_from
    echo
    if [ -z "${tb_smtp_host}" ] || [ -z "${tb_smtp_user}" ] || [ -z "${tb_smtp_pass}" ]; then
      printf "${RED} >> ERRO: Dados de SMTP incompletos.${WHITE}\n"
      sleep 3
      return
    fi
  elif [ "${tb_auth_mode}" != "2" ]; then
    printf "${RED} >> ERRO: Opção inválida.${WHITE}\n"
    sleep 3
    return
  fi

  # Confirmar
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}✅ CONFIRME OS DADOS${WHITE}                                  ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo
  printf "${WHITE}   Builder:     ${CYAN}https://${tb_builder_dom}${WHITE} (porta ${tb_builder_port})\n"
  printf "${WHITE}   Viewer:      ${CYAN}https://${tb_viewer_dom}${WHITE} (porta ${tb_viewer_port})\n"
  printf "${WHITE}   Admin:       ${CYAN}${tb_admin_email}${WHITE}\n"
  if [ "${tb_disable_signup}" == "false" ]; then
    printf "${WHITE}   Login email: ${CYAN}SMTP ativo (${tb_smtp_host}:${tb_smtp_port})${WHITE}\n"
  else
    printf "${WHITE}   Login email: ${YELLOW}DESABILITADO (somente admin)${WHITE}\n"
  fi
  echo
  printf "${WHITE}   Confirmar instalação? (S/N):${WHITE}\n"
  echo
  read -p "> " confirma_tb
  confirma_tb=$(echo "${confirma_tb}" | tr '[:lower:]' '[:upper:]')
  echo
  if [ "${confirma_tb}" != "S" ]; then
    printf "${GREEN} >> Instalação cancelada.${WHITE}\n"
    sleep 2
    return
  fi

  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # ===== ETAPA 1: Docker =====
  printf "${BLUE} >> [1/5] Verificando Docker...${WHITE}\n"
  _typebot_garantir_docker
  echo

  # ===== ETAPA 2: Diretório + secrets =====
  printf "${BLUE} >> [2/5] Preparando diretório e secrets...${WHITE}\n"
  sudo mkdir -p "${TYPEBOT_HOME}"
  tb_encryption_secret=$(openssl rand -base64 24 | tr -d '\n' | head -c 32)
  tb_db_pass=$(openssl rand -hex 16)
  tb_nextauth_secret=$(openssl rand -base64 32 | tr -d '\n')

  # docker-compose.yml
  sudo tee "${TYPEBOT_HOME}/docker-compose.yml" >/dev/null <<COMPOSE
services:
  typebot-db:
    image: postgres:14
    restart: always
    container_name: typebot-db
    volumes:
      - typebot_db_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: typebot
      POSTGRES_USER: typebot
      POSTGRES_PASSWORD: ${tb_db_pass}

  typebot-builder:
    image: baptistearno/typebot-builder:latest
    container_name: typebot-builder
    restart: always
    depends_on:
      - typebot-db
    ports:
      - "127.0.0.1:${tb_builder_port}:3000"
    env_file: .env

  typebot-viewer:
    image: baptistearno/typebot-viewer:latest
    container_name: typebot-viewer
    restart: always
    depends_on:
      - typebot-db
    ports:
      - "127.0.0.1:${tb_viewer_port}:3000"
    env_file: .env

volumes:
  typebot_db_data:
COMPOSE

  # .env
  sudo tee "${TYPEBOT_HOME}/.env" >/dev/null <<ENVFILE
DATABASE_URL=postgresql://typebot:${tb_db_pass}@typebot-db:5432/typebot
ENCRYPTION_SECRET=${tb_encryption_secret}
NEXTAUTH_URL=https://${tb_builder_dom}
NEXT_PUBLIC_VIEWER_URL=https://${tb_viewer_dom}
NEXTAUTH_SECRET=${tb_nextauth_secret}
ADMIN_EMAIL=${tb_admin_email}
DISABLE_SIGNUP=${tb_disable_signup}
DEFAULT_WORKSPACE_PLAN=UNLIMITED
ENVFILE

  if [ -n "${tb_smtp_host}" ]; then
    sudo tee -a "${TYPEBOT_HOME}/.env" >/dev/null <<SMTPENV
SMTP_HOST=${tb_smtp_host}
SMTP_PORT=${tb_smtp_port}
SMTP_USERNAME=${tb_smtp_user}
SMTP_PASSWORD=${tb_smtp_pass}
NEXT_PUBLIC_SMTP_FROM=${tb_smtp_from}
SMTP_SECURE=false
SMTPENV
  fi

  sudo chown -R deploy:deploy "${TYPEBOT_HOME}" 2>/dev/null || true
  sudo chmod 600 "${TYPEBOT_HOME}/.env"
  printf "${GREEN} >> Configuração criada em ${TYPEBOT_HOME}${WHITE}\n"
  echo

  # ===== ETAPA 3: Subir containers =====
  printf "${BLUE} >> [3/5] Subindo containers (pode demorar no 1º pull)...${WHITE}\n"
  (cd "${TYPEBOT_HOME}" && sudo docker compose up -d)
  echo

  # ===== ETAPA 4: Nginx (builder + viewer) =====
  printf "${BLUE} >> [4/5] Configurando Nginx...${WHITE}\n"
  for pair in "builder|${tb_builder_dom}|${tb_builder_port}" "viewer|${tb_viewer_dom}|${tb_viewer_port}"; do
    IFS='|' read -r role dom port <<< "$pair"
    conf="/etc/nginx/sites-available/typebot-${role}"
    sudo bash -c "cat > ${conf} <<'END'
server {
    server_name ${dom};

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
END"
    sudo ln -sf "${conf}" "/etc/nginx/sites-enabled/typebot-${role}"
  done

  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    printf "${GREEN} >> Nginx configurado!${WHITE}\n"
  else
    printf "${RED} >> ERRO na configuração do Nginx. Verifique manualmente.${WHITE}\n"
  fi
  echo

  # ===== ETAPA 5: SSL =====
  printf "${BLUE} >> [5/5] Emitindo SSL para ambos os subdomínios...${WHITE}\n"
  sudo certbot -m "${tb_admin_email}" --nginx --agree-tos --expand -n \
    -d "${tb_builder_dom}" -d "${tb_viewer_dom}" || {
    printf "${YELLOW} >> Aviso: Falha no SSL. Tente manualmente:${WHITE}\n"
    printf "${YELLOW}    certbot --nginx -d ${tb_builder_dom} -d ${tb_viewer_dom}${WHITE}\n"
    sleep 3
  }

  # Aguardar builder responder
  printf "${WHITE} >> Aguardando Typebot iniciar...${WHITE}\n"
  for i in $(seq 1 45); do
    if curl -sf "http://127.0.0.1:${tb_builder_port}" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  # FIM
  banner
  printf "${GREEN}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${GREEN}║   ✅ TYPEBOT INSTALADO COM SUCESSO!                        ║${WHITE}\n"
  printf "${GREEN}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo
  printf "${WHITE} Builder (editor): ${CYAN}https://${tb_builder_dom}${WHITE}\n"
  printf "${WHITE} Viewer  (chat):   ${CYAN}https://${tb_viewer_dom}${WHITE}\n"
  echo
  printf "${WHITE} Admin inicial:    ${YELLOW}${tb_admin_email}${WHITE}\n"
  if [ -z "${tb_smtp_host}" ]; then
    printf "${YELLOW} >> Sem SMTP: edite ${TYPEBOT_HOME}/.env para habilitar login por e-mail.${WHITE}\n"
  fi
  echo
  printf "${WHITE} Comandos úteis:${WHITE}\n"
  printf "${CYAN}    cd ${TYPEBOT_HOME} && docker compose logs -f${WHITE}\n"
  printf "${CYAN}    cd ${TYPEBOT_HOME} && docker compose restart${WHITE}\n"
  printf "${CYAN}    cd ${TYPEBOT_HOME} && docker compose pull && docker compose up -d${WHITE}\n"
  echo

  sudo tee "${INSTALADOR_DIR}/DADOS_INSTALACAO_TYPEBOT.txt" >/dev/null <<EOF
=== TYPEBOT ===
Builder URL: https://${tb_builder_dom}
Viewer URL:  https://${tb_viewer_dom}
Admin email: ${tb_admin_email}

Diretório:   ${TYPEBOT_HOME}
Builder port (interna): ${tb_builder_port}
Viewer  port (interna): ${tb_viewer_port}

Postgres user:     typebot
Postgres password: ${tb_db_pass}
ENCRYPTION_SECRET: ${tb_encryption_secret}
NEXTAUTH_SECRET:   ${tb_nextauth_secret}
EOF
  sudo chmod 600 "${INSTALADOR_DIR}/DADOS_INSTALACAO_TYPEBOT.txt"
  printf "${GREEN} >> Dados salvos em: DADOS_INSTALACAO_TYPEBOT.txt${WHITE}\n"
  echo
  printf "${WHITE} >> Pressione Enter para voltar ao menu...${WHITE}\n"
  read -r
}

# Função para desinstalar Typebot
desinstalar_typebot() {
  banner
  printf "${RED}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${RED}║        ⚠️  DESINSTALAR TYPEBOT${WHITE}                              ${RED}║${WHITE}\n"
  printf "${RED}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo

  TYPEBOT_HOME="/home/deploy/typebot"
  if [ ! -d "${TYPEBOT_HOME}" ] && ! (docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^typebot-"); then
    printf "${YELLOW} >> Typebot não parece estar instalado neste servidor.${WHITE}\n"
    sleep 3
    return
  fi

  printf "${RED} >> ATENÇÃO: Isso irá remover containers, volumes e fluxos!${WHITE}\n"
  printf "${WHITE} >> Deseja criar um backup do banco antes? (S/N):${WHITE}\n"
  echo
  read -p "> " backup_tb
  backup_tb=$(echo "${backup_tb}" | tr '[:lower:]' '[:upper:]')
  echo

  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [ "${backup_tb}" == "S" ]; then
    BACKUP_FILE="${INSTALADOR_DIR}/backup_typebot_$(date +%Y%m%d_%H%M%S).sql.gz"
    if docker ps --format '{{.Names}}' | grep -q "^typebot-db$"; then
      sudo docker exec typebot-db pg_dump -U typebot typebot 2>/dev/null | gzip > "${BACKUP_FILE}"
      printf "${GREEN} >> Backup salvo em: ${BACKUP_FILE}${WHITE}\n"
    else
      printf "${YELLOW} >> Container typebot-db não está rodando. Backup pulado.${WHITE}\n"
    fi
    echo
  fi

  printf "${RED} >> Confirmar desinstalação? (Digite 'SIM' para confirmar):${WHITE}\n"
  echo
  read -p "> " confirma_des_tb
  echo
  if [ "${confirma_des_tb}" != "SIM" ]; then
    printf "${GREEN} >> Desinstalação cancelada.${WHITE}\n"
    sleep 2
    return
  fi

  printf "${WHITE} >> Parando containers...${WHITE}\n"
  if [ -f "${TYPEBOT_HOME}/docker-compose.yml" ]; then
    (cd "${TYPEBOT_HOME}" && sudo docker compose down -v 2>/dev/null)
  else
    sudo docker rm -f typebot-builder typebot-viewer typebot-db 2>/dev/null
    sudo docker volume rm typebot_typebot_db_data 2>/dev/null
  fi

  printf "${WHITE} >> Removendo configuração Nginx...${WHITE}\n"
  sudo rm -f /etc/nginx/sites-enabled/typebot-builder /etc/nginx/sites-enabled/typebot-viewer
  sudo rm -f /etc/nginx/sites-available/typebot-builder /etc/nginx/sites-available/typebot-viewer
  sudo nginx -t 2>/dev/null && sudo systemctl reload nginx

  printf "${WHITE} >> Removendo diretório de dados...${WHITE}\n"
  sudo rm -rf "${TYPEBOT_HOME}"

  rm -f "${INSTALADOR_DIR}/DADOS_INSTALACAO_TYPEBOT.txt"

  printf "${GREEN} >> Typebot desinstalado com sucesso!${WHITE}\n"
  echo
  printf "${WHITE} >> Pressione Enter para voltar ao menu...${WHITE}\n"
  read -r
}

################################################################
#              INSTALAR NOVA VERSÃO NA MESMA VPS               #
################################################################

instalar_nova_versao_mesma_vps() {
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║     ${CYAN}📦 INSTALAR NOVA VERSÃO NA MESMA VPS${WHITE}                    ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo

  # ===== Detectar instalações incompletas e oferecer retomada =====
  local incompletas
  incompletas=$(listar_instalacoes_nova_incompletas)
  local resume_mode=""
  local resume_empresa=""
  if [ -n "${incompletas}" ]; then
    printf "${YELLOW}   ⚠️  Instalações incompletas detectadas:${WHITE}\n"
    echo
    local idx=1
    local -a inc_names=()
    while IFS='|' read -r nm st; do
      [ -z "${nm}" ] && continue
      inc_names+=("${nm}")
      printf "   [${BLUE}${idx}${WHITE}] ${BLUE}${nm}${WHITE} - parou na etapa ${CYAN}${st}/10${WHITE}\n"
      idx=$((idx+1))
    done <<< "${incompletas}"
    printf "   [${BLUE}N${WHITE}] Iniciar uma ${GREEN}nova${WHITE} instalação\n"
    printf "   [${BLUE}D${WHITE}] ${RED}Descartar${WHITE} um checkpoint incompleto\n"
    echo
    printf "${WHITE} >> Escolha uma opção:${WHITE}\n"
    read -p "> " op_resume
    echo
    case "${op_resume}" in
      [Dd])
        printf "${WHITE} >> Digite o número do checkpoint para descartar:${WHITE}\n"
        read -p "> " del_idx
        local di=$((del_idx-1))
        if [ ${di} -ge 0 ] && [ ${di} -lt ${#inc_names[@]} ]; then
          limpar_checkpoint_nova "${inc_names[${di}]}"
          printf "${GREEN} >> Checkpoint de '${inc_names[${di}]}' removido.${WHITE}\n"
          sleep 2
        fi
        return
        ;;
      [Nn]|"")
        resume_mode=""
        ;;
      *)
        local ri=$((op_resume-1))
        if [ ${ri} -ge 0 ] && [ ${ri} -lt ${#inc_names[@]} ]; then
          resume_empresa="${inc_names[${ri}]}"
          resume_mode="1"
          printf "${GREEN} >> Retomando instalação de '${resume_empresa}'...${WHITE}\n"
          sleep 1
        fi
        ;;
    esac
  fi

  local nova_etapa=0
  local clean_backend=""
  local clean_frontend=""

  if [ -n "${resume_mode}" ]; then
    # ===== RETOMAR =====
    carregar_vars_nova "${resume_empresa}"
    nova_etapa=$(carregar_etapa_nova "${resume_empresa}")
    [ -z "${nova_etapa}" ] && nova_etapa=0
    clean_backend=$(echo "${nova_subdominio_backend}" | sed 's|https://||g' | sed 's|http://||g' | cut -d'/' -f1)
    clean_frontend=$(echo "${nova_subdominio_frontend}" | sed 's|https://||g' | sed 's|http://||g' | cut -d'/' -f1)
    banner
    printf "${CYAN} >> Retomando '${nova_empresa}' a partir da etapa $((nova_etapa+1))/10...${WHITE}\n"
    sleep 2
  else
    # ===== NOVA INSTALAÇÃO (coleta de dados) =====
  printf "${WHITE}   Esta opção permite instalar uma nova instância do sistema${WHITE}\n"
  printf "${WHITE}   nesta mesma VPS, reaproveitando a infraestrutura já instalada${WHITE}\n"
  printf "${WHITE}   (Node.js, PostgreSQL, Redis, Nginx, PM2, etc).${WHITE}\n"
  echo

  # Listar instalações existentes
  printf "${YELLOW}   📂 Instalações existentes nesta VPS:${WHITE}\n"
  echo
  local encontrou=0
  for dir in /home/deploy/*/backend/.env; do
    if [ -f "$dir" ]; then
      local inst_name=$(basename "$(dirname "$(dirname "$dir")")")
      local inst_port=$(grep "^PORT=" "$(dirname "$dir")/.env" 2>/dev/null | cut -d'=' -f2)
      local inst_url=$(grep "^FRONTEND_URL=" "$(dirname "$dir")/.env" 2>/dev/null | cut -d'=' -f2)
      printf "   ${GREEN}✅${WHITE} ${BLUE}${inst_name}${WHITE} - Porta: ${CYAN}${inst_port:-?}${WHITE} - ${CYAN}${inst_url:-?}${WHITE}\n"
      encontrou=$((encontrou + 1))
    fi
  done
  if [ "$encontrou" -eq 0 ]; then
    printf "   ${YELLOW}Nenhuma instalação encontrada.${WHITE}\n"
  fi
  echo

  printf "${WHITE}   Deseja continuar com a instalação de uma nova instância? (S/N):${WHITE}\n"
  echo
  read -p "> " confirmacao_nova
  confirmacao_nova=$(echo "${confirmacao_nova}" | tr '[:lower:]' '[:upper:]')
  echo

  if [ "${confirmacao_nova}" != "S" ]; then
    printf "${GREEN} >> Operação cancelada. Voltando ao menu...${WHITE}\n"
    sleep 2
    return
  fi

  # Escolher modo (local ou git)
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}📦 MODO DE OBTENÇÃO DOS ARQUIVOS${WHITE}                     ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo
  printf "   [${BLUE}1${WHITE}] ${GREEN}Instalação Local${WHITE} - Pastas já estão no diretório do instalador\n"
  printf "   [${BLUE}2${WHITE}] ${CYAN}Instalação via Git${WHITE} - Clonar repositório do GitHub\n"
  echo
  read -p "> " modo_nova
  echo

  modo_nova_instalacao="local"
  token_git_nova=""
  repo_git_nova=""

  case "${modo_nova}" in
  2)
    modo_nova_instalacao="git"
    printf "${GREEN} >> Modo selecionado: Instalação via Git${WHITE}\n"
    echo
    printf "${WHITE} >> Digite o TOKEN de autorização do GitHub:\n"
    echo
    read -p "> " token_git_nova
    echo
    if [ -z "$token_git_nova" ]; then
      printf "${RED}❌ ERRO: Token não pode estar vazio.${WHITE}\n"
      sleep 2
      return
    fi
    printf "${WHITE} >> Digite a URL do repositório Git (Ex: github.com/usuario/repositorio.git):${WHITE}\n"
    echo
    read -p "> " repo_git_nova_input
    echo
    if [ -z "$repo_git_nova_input" ]; then
      printf "${RED}❌ ERRO: URL do repositório não pode estar vazia.${WHITE}\n"
      sleep 2
      return
    fi
    repo_git_nova=$(echo "${repo_git_nova_input}" | sed 's|https://||g' | sed 's|http://||g')

    # Validar
    printf "${BLUE} >> Validando token e repositório...${WHITE}\n"
    INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    TEST_DIR="${INSTALADOR_DIR}/test_clone_$(date +%s)"
    if git clone --depth 1 "https://${token_git_nova}@${repo_git_nova}" "${TEST_DIR}" >/dev/null 2>&1; then
      rm -rf "${TEST_DIR}" >/dev/null 2>&1
      printf "${GREEN}✅ Token e repositório validados!${WHITE}\n"
      echo
      sleep 1
    else
      rm -rf "${TEST_DIR}" >/dev/null 2>&1
      printf "${RED}❌ ERRO: Falha ao acessar o repositório!${WHITE}\n"
      sleep 3
      return
    fi
    ;;
  *)
    modo_nova_instalacao="local"
    printf "${GREEN} >> Modo selecionado: Instalação Local${WHITE}\n"
    sleep 1
    INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ ! -d "${INSTALADOR_DIR}/backend" ] || [ ! -d "${INSTALADOR_DIR}/frontend" ]; then
      printf "${RED}❌ ERRO: Pastas 'backend' e/ou 'frontend' não encontradas!${WHITE}\n"
      sleep 3
      return
    fi
    printf "${GREEN}✅ Pastas encontradas!${WHITE}\n"
    echo
    sleep 1
    ;;
  esac

  # Coletar dados da nova instância
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}📝 DADOS DA NOVA INSTÂNCIA${WHITE}                           ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo

  printf "${WHITE} >> Insira a URL do Backend da nova instância:\n"
  echo
  read -p "> " nova_subdominio_backend
  echo

  printf "${WHITE} >> Insira a URL do Frontend da nova instância:\n"
  echo
  read -p "> " nova_subdominio_frontend
  echo

  printf "${WHITE} >> Digite o seu melhor email:\n"
  echo
  read -p "> " nova_email_deploy
  echo

  printf "${WHITE} >> Digite o nome da nova empresa (minúsculas, sem espaço):\n"
  printf "${YELLOW}   ⚠️  Deve ser DIFERENTE das instalações existentes!${WHITE}\n"
  echo
  read -p "> " nova_empresa
  echo

  # Verificar se já existe
  if [ -d "/home/deploy/${nova_empresa}/backend" ]; then
    printf "${RED}❌ ERRO: Já existe uma instalação com o nome '${nova_empresa}'!${WHITE}\n"
    printf "${YELLOW}   Escolha um nome diferente e tente novamente.${WHITE}\n"
    sleep 3
    return
  fi

  printf "${WHITE} >> Insira a senha para Deploy, Redis e Banco de Dados (sem caracteres especiais):\n"
  echo
  read -p "> " nova_senha_deploy
  echo

  printf "${WHITE} >> Insira a senha MASTER:\n"
  echo
  read -p "> " nova_senha_master
  echo

  printf "${WHITE} >> Insira o Título da Aplicação (Permitido Espaço):\n"
  echo
  read -p "> " nova_nome_titulo
  echo

  printf "${WHITE} >> Digite o número de suporte:\n"
  echo
  read -p "> " nova_numero_suporte
  echo

  printf "${WHITE} >> Digite o FACEBOOK_APP_ID (ou Enter para pular):\n"
  echo
  read -p "> " nova_facebook_app_id
  echo

  printf "${WHITE} >> Digite o FACEBOOK_APP_SECRET (ou Enter para pular):\n"
  echo
  read -p "> " nova_facebook_app_secret
  echo

  # Portas
  banner
  printf "${WHITE} >> Defina as portas para a nova instância.\n"
  printf "${YELLOW}   ⚠️  As portas devem ser DIFERENTES das instalações existentes!${WHITE}\n"
  echo

  local sugestao_backend=$(sugerir_porta_livre 8081)
  local sugestao_frontend=$(sugerir_porta_livre 3001)
  printf "${CYAN}   💡 Portas livres sugeridas: Backend=${sugestao_backend} | Frontend=${sugestao_frontend}${WHITE}\n"
  echo

  while true; do
    printf "${WHITE} >> Porta do Backend (Enter para usar ${CYAN}${sugestao_backend}${WHITE}):\n"
    echo
    read -p "> " nova_backend_port
    [ -z "${nova_backend_port}" ] && nova_backend_port="${sugestao_backend}"
    echo
    if porta_em_uso "${nova_backend_port}"; then
      printf "${RED} >> A porta ${nova_backend_port} já está em uso. Escolha outra.${WHITE}\n"
      echo
    else
      break
    fi
  done

  while true; do
    printf "${WHITE} >> Porta do Frontend (Enter para usar ${CYAN}${sugestao_frontend}${WHITE}):\n"
    echo
    read -p "> " nova_frontend_port
    [ -z "${nova_frontend_port}" ] && nova_frontend_port="${sugestao_frontend}"
    echo
    if porta_em_uso "${nova_frontend_port}"; then
      printf "${RED} >> A porta ${nova_frontend_port} já está em uso. Escolha outra.${WHITE}\n"
      echo
    else
      break
    fi
  done

  # Gerar JWT secrets para nova instância
  local nova_jwt_secret=$(openssl rand -base64 32)
  local nova_jwt_refresh_secret=$(openssl rand -base64 32)

  # Confirmar dados
  banner
  printf "${WHITE} >> Confira os dados da nova instância:\n"
  echo
  printf "   ${WHITE}Backend URL: -------->> ${YELLOW}${nova_subdominio_backend}\n"
  printf "   ${WHITE}Frontend URL: ------->> ${YELLOW}${nova_subdominio_frontend}\n"
  printf "   ${WHITE}Email: -------------->> ${YELLOW}${nova_email_deploy}\n"
  printf "   ${WHITE}Empresa: ------------>> ${YELLOW}${nova_empresa}\n"
  printf "   ${WHITE}Título: ------------->> ${YELLOW}${nova_nome_titulo}\n"
  printf "   ${WHITE}Porta Backend: ------>> ${YELLOW}${nova_backend_port}\n"
  printf "   ${WHITE}Porta Frontend: ----->> ${YELLOW}${nova_frontend_port}\n"
  printf "   ${WHITE}Modo: --------------->> ${YELLOW}${modo_nova_instalacao}\n"
  echo
  printf "${WHITE} >> Os dados estão corretos? ${GREEN}S/${RED}N:${WHITE}\n"
  echo
  read -p "> " confirmacao_dados
  confirmacao_dados=$(echo "${confirmacao_dados}" | tr '[:lower:]' '[:upper:]')
  echo
  if [ "${confirmacao_dados}" != "S" ]; then
    printf "${RED} >> Operação cancelada.${WHITE}\n"
    sleep 2
    return
  fi

    # Calcular hosts limpos e salvar checkpoint inicial
    clean_backend=$(echo "${nova_subdominio_backend}" | sed 's|https://||g' | sed 's|http://||g' | cut -d'/' -f1)
    clean_frontend=$(echo "${nova_subdominio_frontend}" | sed 's|https://||g' | sed 's|http://||g' | cut -d'/' -f1)
    salvar_vars_nova "${nova_empresa}"
    salvar_etapa_nova "${nova_empresa}" 0
  fi

  # === ETAPA 1: Verificar DNS ===
  if [ "${nova_etapa}" -lt 1 ]; then
  banner
  printf "${WHITE} >> Verificando DNS dos subdomínios...\n"
  echo
  if ! command -v dig &> /dev/null; then
    sudo apt-get install dnsutils -y >/dev/null 2>&1
  fi
  local dns_ok=true
  for domain_check in ${nova_subdominio_backend} ${nova_subdominio_frontend}; do
    local clean_domain=$(echo "${domain_check}" | sed 's|https://||g' | sed 's|http://||g' | cut -d'/' -f1)
    local resolved=$(dig +short ${clean_domain} @8.8.8.8)
    if [ "${resolved}" != "${ip_atual}" ] && [ -n "${resolved}" ]; then
      printf "${YELLOW} >> AVISO: ${clean_domain} aponta para ${resolved:-nenhum} (esperado: ${ip_atual})${WHITE}\n"
      dns_ok=false
    else
      printf "${GREEN} >> ✅ ${clean_domain} OK${WHITE}\n"
    fi
  done
  if [ "$dns_ok" = false ]; then
    echo
    printf "${WHITE} >> Continuar mesmo assim? (S/N):${WHITE}\n"
    read -p "> " cont_dns
    cont_dns=$(echo "${cont_dns}" | tr '[:lower:]' '[:upper:]')
    if [ "${cont_dns}" != "S" ]; then
      printf "${RED} >> Cancelado.${WHITE}\n"
      sleep 2
      return
    fi
  fi
  sleep 1
    salvar_etapa_nova "${nova_empresa}" 1; nova_etapa=1
  fi

  # === ETAPA 2: Criar banco de dados ===
  if [ "${nova_etapa}" -lt 2 ]; then
  banner
  printf "${WHITE} >> Criando banco de dados para '${nova_empresa}'...\n"
  echo
  sudo su - postgres <<EOF
  createdb ${nova_empresa};
  psql -c "DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${nova_empresa}') THEN CREATE USER ${nova_empresa} SUPERUSER INHERIT CREATEDB CREATEROLE; END IF; END \\\$\\\$;"
  psql -c "ALTER USER ${nova_empresa} PASSWORD '${nova_senha_deploy}';"
EOF
  printf "${GREEN} >> ✅ Banco de dados criado!${WHITE}\n"
  sleep 1
    salvar_etapa_nova "${nova_empresa}" 2; nova_etapa=2
  fi

  # === ETAPA 3: Copiar código ===
  if [ "${nova_etapa}" -lt 3 ]; then
  banner
  printf "${WHITE} >> Copiando arquivos para /home/deploy/${nova_empresa}...\n"
  echo
  local dest_dir="/home/deploy/${nova_empresa}"

  if [ "${modo_nova_instalacao}" == "git" ]; then
    REPO_URL="https://${token_git_nova}@${repo_git_nova}"
    git clone "${REPO_URL}" "${dest_dir}"
    if [ $? -ne 0 ]; then
      printf "${RED}❌ ERRO: Falha ao clonar o repositório!${WHITE}\n"
      sleep 3
      return
    fi
  else
    INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    mkdir -p "${dest_dir}"
    cp -r "${INSTALADOR_DIR}/backend" "${dest_dir}/backend"
    cp -r "${INSTALADOR_DIR}/frontend" "${dest_dir}/frontend"
    [ -d "${INSTALADOR_DIR}/api_oficial" ] && cp -r "${INSTALADOR_DIR}/api_oficial" "${dest_dir}/api_oficial"
    [ -d "${INSTALADOR_DIR}/api_transcricao" ] && cp -r "${INSTALADOR_DIR}/api_transcricao" "${dest_dir}/api_transcricao"
  fi

  mkdir -p "${dest_dir}/backend/public/"
  chown deploy:deploy -R "${dest_dir}/"
  chmod 775 -R "${dest_dir}/backend/public/"
  chmod 755 -R "${dest_dir}/frontend/"
  chmod 755 -R "${dest_dir}/backend/"
  [ -d "/home/deploy/.npm" ] && chown deploy:deploy -R /home/deploy/.npm
  [ -d "/home/deploy/.cache" ] && chown deploy:deploy -R /home/deploy/.cache
  rm -rf "${dest_dir}/frontend/node_modules" "${dest_dir}/backend/node_modules" 2>/dev/null

  printf "${GREEN} >> ✅ Arquivos copiados!${WHITE}\n"
  sleep 1
    salvar_etapa_nova "${nova_empresa}" 3; nova_etapa=3
  fi

  # === ETAPA 4: Configurar .env backend ===
  if [ "${nova_etapa}" -lt 4 ]; then
  banner
  printf "${WHITE} >> Configurando .env do backend...\n"
  echo

  sudo su - deploy <<EOF
  cat <<[-]EOF > /home/deploy/${nova_empresa}/backend/.env
NODE_ENV=
BACKEND_URL=https://${clean_backend}
FRONTEND_URL=https://${clean_frontend}
PROXY_PORT=443
PORT=${nova_backend_port}

DB_HOST=localhost
DB_DIALECT=postgres
DB_PORT=5432
DB_USER=${nova_empresa}
DB_PASS=${nova_senha_deploy}
DB_NAME=${nova_empresa}

REDIS_URI=redis://:${nova_senha_deploy}@127.0.0.1:6379
REDIS_OPT_LIMITER_MAX=1
REDIS_OPT_LIMITER_DURATION=3000

RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBIT_USER=${nova_empresa}
RABBIT_PASS=${nova_senha_deploy}
RABBITMQ_URI=amqp://${nova_empresa}:${nova_senha_deploy}@localhost:5672/

TIMEOUT_TO_IMPORT_MESSAGE=1000

JWT_SECRET=${nova_jwt_secret}
JWT_REFRESH_SECRET=${nova_jwt_refresh_secret}
MASTER_KEY=${nova_senha_master}

VERIFY_TOKEN=whaticket
FACEBOOK_APP_ID=${nova_facebook_app_id}
FACEBOOK_APP_SECRET=${nova_facebook_app_secret}

STRIPE_PRIVATE=
STRIPE_OK_URL=https://${clean_backend}/subscription/stripewebhook
STRIPE_CANCEL_URL=https://${clean_frontend}/financeiro

MP_ACCESS_TOKEN=
MP_NOTIFICATION_URL=https://${clean_backend}/subscription/mercadopagowebhook

ASAAS_TOKEN=
ASAAS_NOTIFICATION_URL=https://${clean_backend}/subscription/asaaswebhook

GERENCIANET_SANDBOX=
GERENCIANET_CLIENT_ID=
GERENCIANET_CLIENT_SECRET=
GERENCIANET_PIX_CERT=
GERENCIANET_PIX_KEY=

MAIL_HOST="smtp.gmail.com"
MAIL_USER="SEUGMAIL@gmail.com"
MAIL_PASS="SENHA DE APP"
MAIL_FROM="Recuperação de Senha <SEU GMAIL@gmail.com>"
MAIL_PORT="465"

USE_WHATSAPP_OFICIAL=true
TOKEN_API_OFICIAL="adminpro"
OFFICIAL_CAMPAIGN_CONCURRENCY=10

TRANSCRIBE_URL=http://localhost:4002

VAPID_PUBLIC_KEY=VAPID_PUB_PLACEHOLDER
VAPID_PRIVATE_KEY=VAPID_PRIV_PLACEHOLDER
VAPID_SUBJECT=mailto:${nova_email_deploy}
[-]EOF
EOF

  # Gerar chaves VAPID
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  fi
  VAPID_KEYS=$(npx --yes web-push generate-vapid-keys --json 2>/dev/null)
  if [ -n "${VAPID_KEYS}" ]; then
    VAPID_PUB=$(echo "${VAPID_KEYS}" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4)
    VAPID_PRIV=$(echo "${VAPID_KEYS}" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4)
    if [ -n "${VAPID_PUB}" ] && [ -n "${VAPID_PRIV}" ]; then
      sed -i "s|VAPID_PUB_PLACEHOLDER|${VAPID_PUB}|g" /home/deploy/${nova_empresa}/backend/.env
      sed -i "s|VAPID_PRIV_PLACEHOLDER|${VAPID_PRIV}|g" /home/deploy/${nova_empresa}/backend/.env
      printf "${GREEN} >> Chaves VAPID geradas!${WHITE}\n"
    fi
  fi
  # Rede de segurança: se a tentativa acima falhou, o placeholder ficaria
  # gravado no .env. Essa segunda tentativa (idempotente) cobre esse caso.
  garantir_push_notifications_env "/home/deploy/${nova_empresa}/backend/.env" "${nova_email_deploy}"
  sleep 1
    salvar_etapa_nova "${nova_empresa}" 4; nova_etapa=4
  fi

  # === ETAPA 5: Instalar e buildar backend ===
  if [ "${nova_etapa}" -lt 5 ]; then
  banner
  printf "${WHITE} >> Instalando dependências e compilando backend...\n"
  echo
  sudo su - deploy <<BACKENDINSTALL
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  cd "/home/deploy/${nova_empresa}/backend"
  export PUPPETEER_SKIP_DOWNLOAD=true
  rm -rf node_modules 2>/dev/null || true
  rm -f package-lock.json 2>/dev/null || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  npm install puppeteer-core --legacy-peer-deps
  npm i glob
  npm run build
BACKENDINSTALL

  # Fix ffmpeg
  sudo su - deploy <<FFMPEGFIX
  BACKEND_DIR="/home/deploy/${nova_empresa}/backend"
  FFMPEG_FILE="\${BACKEND_DIR}/node_modules/@ffmpeg-installer/ffmpeg/index.js"
  if [ -f "\$FFMPEG_FILE" ]; then
    sed -i 's|npm3Binary = .*|npm3Binary = "/usr/bin/ffmpeg";|' "\$FFMPEG_FILE"
  fi
  mkdir -p "\${BACKEND_DIR}/node_modules/@ffmpeg-installer/linux-x64/" 2>/dev/null || true
  if [ -d "\${BACKEND_DIR}/node_modules/@ffmpeg-installer/linux-x64/" ]; then
    echo '{ "version": "1.1.0", "name": "@ffmpeg-installer/linux-x64" }' > "\${BACKEND_DIR}/node_modules/@ffmpeg-installer/linux-x64/package.json"
  fi
FFMPEGFIX

  # Migrate e seed
  banner
  printf "${WHITE} >> Executando db:migrate e db:seed...\n"
  echo
  sudo su - deploy <<MIGRATEINSTALL
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  cd "/home/deploy/${nova_empresa}/backend"
  # Garantir que TODAS as migrations rodem antes dos seeds.
  # Falhar imediatamente se alguma migration falhar (evita seeds com schema incompleto).
  set -e
  npx sequelize db:migrate || { echo ">> ERRO: db:migrate falhou. Abortando seeds."; exit 1; }
  # Confirmar que coluna useWhatsapp existe (rede de seguranca para instalacoes legadas)
  PGPASSWORD="${senha_pg}" psql -U postgres -h localhost -d "${nova_empresa}" -c \
    'ALTER TABLE "Plans" ADD COLUMN IF NOT EXISTS "useWhatsapp" BOOLEAN DEFAULT true;' 2>/dev/null || true
  npx sequelize db:seed:all
MIGRATEINSTALL

  # Iniciar PM2 backend
  banner
  printf "${WHITE} >> Iniciando backend no PM2...\n"
  echo
  sudo su - deploy <<PM2BACKEND
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  cd "/home/deploy/${nova_empresa}/backend"
  pm2 start dist/server.js --name ${nova_empresa}-backend
PM2BACKEND

  printf "${GREEN} >> ✅ Backend instalado e rodando!${WHITE}\n"
  sleep 1
    salvar_etapa_nova "${nova_empresa}" 5; nova_etapa=5
  fi

  # === ETAPA 6: Instalar e buildar frontend ===
  if [ "${nova_etapa}" -lt 6 ]; then
  banner
  printf "${WHITE} >> Instalando dependências do frontend...\n"
  echo
  sudo su - deploy <<FRONTENDINSTALL
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  cd "/home/deploy/${nova_empresa}/frontend"
  # Instalacao limpa: deixa o react-scripts controlar sua propria arvore de webpack
  rm -rf node_modules package-lock.json 2>/dev/null || true
  npm cache clean --force >/dev/null 2>&1 || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  node scripts/ensure-ajv.js
FRONTENDINSTALL

  # Configurar .env frontend
  sudo su - deploy <<EOF
  cat <<[-]EOF > /home/deploy/${nova_empresa}/frontend/.env
REACT_APP_BACKEND_URL=https://${clean_backend}
REACT_APP_FACEBOOK_APP_ID=${nova_facebook_app_id}
REACT_APP_REQUIRE_BUSINESS_MANAGEMENT=TRUE
REACT_APP_NAME_SYSTEM=${nova_nome_titulo}
REACT_APP_NUMBER_SUPPORT=${nova_numero_suporte}
SERVER_PORT=${nova_frontend_port}
[-]EOF
EOF

  # Configurar server.js e buildar
  sudo su - deploy <<FRONTENDBUILD
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  cd "/home/deploy/${nova_empresa}/frontend"
  if [ -f "server.js" ]; then
    sed -i 's/3000/'"${nova_frontend_port}"'/g' server.js
    if [ ! -s "server.js" ]; then
      cat > server.js << 'SERVERJS'
const express = require("express");
const path = require("path");
const app = express();
const dotenv = require("dotenv");
dotenv.config();
app.use(express.static(path.join(__dirname, "build")));
app.get("/*", function (req, res) {
    res.sendFile(path.join(__dirname, "build", "index.html"));
});
const port = process.env.PORT || process.env.SERVER_PORT || 3000;
app.listen(port, () => {
    console.log("Server is running on port " + port);
});
SERVERJS
    fi
  else
    cat > server.js << 'SERVERJS'
const express = require("express");
const path = require("path");
const app = express();
const dotenv = require("dotenv");
dotenv.config();
app.use(express.static(path.join(__dirname, "build")));
app.get("/*", function (req, res) {
    res.sendFile(path.join(__dirname, "build", "index.html"));
});
const port = process.env.PORT || process.env.SERVER_PORT || 3000;
app.listen(port, () => {
    console.log("Server is running on port " + port);
});
SERVERJS
  fi
  NODE_OPTIONS="--max-old-space-size=4096 --openssl-legacy-provider" npm run build
FRONTENDBUILD

  # Iniciar PM2 frontend
  sudo su - deploy <<PM2FRONTEND
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  cd "/home/deploy/${nova_empresa}/frontend"
  pm2 start server.js --name ${nova_empresa}-frontend
  pm2 save
PM2FRONTEND

  printf "${GREEN} >> ✅ Frontend instalado e rodando!${WHITE}\n"
  sleep 1
    salvar_etapa_nova "${nova_empresa}" 6; nova_etapa=6
  fi

  # === ETAPA 7: Configurar Nginx ===
  if [ "${nova_etapa}" -lt 7 ]; then
  banner
  printf "${WHITE} >> Configurando Nginx para a nova instância...\n"
  echo

  sudo bash -c "cat > /etc/nginx/sites-available/${nova_empresa}-frontend << 'END'
server {
  server_name ${clean_frontend};
  location / {
    proxy_pass http://127.0.0.1:${nova_frontend_port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_cache_bypass \$http_upgrade;
  }
}
END"
  sudo ln -sf /etc/nginx/sites-available/${nova_empresa}-frontend /etc/nginx/sites-enabled/

  sudo bash -c "cat > /etc/nginx/sites-available/${nova_empresa}-backend << 'END'
upstream ${nova_empresa}_backend {
    server 127.0.0.1:${nova_backend_port};
    keepalive 32;
}
server {
  server_name ${clean_backend};
  location / {
    proxy_pass http://${nova_empresa}_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_cache_bypass \$http_upgrade;
    proxy_buffering on;
  }
}
END"
  sudo ln -sf /etc/nginx/sites-available/${nova_empresa}-backend /etc/nginx/sites-enabled/

  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    printf "${GREEN} >> ✅ Nginx configurado!${WHITE}\n"
  else
    printf "${RED} >> ERRO: Configuração do Nginx inválida. Verifique manualmente.${WHITE}\n"
  fi
  sleep 1
    salvar_etapa_nova "${nova_empresa}" 7; nova_etapa=7
  fi

  # === ETAPA 8: SSL ===
  if [ "${nova_etapa}" -lt 8 ]; then
  banner
  printf "${WHITE} >> Emitindo certificados SSL...\n"
  echo
  sudo certbot -m "${nova_email_deploy}" --nginx --agree-tos --expand -n -d "${clean_backend}" || {
    printf "${YELLOW} >> Aviso: Falha no SSL do backend. Tente: certbot --nginx -d ${clean_backend}${WHITE}\n"
  }
  sudo certbot -m "${nova_email_deploy}" --nginx --agree-tos --expand -n -d "${clean_frontend}" || {
    printf "${YELLOW} >> Aviso: Falha no SSL do frontend. Tente: certbot --nginx -d ${clean_frontend}${WHITE}\n"
  }
  sleep 1
    salvar_etapa_nova "${nova_empresa}" 8; nova_etapa=8
  fi

  # === ETAPA 9: Latência ===
  if [ "${nova_etapa}" -lt 9 ]; then
  sudo su - root <<EOF
cat >> /etc/hosts << 'END'
127.0.0.1   ${clean_backend}
127.0.0.1   ${clean_frontend}
END
EOF
    salvar_etapa_nova "${nova_empresa}" 9; nova_etapa=9
  fi

  # === FINALIZAÇÃO ===
  salvar_etapa_nova "${nova_empresa}" 10
  limpar_checkpoint_nova "${nova_empresa}"
  banner
  printf "${GREEN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  printf "${GREEN}   ✅ NOVA INSTÂNCIA INSTALADA COM SUCESSO!${WHITE}\n"
  printf "${GREEN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  echo
  printf "   ${WHITE}Empresa:  ${BLUE}${nova_empresa}\n"
  printf "   ${WHITE}Backend:  ${BLUE}https://${clean_backend}\n"
  printf "   ${WHITE}Frontend: ${BLUE}https://${clean_frontend}\n"
  printf "   ${WHITE}Porta Backend:  ${CYAN}${nova_backend_port}\n"
  printf "   ${WHITE}Porta Frontend: ${CYAN}${nova_frontend_port}\n"
  echo
  printf "   ${WHITE}Usuário: ${BLUE}admin@equipechat.com\n"
  printf "   ${WHITE}Senha:   ${BLUE}adminpro\n"
  echo
  printf "   ${CYAN}Equipechat${WHITE} By ${GREEN}Raphael Batista${WHITE} - Suporte: ${YELLOW}81 99998-8876${WHITE}\n"
  echo
  printf "${WHITE}>> Pressione Enter para voltar ao menu principal...${WHITE}\n"
  read -r
}

# Menu principal
menu() {
  while true; do
    banner
    printf "${WHITE} Selecione abaixo a opção desejada: \n"
    echo
    printf "   [${BLUE}1${WHITE}] Instalar ${nome_titulo} ${CYAN}(Backend + Frontend)${WHITE}\n"
    printf "   [${BLUE}2${WHITE}] ${YELLOW}Atualizar versão existente${WHITE} ${GREEN}(com backup do banco)${WHITE}\n"
    printf "   [${BLUE}3${WHITE}] ${RED}Rollback${WHITE} - Voltar para versão anterior\n"
    printf "   [${BLUE}4${WHITE}] Instalar API Oficial ${YELLOW}(WhatsApp Business)${WHITE}\n"
    printf "   [${BLUE}5${WHITE}] Instalar ${CYAN}Transcrição de Áudio${WHITE} ${YELLOW}(reinstalar/reparar)${WHITE}\n"
    printf "   [${BLUE}6${WHITE}] ${RED}Desinstalar API Oficial${WHITE}\n"
    printf "   [${BLUE}7${WHITE}] ${RED}Desinstalar Transcrição de Áudio${WHITE}\n"
    printf "   [${CYAN}8${WHITE}] Instalar ${CYAN}n8n${WHITE} - Automação de Workflows\n"
    printf "   [${RED}9${WHITE}] ${RED}Desinstalar n8n${WHITE}\n"
    printf "   [${CYAN}10${WHITE}] Instalar ${CYAN}Typebot${WHITE} - Chatbots Visuais (Builder + Viewer)\n"
    printf "   [${RED}11${WHITE}] ${RED}Desinstalar Typebot${WHITE}\n"
    printf "   [${GREEN}12${WHITE}] ${GREEN}Instalar nova versão na mesma VPS${WHITE} ${CYAN}(multi-instância)${WHITE}\n"
    printf "   [${CYAN}13${WHITE}] Ferramentas ${CYAN}(RabbitMQ, Push, WhatsMeow, wacalls-chat...)${WHITE}\n"
    printf "   [${BLUE}0${WHITE}] Sair\n"
    echo
    read -p "> " option
    case "${option}" in
    1)
      verificar_arquivos_existentes
      ;;
    2)
      menu_atualizar
      ;;
    3)
      rollback_versao
      ;;
    4)
      instalar_api_oficial_separado
      ;;
    5)
      instalar_transcricao_audio_nativa
      ;;
    6)
      desinstalar_api_oficial
      ;;
    7)
      desinstalar_transcricao_audio
      ;;
    8)
      instalar_n8n
      ;;
    9)
      desinstalar_n8n
      ;;
    10)
      instalar_typebot
      ;;
    11)
      desinstalar_typebot
      ;;
    12)
      instalar_nova_versao_mesma_vps
      ;;
    13)
      menu_ferramentas
      ;;
    0)
      sair
      ;;
    *)
      printf "${RED}Opção inválida. Tente novamente.${WHITE}"
      sleep 2
      ;;
    esac
  done
}

# Etapa de instalação (inclui API Oficial integrada)
instalacao_base() {
  carregar_etapa
  if [ "$etapa" == "0" ]; then
    questoes_dns_base || trata_erro "questoes_dns_base"
    verificar_dns_base || trata_erro "verificar_dns_base"
    questoes_variaveis_base || trata_erro "questoes_variaveis_base"
    define_proxy_base || trata_erro "define_proxy_base"
    define_portas_base || trata_erro "define_portas_base"
    confirma_dados_instalacao_base || trata_erro "confirma_dados_instalacao_base"
    salvar_variaveis || trata_erro "salvar_variaveis"
    salvar_etapa 1
  fi
  if [ "$etapa" -le "1" ]; then
    atualiza_vps_base || trata_erro "atualiza_vps_base"
    salvar_etapa 2
  fi
  if [ "$etapa" -le "2" ]; then
    cria_deploy_base || trata_erro "cria_deploy_base"
    salvar_etapa 3
  fi
  if [ "$etapa" -le "3" ]; then
    config_timezone_base || trata_erro "config_timezone_base"
    salvar_etapa 4
  fi
  if [ "$etapa" -le "4" ]; then
    config_firewall_base || trata_erro "config_firewall_base"
    salvar_etapa 5
  fi
  if [ "$etapa" -le "5" ]; then
    instala_puppeteer_base || trata_erro "instala_puppeteer_base"
    salvar_etapa 6
  fi
  if [ "$etapa" -le "6" ]; then
    instala_ffmpeg_base || trata_erro "instala_ffmpeg_base"
    salvar_etapa 7
  fi
  if [ "$etapa" -le "7" ]; then
    instala_postgres_base || trata_erro "instala_postgres_base"
    salvar_etapa 8
  fi
  if [ "$etapa" -le "8" ]; then
    instala_node_base || trata_erro "instala_node_base"
    salvar_etapa 9
  fi
  if [ "$etapa" -le "9" ]; then
    instala_redis_base || trata_erro "instala_redis_base"
    salvar_etapa 10
  fi
  if [ "$etapa" -le "10" ]; then
    instala_pm2_base || trata_erro "instala_pm2_base"
    salvar_etapa 11
  fi
  if [ "$etapa" -le "11" ]; then
    if [ "${proxy}" == "nginx" ]; then
      instala_nginx_base || trata_erro "instala_nginx_base"
      salvar_etapa 12
    elif [ "${proxy}" == "traefik" ]; then
      instala_traefik_base || trata_erro "instala_traefik_base"
      salvar_etapa 12
    fi
  fi
  if [ "$etapa" -le "12" ]; then
    cria_banco_base || trata_erro "cria_banco_base"
    salvar_etapa 13
  fi
  if [ "$etapa" -le "13" ]; then
    salvar_etapa 14
  fi
  if [ "$etapa" -le "14" ]; then
    if [ "${modo_instalacao}" == "git" ]; then
      copia_codigo_git || trata_erro "copia_codigo_git"
    else
      copia_codigo_local || trata_erro "copia_codigo_local"
    fi
    salvar_etapa 15
  fi
  if [ "$etapa" -le "15" ]; then
    instala_backend_base || trata_erro "instala_backend_base"
    instalar_transcricao_automatica
    salvar_etapa 16
  fi
  if [ "$etapa" -le "16" ]; then
    instala_frontend_base || trata_erro "instala_frontend_base"
    salvar_etapa 17
  fi
  if [ "$etapa" -le "17" ]; then
    config_cron_base || trata_erro "config_cron_base"
    salvar_etapa 18
  fi
  if [ "$etapa" -le "18" ]; then
    if [ "${proxy}" == "nginx" ]; then
      config_nginx_base || trata_erro "config_nginx_base"
      salvar_etapa 19
    elif [ "${proxy}" == "traefik" ]; then
      config_traefik_base || trata_erro "config_traefik_base"
      salvar_etapa 19
    fi
  fi
  if [ "$etapa" -le "19" ]; then
    config_latencia_base || trata_erro "config_latencia_base"
    salvar_etapa 20
  fi
  if [ "$etapa" -le "20" ]; then
    instala_wacalls_chat_base || printf "${YELLOW} >> wacalls-chat não instalado (opcional, seguindo).${WHITE}\n"
    salvar_etapa 21
  fi
  if [ "$etapa" -le "21" ]; then
    # Troncal SIP (baresip) — instalada direto na instalação do zero, sem
    # precisar do usuário entrar depois em Ferramentas → Instalar troncal
    # SIP. Opcional: se o pacote não existir no repositório da distro,
    # segue a instalação normalmente (usuário instala manualmente depois).
    instala_sip_baresip_base || printf "${YELLOW} >> Troncal SIP (baresip) não instalada (opcional, seguindo).${WHITE}\n"
    salvar_etapa 22
  fi
  if [ "$etapa" -le "22" ]; then
    # A funcao instalar_api_oficial_integrada existia desde sempre, mas NUNCA
    # era chamada — codigo morto. Na pratica a instalacao do zero copiava a
    # pasta api_oficial para /home/deploy/<empresa> e parava por ai: nada de
    # banco, .env, nginx ou build. Quem instalava do zero terminava sem a API
    # Oficial e sem nenhum aviso de que faltava algo.
    #
    # Fica aqui, depois do nginx ja configurado (etapa 18) e antes do
    # encerramento, e ela mesma pergunta se o usuario quer instalar agora —
    # responder "N" segue a instalacao normalmente.
    instalar_api_oficial_integrada || printf "${YELLOW} >> API Oficial não instalada — use o menu → opção 4 quando quiser.${WHITE}\n"
    fim_instalacao_base || trata_erro "fim_instalacao_base"
    salvar_etapa 23
  fi
}


# Menu de atualização
menu_atualizar() {
  carregar_variaveis
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}🔄 ATUALIZAÇÃO DO SISTEMA (LOCAL)${WHITE}                     ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo
  printf "${WHITE} A atualização será feita com as pastas 'backend' e 'frontend'\n"
  printf "${WHITE} que devem estar no mesmo diretório do instalador.\n"
  echo

  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ ! -d "${INSTALADOR_DIR}/backend" ] || [ ! -d "${INSTALADOR_DIR}/frontend" ]; then
    printf "${RED}❌ ERRO: Pastas 'backend' e/ou 'frontend' não encontradas no diretório do instalador!${WHITE}
"
    printf "${YELLOW}   Coloque as pastas atualizadas no mesmo diretório do instalador e tente novamente.${WHITE}
"
    echo
    printf "${WHITE} >> Pressione Enter para voltar...${WHITE}
"
    read -r
    return
  fi

  # O wacalls-chat (WhatsApp Plus) faz parte da atualização, mas antes NÃO
  # era exigido aqui: sem a pasta ao lado, a atualização seguia normalmente,
  # o microserviço era silenciosamente mantido na versão antiga e o operador
  # terminava achando que tinha atualizado tudo. Foi exatamente assim que o
  # binário ficou meses defasado enquanto backend e frontend avançavam.
  # Agora avisa de forma explícita e pede confirmação pra continuar sem ele.
  if [ ! -d "${INSTALADOR_DIR}/wacalls-chat" ]; then
    echo
    printf "${RED}⚠  ATENÇÃO: pasta 'wacalls-chat' NÃO encontrada ao lado do instalador.${WHITE}
"
    printf "${YELLOW}   O WhatsApp Plus (mensagens e chamadas) NÃO será atualizado.${WHITE}
"
    printf "${YELLOW}   Backend e frontend serão atualizados normalmente.${WHITE}
"
    echo
    printf "${WHITE}   A atualização foi CANCELADA para não deixar o WhatsApp Plus para trás.${WHITE}
"
    printf "${WHITE}   Extraia o zip completo da versão e rode o instalador de dentro${WHITE}
"
    printf "${WHITE}   da pasta onde estão backend/, frontend/ e wacalls-chat/.${WHITE}
"
    echo
    printf "${WHITE} >> Pressione Enter para voltar...${WHITE}
"
    read -r
    return
  fi

  detectar_instalacao || return 1
  if [ ! -f "/home/deploy/${empresa}/backend/.env" ]; then
    printf "${RED}❌ ERRO: .env do backend não encontrado em /home/deploy/${empresa}/backend/.env${WHITE}
"
    printf "${YELLOW}   Informe a pasta correta da instalação antes de atualizar.${WHITE}
"
    echo
    printf "${WHITE} >> Pressione Enter para voltar...${WHITE}
"
    read -r
    return
  fi

  echo
  printf "${WHITE}────────────────────────────────────────────────────────────${WHITE}
"
  printf "${CYAN} O QUE SERÁ ATUALIZADO NESTA EXECUÇÃO${WHITE}
"
  printf "${WHITE}────────────────────────────────────────────────────────────${WHITE}
"
  printf "${GREEN}  ✓ Backend${WHITE}
"
  printf "${GREEN}  ✓ Frontend${WHITE}
"
  printf "${GREEN}  ✓ WhatsApp Plus (wacalls-chat) — recompilado do fonte${WHITE}
"
  printf "${GREEN}  ✓ API Oficial (NestJS) — dependências, prisma e build${WHITE}
"
  printf "${GREEN}  ✓ API de Transcrição (Python) — venv e dependências${WHITE}
"
  printf "${GREEN}  ✓ Troncal SIP (baresip) — config e módulos reaplicados${WHITE}
"
  printf "${WHITE}  Instalador ${VERSAO_INSTALADOR} (${DATA_INSTALADOR})${WHITE}
"
  printf "${WHITE}────────────────────────────────────────────────────────────${WHITE}
"
  echo

  printf "${GREEN}✅ Pastas encontradas! Instalação detectada em /home/deploy/${empresa}.${WHITE}
"
  printf "${GREEN}✅ Iniciando atualização local...${WHITE}
"
  echo
  sleep 2
  atualizar_base
}



# ------------------------------------------------------------
# VERIFICAÇÃO FINAL DOS ARTEFATOS COMPILADOS
#
# Por que isto existe: numa atualização real, o binário do wacalls-chat ficou
# 14 DIAS sem ser regerado. O instalador chamava o build, mas quando ele falha
# a rotina mantém o binário anterior "pra não derrubar o serviço" e segue em
# frente — o aviso vermelho se perde no meio de centenas de linhas de saída, e
# a pessoa termina a atualização achando que subiu tudo. Ficaram semanas de
# correções de Go escritas, empacotadas e NUNCA executadas.
#
# Esta função fecha esse buraco: em vez de confiar no código de retorno de
# cada etapa, ela olha o RESULTADO — o artefato existe? é mais novo que o
# código-fonte dele? Se não for, reconstrói na hora, sozinha. Só pede ação
# manual quando a reconstrução também falha, e aí mostra o comando exato.
#
# Roda tanto na instalação do zero quanto na atualização.
# ------------------------------------------------------------

# Diz se <artefato> está mais velho que algum arquivo-fonte em <pasta>.
# Retorna 0 (verdadeiro) quando precisa reconstruir.
_artefato_desatualizado() {
  local art="$1" src="$2" pat="${3:-*}"
  [ -e "$art" ] || return 0
  [ -d "$src" ] || return 1
  local mais_novo
  mais_novo=$(find "$src" -type f -name "$pat" -newer "$art" \
                -not -path '*/node_modules/*' -not -path '*/dist/*' \
                -not -path '*/build/*' -print -quit 2>/dev/null)
  [ -n "$mais_novo" ]
}

_idade_artefato() {
  if [ -e "$1" ]; then
    date -r "$1" '+%d/%m %H:%M' 2>/dev/null || echo "?"
  else
    echo "AUSENTE"
  fi
}

verificar_artefatos_build() {
  local APP_DIR="/home/deploy/${empresa}"
  local pendencias=0
  local relatorio=""

  echo
  printf "${BLUE}══════════════════════════════════════════════════════════════════${WHITE}\n"
  printf "${BLUE} VERIFICAÇÃO FINAL — o que foi realmente recompilado${WHITE}\n"
  printf "${BLUE}══════════════════════════════════════════════════════════════════${WHITE}\n"

  # ---------- BACKEND ----------
  local bk="${APP_DIR}/backend"
  if [ -d "$bk/src" ]; then
    if _artefato_desatualizado "$bk/dist/server.js" "$bk/src" '*.ts'; then
      printf "${YELLOW} >> [backend] dist mais velho que o código — recompilando...${WHITE}\n"
      su - deploy -c "cd $bk && npm run build" >/tmp/rebuild-backend.log 2>&1
      if _artefato_desatualizado "$bk/dist/server.js" "$bk/src" '*.ts'; then
        relatorio="${relatorio}\n   ${RED}✗${WHITE} backend  — build falhou (log: /tmp/rebuild-backend.log)"
        pendencias=$((pendencias+1))
      else
        # Se o build da atualização tinha falhado, as migrations rodaram com o
        # dist antigo (sem as novas) e o processo no ar é o antigo: aplica as
        # migrations agora e reinicia o backend para valer o código novo.
        su - deploy -c "cd $bk && npx sequelize db:migrate" >>/tmp/rebuild-backend.log 2>&1 \
          || printf "${RED} >> [backend] migrations falharam (log: /tmp/rebuild-backend.log)${WHITE}\n"
        su - deploy -c "pm2 restart ${empresa}-backend --update-env" >/dev/null 2>&1 || true
        relatorio="${relatorio}\n   ${GREEN}✓${WHITE} backend  — recompilado agora (migrations aplicadas e backend reiniciado)"
      fi
    else
      relatorio="${relatorio}\n   ${GREEN}✓${WHITE} backend  — $(_idade_artefato "$bk/dist/server.js")"
    fi
  fi

  # ---------- FRONTEND ----------
  local fe="${APP_DIR}/frontend"
  if [ -d "$fe/src" ]; then
    if _artefato_desatualizado "$fe/build/index.html" "$fe/src"; then
      printf "${YELLOW} >> [frontend] build mais velho que o código — recompilando...${WHITE}\n"
      su - deploy -c "cd $fe && NODE_OPTIONS='--max-old-space-size=4096 --openssl-legacy-provider' npm run build" \
        >/tmp/rebuild-frontend.log 2>&1
      if _artefato_desatualizado "$fe/build/index.html" "$fe/src"; then
        relatorio="${relatorio}\n   ${RED}✗${WHITE} frontend — build falhou (log: /tmp/rebuild-frontend.log)"
        pendencias=$((pendencias+1))
      else
        relatorio="${relatorio}\n   ${GREEN}✓${WHITE} frontend — recompilado agora"
      fi
    else
      relatorio="${relatorio}\n   ${GREEN}✓${WHITE} frontend — $(_idade_artefato "$fe/build/index.html")"
    fi
  fi

  # ---------- API OFICIAL ----------
  local ao="${APP_DIR}/api_oficial"
  if [ -d "$ao/src" ]; then
    if _artefato_desatualizado "$ao/dist/main.js" "$ao/src" '*.ts'; then
      printf "${YELLOW} >> [api_oficial] dist mais velho que o código — recompilando...${WHITE}\n"
      su - deploy -c "cd $ao && npm run build" >/tmp/rebuild-apioficial.log 2>&1
      if _artefato_desatualizado "$ao/dist/main.js" "$ao/src" '*.ts'; then
        relatorio="${relatorio}\n   ${RED}✗${WHITE} api_oficial — build falhou (log: /tmp/rebuild-apioficial.log)"
        pendencias=$((pendencias+1))
      else
        relatorio="${relatorio}\n   ${GREEN}✓${WHITE} api_oficial — recompilado agora"
      fi
    else
      relatorio="${relatorio}\n   ${GREEN}✓${WHITE} api_oficial — $(_idade_artefato "$ao/dist/main.js")"
    fi
  fi

  # ---------- WACALLS-CHAT (Go) ----------
  # Este é o que motivou a função inteira.
  local wc="${WACALLS_CHAT_DIR:-/home/deploy/wacalls-chat}"
  if [ -d "$wc/cmd/server" ]; then
    if _artefato_desatualizado "$wc/wacalls-chat" "$wc/cmd" '*.go' \
       || _artefato_desatualizado "$wc/wacalls-chat" "$wc/internal" '*.go'; then
      printf "${YELLOW} >> [wacalls-chat] binário mais velho que o código Go — recompilando...${WHITE}\n"
      chown -R deploy:deploy /home/deploy/go /home/deploy/.cache 2>/dev/null || true
      su - deploy -c "cd $wc && export GOTOOLCHAIN=auto GOFLAGS=-mod=mod GOPATH=/home/deploy/go GOCACHE=/home/deploy/.cache/go-build PATH=/usr/local/go/bin:\$PATH && go mod download && go build -o wacalls-chat ./cmd/server" \
        >/tmp/rebuild-wacalls.log 2>&1 \
        || bash -lc "cd $wc && export GOTOOLCHAIN=auto GOFLAGS=-mod=mod PATH=/usr/local/go/bin:\$PATH && go build -o wacalls-chat ./cmd/server" \
        >>/tmp/rebuild-wacalls.log 2>&1

      chown deploy:deploy "$wc/wacalls-chat" 2>/dev/null || true

      if _artefato_desatualizado "$wc/wacalls-chat" "$wc/cmd" '*.go'; then
        relatorio="${relatorio}\n   ${RED}✗${WHITE} wacalls-chat — build falhou (log: /tmp/rebuild-wacalls.log)"
        pendencias=$((pendencias+1))
      else
        relatorio="${relatorio}\n   ${GREEN}✓${WHITE} wacalls-chat — recompilado agora"
        systemctl restart "${WACALLS_CHAT_SERVICE:-wacalls-chat}" 2>/dev/null || true
      fi
    else
      relatorio="${relatorio}\n   ${GREEN}✓${WHITE} wacalls-chat — $(_idade_artefato "$wc/wacalls-chat")"
    fi
  fi

  echo
  printf "${WHITE} Artefatos:${WHITE}"
  printf "${relatorio}\n"
  echo

  if [ "$pendencias" -gt 0 ]; then
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${RED} ATENÇÃO: ${pendencias} componente(s) NÃO estão rodando o código novo.${WHITE}\n"
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${WHITE} Veja o log indicado acima antes de considerar a atualização feita.${WHITE}\n"
    echo
    return 1
  fi

  printf "${GREEN} >> Todos os componentes estão rodando o código desta versão.${WHITE}\n"
  echo
  return 0
}


# Etapa de atualização (local)
atualizar_base() {
  # Áudio das ligações do WhatsApp Plus (UDP 50000-50999) — toda atualização.
  liberar_portas_audio_wacalls || true
  detectar_instalacao || return 1
  preflight_atualizacao || return 1
  backup_app_atualizar || trata_erro "backup_app_atualizar"
  instala_ffmpeg_base || trata_erro "instala_ffmpeg_base"
  config_cron_base || trata_erro "config_cron_base"
  baixa_codigo_atualizar || trata_erro "baixa_codigo_atualizar"
  # Não usa trata_erro (não deve abortar a atualização inteira), mas avisa
  # em vermelho — antes o "|| true" escondia a falha e o WhatsApp Plus
  # simplesmente não era instalado sem ninguém perceber.
  if ! atualiza_wacalls_chat_base; then
    WACALLS_UPDATE_FALHOU=1
    printf "${RED} >> [wacalls-chat] ATENÇÃO: atualização do WhatsApp Plus FALHOU (veja /tmp/wacalls-chat-build.log).${WHITE}\n"
    printf "${YELLOW} >>    O restante da atualização segue normalmente.${WHITE}\n"
    sleep 3
  fi
  # Troncal SIP (baresip): sempre reaplica config/módulos/systemd nessa
  # etapa, mesmo quando já está instalada — antes só instalava aqui na
  # primeira vez ("comando -v baresip" já existente pulava tudo), e correções
  # feitas no instalador (module_path, menu.so, resiliência do PulseAudio,
  # etc.) nunca chegavam em quem já tinha a troncal, obrigando a ir toda vez
  # em Ferramentas → Instalar troncal SIP manualmente. instala_sip_baresip_base
  # é idempotente (não mexe no accounts/troncal já configurados pelo
  # usuário, só regenera config/systemd/módulos), então é seguro repetir a
  # cada atualização.
  if ! command -v baresip >/dev/null 2>&1; then
    printf "${WHITE} >> [SIP] baresip não encontrado, instalando...${WHITE}\n"
  else
    printf "${WHITE} >> [SIP] baresip já instalado — reaplicando config/módulos mais recentes...${WHITE}\n"
  fi
  instala_sip_baresip_base || printf "${YELLOW} >> Troncal SIP (baresip) não instalada/atualizada (opcional, seguindo).${WHITE}\n"

  if [ "${WACALLS_UPDATE_FALHOU}" = "1" ]; then
    echo
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${RED} Atualização concluída, MAS o WhatsApp Plus (wacalls-chat) falhou.${WHITE}\n"
    printf "${WHITE} Log do build: /tmp/wacalls-chat-build.log${WHITE}\n"
    printf "${WHITE} Depois de corrigir, rode: instalador → Ferramentas → Atualizar WhatsApp Plus${WHITE}\n"
    printf "${RED}══════════════════════════════════════════════════════════════════${WHITE}\n"
    WACALLS_UPDATE_FALHOU=0
  fi

  # Rede de segurança: confere o RESULTADO de cada build e reconstrói sozinho
  # o que ficou para trás. Sem isto, uma etapa que falhou no meio da saída
  # passava batido — foi o que deixou o binário do wacalls-chat 14 dias
  # desatualizado em produção, com semanas de correções nunca executadas.
  verificar_artefatos_build || true

  # Resumo final com PROVA do que subiu. A data do binário é o único jeito
  # confiável de saber se o WhatsApp Plus foi realmente recompilado — sem
  # isso, uma etapa pulada passa despercebida no meio de centenas de linhas
  # de log do npm/build.
  echo
  printf "${WHITE}══════════════════════════════════════════════════════════════════${WHITE}\n"
  printf "${CYAN} RESUMO DA ATUALIZAÇÃO${WHITE}\n"
  printf "${WHITE}══════════════════════════════════════════════════════════════════${WHITE}\n"
  # Prova de que o backend tem o que precisa para subir. O bloco que instala e
  # compila roda numa sessão separada (sudo su - deploy): se ela morrer no
  # meio — npm não encontrado, cd falhando, sessão cortada — a atualização
  # seguia e anunciava sucesso com o node_modules APAGADO, porque o
  # "rm -rf node_modules" já tinha acontecido. O sintoma vinha depois, no
  # PM2: "Cannot find module 'dotenv/config'".
  local _bk="/home/deploy/${empresa}/backend"
  local _backend_ok=1

  if [ ! -d "${_bk}/node_modules" ]; then
    printf "${RED} ❌ Backend SEM node_modules — a instalação de pacotes não rodou${WHITE}\n"
    printf "${YELLOW}    sudo -u deploy bash -lc 'cd ${_bk} && npm install --include=dev && npm run build'${WHITE}\n"
    _backend_ok=0
  elif [ ! -d "${_bk}/node_modules/dotenv" ]; then
    printf "${RED} ❌ Backend com node_modules INCOMPLETO (falta dotenv)${WHITE}\n"
    printf "${YELLOW}    sudo -u deploy bash -lc 'cd ${_bk} && rm -rf node_modules && npm install --include=dev && npm run build'${WHITE}\n"
    _backend_ok=0
  fi

  if [ ! -f "${_bk}/dist/server.js" ]; then
    printf "${RED} ❌ Backend sem dist/server.js — a compilação não gerou saída${WHITE}\n"
    _backend_ok=0
  fi

  if [ "${_backend_ok}" = "1" ]; then
    printf "${GREEN} ✅ Backend e Frontend${WHITE}\n"
  else
    printf "${RED} >> A atualização NÃO terminou. Corrija o backend antes de usar.${WHITE}\n"
  fi

  local _push_pub
  _push_pub=$(grep -E '^VAPID_PUBLIC_KEY=' "${_bk}/.env" 2>/dev/null | tail -1 | cut -d'=' -f2-)
  if [ -n "${_push_pub}" ] && [[ "${_push_pub}" != *PLACEHOLDER* ]]; then
    printf "${GREEN} ✅ Push Notifications — chaves VAPID configuradas${WHITE}\n"
  else
    printf "${RED} ❌ Push Notifications SEM chaves VAPID válidas${WHITE}\n"
    printf "${YELLOW}    Rode: Ferramentas → Instalar Push Notifications, ou: npx web-push generate-vapid-keys${WHITE}\n"
  fi

  local _wc_bin="/home/deploy/wacalls-chat/wacalls-chat"
  if [ -f "${_wc_bin}" ]; then
    local _wc_data
    _wc_data=$(date -r "${_wc_bin}" '+%d/%m/%Y %H:%M' 2>/dev/null)
    local _hoje
    _hoje=$(date '+%d/%m/%Y')
    if [ "${_wc_data%% *}" = "${_hoje}" ]; then
      printf "${GREEN} ✅ WhatsApp Plus (wacalls-chat) — binário de ${_wc_data}${WHITE}\n"
    else
      printf "${RED} ❌ WhatsApp Plus NÃO atualizado — binário ainda de ${_wc_data}${WHITE}\n"
      printf "${YELLOW}    Rode: Ferramentas → Atualizar wacalls-chat (com a pasta ao lado)${WHITE}\n"
    fi
  else
    printf "${YELLOW} ⚠  WhatsApp Plus não instalado nesta VPS${WHITE}\n"
  fi

  if systemctl is-active --quiet wacalls-chat 2>/dev/null; then
    printf "${GREEN} ✅ Serviço wacalls-chat em execução${WHITE}\n"
  elif [ -f "${_wc_bin}" ]; then
    printf "${RED} ❌ Serviço wacalls-chat PARADO${WHITE}\n"
  fi

  # API Oficial: a data do dist é a única prova de que o código novo compilou.
  local _ao_dir="/home/deploy/${empresa}/api_oficial"
  if [ -d "${_ao_dir}" ]; then
    local _ao_status=""
    [ -f /tmp/apioficial_build.status ] && _ao_status=$(cat /tmp/apioficial_build.status)

    if [ "${_ao_status}" = "falhou" ]; then
      printf "${RED} ❌ API Oficial — BUILD FALHOU, o dist antigo continua no ar${WHITE}\n"
      printf "${YELLOW}    Corrija o erro de compilação e rode a atualização de novo.${WHITE}\n"
    elif [ -d "${_ao_dir}/dist" ]; then
      local _ao_data
      _ao_data=$(date -r "${_ao_dir}/dist" '+%d/%m/%Y %H:%M' 2>/dev/null)
      local _hoje_ao
      _hoje_ao=$(date '+%d/%m/%Y')
      if [ "${_ao_data%% *}" = "${_hoje_ao}" ]; then
        printf "${GREEN} ✅ API Oficial — compilada em ${_ao_data}${WHITE}\n"
      else
        printf "${RED} ❌ API Oficial NÃO recompilada — dist ainda de ${_ao_data}${WHITE}\n"
      fi
    else
      printf "${RED} ❌ API Oficial sem dist — nunca foi compilada${WHITE}\n"
    fi
  fi

  # Transcrição: antes bastava a PASTA existir para imprimir ✅ — não provava
  # nada. Agora exige a venv funcional (com os módulos carregando) e o serviço
  # de pé, que é o que o usuário chama de "está funcionando".
  local _tr_dir="/home/deploy/${empresa}/api_transcricao"
  if [ -d "${_tr_dir}" ]; then
    if [ ! -x "${_tr_dir}/venv/bin/python3" ]; then
      printf "${RED} ❌ API de Transcrição sem ambiente Python (venv)${WHITE}\n"
      printf "${YELLOW}    Rode: bash ${_tr_dir}/install-python-app.sh${WHITE}\n"
    elif ! "${_tr_dir}/venv/bin/python3" -c "import flask, speech_recognition, pydub, dotenv, requests" >/dev/null 2>&1; then
      printf "${RED} ❌ API de Transcrição com dependências faltando${WHITE}\n"
      printf "${YELLOW}    Rode: bash ${_tr_dir}/install-python-app.sh${WHITE}\n"
    else
      local _tr_http
      _tr_http=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:4002/ 2>/dev/null)
      if [ -n "${_tr_http}" ] && [ "${_tr_http}" != "000" ]; then
        printf "${GREEN} ✅ API de Transcrição — respondendo na porta 4002${WHITE}\n"
      else
        printf "${RED} ❌ API de Transcrição não responde na porta 4002${WHITE}\n"
        printf "${YELLOW}    Veja: pm2 logs api_transcricao --lines 50${WHITE}\n"
      fi
    fi
  fi
  printf "${WHITE}══════════════════════════════════════════════════════════════════${WHITE}\n"
}


sair() {
  # Remoção da pasta do instalador, agendada por fim_instalacao_base. Só roda
  # se a instalação do zero tiver concluído nesta sessão — atualização e uso
  # avulso do menu não apagam nada.
  if [ -n "${LIMPAR_INSTALADOR_AO_SAIR:-}" ] && [ -d "${LIMPAR_INSTALADOR_AO_SAIR}" ] \
     && [ "${LIMPAR_INSTALADOR_AO_SAIR}" != "/" ] && [ "${LIMPAR_INSTALADOR_AO_SAIR}" != "/root" ]; then
    printf "${WHITE}>> Removendo a pasta do instalador: ${CYAN}${LIMPAR_INSTALADOR_AO_SAIR}${WHITE}\n"
    cat > /tmp/_cleanup_installer.sh << 'CLEANUP'
#!/bin/bash
sleep 2
rm -rf "$1"
rm -f /tmp/_cleanup_installer.sh
CLEANUP
    chmod +x /tmp/_cleanup_installer.sh
    nohup /tmp/_cleanup_installer.sh "${LIMPAR_INSTALADOR_AO_SAIR}" >/dev/null 2>&1 &
    printf "${GREEN}   ✅ Pasta removida.${WHITE}\n"
  fi
  exit 0
}

################################################################
#                    API OFICIAL - INTEGRADA                    #
################################################################

# Reparo de Nginx para API Oficial
reparo_nginx_apioficial() {
  printf "${YELLOW} >> Verificando configuração do Nginx para API Oficial...${WHITE}\n"
  sudo rm -f /etc/nginx/sites-enabled/-oficial 2>/dev/null
  sudo rm -f /etc/nginx/sites-available/-oficial 2>/dev/null
  sudo sed -i '/include \/etc\/nginx\/sites-enabled\/-oficial;/d' /etc/nginx/nginx.conf 2>/dev/null
}

# Solicitar subdomínio da API Oficial
solicitar_dados_apioficial() {
  local temp_subdominio_oficial
  banner
  printf "${WHITE} >> Insira o subdomínio da API Oficial (Ex: api.seusistema.com.br): \n"
  echo
  read -p "> " temp_subdominio_oficial
  echo
  subdominio_oficial=$(echo "${temp_subdominio_oficial}" | sed 's|https://||g' | sed 's|http://||g' | cut -d'/' -f1)
  echo "subdominio_oficial=${subdominio_oficial}" >>$ARQUIVO_VARIAVEIS
}

# Verificar DNS da API Oficial
verificar_dns_apioficial() {
  banner
  printf "${WHITE} >> Verificando o DNS do subdomínio: ${subdominio_oficial}...\n"
  echo
  if ! command -v dig &> /dev/null; then
    sudo apt-get update >/dev/null 2>&1
    sudo apt-get install dnsutils -y >/dev/null 2>&1
  fi
  local resolved_ip=$(dig +short ${subdominio_oficial} @8.8.8.8)
  if [[ "${resolved_ip}" != "${ip_atual}"* ]] || [ -z "${resolved_ip}" ]; then
    printf "${YELLOW} >> AVISO: DNS de ${subdominio_oficial} não aponta para este IP (${ip_atual}).${WHITE}\n"
    printf "${WHITE} >> IP resolvido: ${resolved_ip:-nenhum}${WHITE}\n"
    echo
    printf "${WHITE} >> Deseja continuar mesmo assim? (S/N): ${WHITE}\n"
    read -p "> " continuar_dns_api
    continuar_dns_api=$(echo "${continuar_dns_api}" | tr '[:lower:]' '[:upper:]')
    if [ "${continuar_dns_api}" != "S" ]; then
      printf "${RED} >> Instalação da API Oficial cancelada. Configure o DNS e tente novamente.${WHITE}\n"
      sleep 3
      return 1
    fi
  else
    printf "${GREEN} >> DNS OK! ${subdominio_oficial} aponta para ${ip_atual}${WHITE}\n"
    sleep 2
  fi
}

# Configurar Nginx para API Oficial
configurar_nginx_apioficial() {
  banner
  printf "${WHITE} >> Configurando Nginx para API Oficial...\n"
  echo
  local sites_available_path="/etc/nginx/sites-available/${empresa}-oficial"
  local sites_enabled_link="/etc/nginx/sites-enabled/${empresa}-oficial"

  sudo rm -f "${sites_enabled_link}" 2>/dev/null
  sudo rm -f "${sites_available_path}" 2>/dev/null

  sudo bash -c "cat > ${sites_available_path} << 'END'
upstream oficial {
    server 127.0.0.1:${default_apioficial_port};
    keepalive 32;
}
server {
    server_name ${subdominio_oficial};
    location / {
        proxy_pass http://oficial;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
END"
  sudo ln -sf ${sites_available_path} ${sites_enabled_link}
  
  # Testa configuração antes de recarregar
  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    printf "${GREEN} >> Nginx configurado com sucesso!${WHITE}\n"
  else
    printf "${RED} >> ERRO: Configuração do Nginx inválida. Verifique manualmente.${WHITE}\n"
    return 1
  fi
  sleep 2

  # SSL
  printf "${WHITE} >> Emitindo certificado SSL para ${subdominio_oficial}...${WHITE}\n"
  sudo certbot -m "${email_deploy}" --nginx --agree-tos --expand -n -d "${subdominio_oficial}" || {
    printf "${YELLOW} >> Aviso: Falha no SSL. Tente manualmente: certbot --nginx -d ${subdominio_oficial}${WHITE}\n"
    sleep 3
  }
}

# Criar banco da API Oficial
criar_banco_apioficial() {
  banner
  printf "${WHITE} >> Criando banco de dados 'oficialseparado'...\n"
  echo
  # Verifica se o banco já existe
  if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "oficialseparado"; then
    printf "${YELLOW} >> Banco 'oficialseparado' já existe. Pulando criação...${WHITE}\n"
  else
    sudo -u postgres psql -c "CREATE DATABASE oficialseparado WITH OWNER ${empresa};" || {
      printf "${RED} >> Erro ao criar banco. Verifique se o usuário ${empresa} existe no PostgreSQL.${WHITE}\n"
      return 1
    }
    printf "${GREEN} >> Banco 'oficialseparado' criado com sucesso!${WHITE}\n"
  fi
  sleep 2
}

# Configurar .env da API Oficial
configurar_env_apioficial() {
  banner
  printf "${WHITE} >> Configurando .env da API Oficial...\n"
  echo
  local backend_env_path="/home/deploy/${empresa}/backend/.env"
  local jwt_refresh_secret_backend=""
  local backend_url_full=""
  
  if [ -f "${backend_env_path}" ]; then
    jwt_refresh_secret_backend=$(grep "^JWT_REFRESH_SECRET=" "${backend_env_path}" | cut -d '=' -f2- | tr -d '\r')
    backend_url_full=$(grep "^BACKEND_URL=" "${backend_env_path}" | cut -d '=' -f2- | tr -d '\r')
  else
    printf "${YELLOW} >> Aviso: .env do backend não encontrado. Usando valores padrão.${WHITE}\n"
    jwt_refresh_secret_backend="${jwt_refresh_secret}"
    backend_url_full="https://${subdominio_backend}"
  fi
  
  local api_oficial_dir="/home/deploy/${empresa}/api_oficial"
  sudo mkdir -p "${api_oficial_dir}"
  sudo chown deploy:deploy "${api_oficial_dir}"
  
  sudo -u deploy bash -c "cat > ${api_oficial_dir}/.env <<EOF
DATABASE_LINK=postgresql://${empresa}:${senha_deploy}@localhost:5432/oficialseparado?schema=public
DATABASE_URL=localhost
DATABASE_PORT=5432
DATABASE_USER=${empresa}
DATABASE_PASSWORD=${senha_deploy}
DATABASE_NAME=oficialseparado
TOKEN_ADMIN=adminpro
URL_BACKEND_MULT100=${backend_url_full}
JWT_REFRESH_SECRET=${jwt_refresh_secret_backend}
REDIS_URI=redis://:${senha_deploy}@127.0.0.1:6379
PORT=${default_apioficial_port}
URL_API_OFICIAL=${subdominio_oficial}
NAME_ADMIN=SetupAutomatizado
EMAIL_ADMIN=admin@equipechat.com
PASSWORD_ADMIN=adminpro
EOF"
  printf "${GREEN} >> .env da API Oficial configurado!${WHITE}\n"
  sleep 2
}

# Instalar dependências e build da API Oficial
build_apioficial() {
  banner
  printf "${WHITE} >> Instalando dependências e compilando API Oficial...\n"
  echo
  local api_oficial_dir="/home/deploy/${empresa}/api_oficial"
  local repo_api_dir="/home/deploy/${empresa}/api_oficial"
  
  # Se o diretório não existe ou não tem package.json, tentar copiar do repo
  if [ ! -f "${api_oficial_dir}/package.json" ]; then
    printf "${YELLOW} >> package.json não encontrado em ${api_oficial_dir}${WHITE}\n"
    printf "${WHITE} >> Tentando localizar pasta api_oficial no repositório...${WHITE}\n"
    
    # Procurar api_oficial em possíveis locais do repo
    local base_dir="/home/deploy/${empresa}"
    if [ -f "${base_dir}/api_oficial/package.json" ]; then
      printf "${GREEN} >> Encontrado em ${base_dir}/api_oficial${WHITE}\n"
    else
      printf "${RED} >> ERRO: Pasta api_oficial com package.json não encontrada!${WHITE}\n"
      printf "${YELLOW} >> Verifique se o repositório contém a pasta 'api_oficial'.${WHITE}\n"
      printf "${YELLOW} >> O repositório clonado deve ter a estrutura: backend/, frontend/, api_oficial/${WHITE}\n"
      return 1
    fi
  fi
  
  # Garantir permissões corretas
  sudo chown deploy:deploy -R "${api_oficial_dir}"
  
  sudo su - deploy <<INSTALL_API
  # Configura PATH
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  
  cd ${api_oficial_dir}

  if [ ! -f "package.json" ]; then
    echo "ERRO: package.json não encontrado em ${api_oficial_dir}"
    exit 1
  fi

  rm -rf node_modules 2>/dev/null || true
  rm -f package-lock.json 2>/dev/null || true
  rm -rf dist 2>/dev/null || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  npx prisma generate

  # O resultado do build precisa ser testado AQUI dentro. O \$? lá fora pega o
  # código do ÚLTIMO comando do heredoc (era o "pm2 save", que quase sempre dá
  # 0), então um erro de TypeScript passava batido e o instalador anunciava
  # "compilada com sucesso" com dist inexistente — foi assim que um erro de
  # tipagem do amqplib ficou escondido.
  if ! npm run build; then
    echo "ERRO_BUILD_API_OFICIAL"
    exit 1
  fi
  if [ ! -f "dist/main.js" ]; then
    echo "ERRO_BUILD_API_OFICIAL"
    exit 1
  fi

  npx prisma migrate deploy || echo "AVISO: prisma migrate deploy falhou"

  # Sem remover antes, rodar a instalação de novo cria uma segunda entrada
  # disputando a mesma porta; a segunda morre em loop.
  pm2 delete api_oficial >/dev/null 2>&1 || true
  pm2 start dist/main.js --name=api_oficial --cwd ${api_oficial_dir}
  pm2 save
INSTALL_API

  local _rc_api=$?
  if [ ${_rc_api} -ne 0 ]; then
    printf "${RED} >> ❌ A API Oficial NÃO foi instalada: a compilação falhou.${WHITE}\n"
    printf "${YELLOW}    Role a tela para ver o erro de compilação acima.${WHITE}\n"
    printf "${YELLOW}    Depois de corrigir, rode o menu → opção 4.${WHITE}\n"
    sleep 3
    return 1
  fi

  # Prova fora do heredoc: o arquivo existe mesmo no disco?
  if [ ! -f "${api_oficial_dir}/dist/main.js" ]; then
    printf "${RED} >> ❌ API Oficial sem dist/main.js — a compilação não gerou saída.${WHITE}\n"
    sleep 3
    return 1
  fi

  printf "${GREEN} >> ✅ API Oficial compilada e iniciada com sucesso!${WHITE}\n"
  sleep 2
}

# Atualizar .env do backend para vincular API Oficial
vincular_apioficial_backend() {
  banner
  printf "${WHITE} >> Vinculando API Oficial ao Backend...\n"
  echo
  local backend_env_path="/home/deploy/${empresa}/backend/.env"
  
  if [ ! -f "${backend_env_path}" ]; then
    printf "${RED} >> .env do backend não encontrado. Pulando vinculação.${WHITE}\n"
    return 0
  fi
  
  sudo sed -i 's|^USE_WHATSAPP_OFICIAL=.*|USE_WHATSAPP_OFICIAL=true|' "${backend_env_path}"
  if grep -q "^URL_API_OFICIAL=" "${backend_env_path}"; then
    sudo sed -i "s|^URL_API_OFICIAL=.*|URL_API_OFICIAL=https://${subdominio_oficial}|" "${backend_env_path}"
  else
    echo "URL_API_OFICIAL=https://${subdominio_oficial}" | sudo tee -a "${backend_env_path}" >/dev/null
  fi
  
  # Restart backend
  sudo su - deploy <<'RESTART_BACKEND'
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:$PATH
  fi
  pm2 reload all
RESTART_BACKEND

  printf "${GREEN} >> Backend vinculado à API Oficial!${WHITE}\n"
  sleep 2
}

# ═══ INSTALAÇÃO DA API OFICIAL INTEGRADA (chamada durante instalacao_base) ═══
instalar_api_oficial_integrada() {
  banner
  printf "${CYAN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  printf "${CYAN}   📡 INSTALAÇÃO DA API OFICIAL (WhatsApp Business)${WHITE}\n"
  printf "${CYAN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  echo
  printf "${WHITE} >> Deseja instalar a API Oficial agora? (S/N): ${WHITE}\n"
  echo
  read -p "> " instalar_api_agora
  instalar_api_agora=$(echo "${instalar_api_agora}" | tr '[:lower:]' '[:upper:]')
  
  if [ "${instalar_api_agora}" != "S" ]; then
    printf "${YELLOW} >> API Oficial não será instalada agora. Você pode instalá-la depois pelo menu.${WHITE}\n"
    sleep 2
    return 0
  fi
  
  reparo_nginx_apioficial
  solicitar_dados_apioficial
  verificar_dns_apioficial || return 0
  
  if [ "${proxy}" == "nginx" ]; then
    configurar_nginx_apioficial || return 1
  fi
  
  criar_banco_apioficial || return 1
  configurar_env_apioficial || return 1
  build_apioficial || return 1
  vincular_apioficial_backend
  
  sudo systemctl restart nginx 2>/dev/null
  
  printf "${GREEN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  printf "${GREEN}   ✅ API Oficial instalada com sucesso!${WHITE}\n"
  printf "${GREEN}   🌐 URL: https://${subdominio_oficial}${WHITE}\n"
  printf "${GREEN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  sleep 3
}

# ═══ INSTALAÇÃO SEPARADA DA API OFICIAL (menu opção 4) ═══
instalar_api_oficial_separado() {
  banner
  printf "${WHITE} >> Instalando API Oficial (modo separado)...\n"
  echo
  
  carregar_variaveis
  detectar_instalacao || return 1
  
  local backend_env_path="/home/deploy/${empresa}/backend/.env"
  
  # Carregar subdomínio do backend se não existir
  if [ -z "${subdominio_backend}" ]; then
    if [ -f "${backend_env_path}" ]; then
      local subdominio_backend_full=$(grep "^BACKEND_URL=" "${backend_env_path}" 2>/dev/null | cut -d '=' -f2- | tr -d '\r')
      subdominio_backend=$(echo "${subdominio_backend_full}" | sed 's|https://||g' | sed 's|http://||g' | cut -d'/' -f1)
    fi
  fi
  
  # Carregar email e senha do backend se não existir
  if [ -z "${email_deploy}" ] || [ -z "${senha_deploy}" ]; then
    if [ -f "${backend_env_path}" ]; then
      [ -z "${senha_deploy}" ] && senha_deploy=$(grep "^DB_PASS=" "${backend_env_path}" | cut -d '=' -f2- | tr -d '\r')
      [ -z "${email_deploy}" ] && email_deploy=$(grep "^USER_EMAIL=" "${backend_env_path}" | cut -d '=' -f2- | tr -d '\r')
      
      if [ -z "${email_deploy}" ]; then
        printf "${WHITE} >> Digite seu email para o certificado SSL: \n"
        read -p "> " email_deploy
      fi
    else
      printf "${RED} >> ERRO: .env do backend não encontrado em ${backend_env_path}${WHITE}\n"
      sleep 3
      return 1
    fi
  fi
  
  reparo_nginx_apioficial
  solicitar_dados_apioficial
  verificar_dns_apioficial || return 0
  configurar_nginx_apioficial || return 1
  criar_banco_apioficial || return 1
  configurar_env_apioficial || return 1
  build_apioficial || return 1
  vincular_apioficial_backend
  
  sudo systemctl restart nginx 2>/dev/null
  
  banner
  printf "${GREEN} >> Instalação da API Oficial concluída! https://${subdominio_oficial}${WHITE}\n"
  echo
  printf "${GREEN} >> Pressione Enter para voltar ao menu...${WHITE}\n"
  read -r
}

################################################################
#                         INSTALAÇÃO                           #
################################################################

# Questões base
questoes_dns_base() {
  banner
  printf "${WHITE} >> Insira a URL do Backend: \n"
  echo
  read -p "> " subdominio_backend
  echo
  banner
  printf "${WHITE} >> Insira a URL do Frontend: \n"
  echo
  read -p "> " subdominio_frontend
  echo
}

# Valida se o domínio ou subdomínio está apontado para o IP da VPS
verificar_dns_base() {
  banner
  printf "${WHITE} >> Verificando o DNS dos dominios/subdominios...\n"
  echo
  sleep 2
  sudo apt-get install dnsutils -y >/dev/null 2>&1
  subdominios_incorretos=""

  verificar_dns() {
    local domain=$1
    local resolved_ip
    local cname_target

    cname_target=$(dig +short CNAME ${domain})

    if [ -n "${cname_target}" ]; then
      resolved_ip=$(dig +short ${cname_target})
    else
      resolved_ip=$(dig +short ${domain})
    fi

    if [ "${resolved_ip}" != "${ip_atual}" ]; then
      echo "O domínio ${domain} (resolvido para ${resolved_ip}) não está apontando para o IP público atual (${ip_atual})."
      subdominios_incorretos+="${domain} "
      sleep 2
    fi
  }
  verificar_dns ${subdominio_backend}
  verificar_dns ${subdominio_frontend}
  if [ -n "${subdominios_incorretos}" ]; then
    echo
    printf "${YELLOW} >> ATENÇÃO: Os seguintes subdomínios não estão apontando para o IP público atual (${ip_atual}):${WHITE}\n"
    printf "${YELLOW} >> ${subdominios_incorretos}${WHITE}\n"
    echo
    printf "${WHITE} >> Deseja continuar a instalação mesmo assim? (S/N): ${WHITE}\n"
    echo
    read -p "> " continuar_dns
    continuar_dns=$(echo "${continuar_dns}" | tr '[:lower:]' '[:upper:]')
    echo
    if [ "${continuar_dns}" != "S" ]; then
      printf "${GREEN} >> Retornando ao menu principal...${WHITE}\n"
      sleep 2
      menu
      return 0
    else
      printf "${YELLOW} >> Continuando a instalação mesmo com DNS não configurado corretamente...${WHITE}\n"
      sleep 2
    fi
  else
    echo "Todos os subdomínios estão apontando corretamente para o IP público da VPS."
    sleep 2
  fi
  echo
  printf "${WHITE} >> Continuando...\n"
  sleep 2
  echo
}

questoes_variaveis_base() {
  banner
  printf "${WHITE} >> Digite o seu melhor email: \n"
  echo
  read -p "> " email_deploy
  echo
  banner
  printf "${WHITE} >> Digite o nome da sua empresa (Letras minusculas e sem espaço): \n"
  echo
  read -p "> " empresa
  echo
  banner
  printf "${WHITE} >> Insira a senha para o usuario Deploy, Redis e Banco de Dados ${RED}IMPORTANTE${WHITE}: Não utilizar caracteres especiais\n"
  echo
  read -p "> " senha_deploy
  echo
  banner
  printf "${WHITE} >> Insira a senha para o MASTER: \n"
  echo
  read -p "> " senha_master
  echo
  banner
  printf "${WHITE} >> Insira o Titulo da Aplicação (Permitido Espaço): \n"
  echo
  read -p "> " nome_titulo
  echo
  banner
  printf "${WHITE} >> Digite o numero de telefone para suporte: \n"
  echo
  read -p "> " numero_suporte
  echo
  banner
  printf "${WHITE} >> Digite o FACEBOOK_APP_ID caso tenha: \n"
  echo
  read -p "> " facebook_app_id
  echo
  banner
  printf "${WHITE} >> Digite o FACEBOOK_APP_SECRET caso tenha: \n"
  echo
  read -p "> " facebook_app_secret
  echo
}

# Define proxy usado (Nginx automatico)
define_proxy_base() {
  printf "${GREEN} >> Nginx selecionado automaticamente como proxy reverso.${WHITE}\n"
  proxy="nginx"
  export proxy
  sleep 1
}

# Define portas backend e frontend
define_portas_base() {
  banner
  default_backend_port=$(sugerir_porta_livre 8080)
  default_frontend_port=$(sugerir_porta_livre 3000)
  printf "${CYAN} >> Portas livres detectadas automaticamente:${WHITE}\n"
  printf "${WHITE}    Backend:  ${CYAN}${default_backend_port}${WHITE}\n"
  printf "${WHITE}    Frontend: ${CYAN}${default_frontend_port}${WHITE}\n"
  echo
  printf "${WHITE} >> Usar essas portas sugeridas? (S/N): ${WHITE}\n"
  echo
  read -p "> " use_default_ports
  use_default_ports=$(echo "${use_default_ports}" | tr '[:upper:]' '[:lower:]')
  echo

  if [ "${use_default_ports}" = "s" ]; then
    backend_port=${default_backend_port}
    frontend_port=${default_frontend_port}
  else
    while true; do
      printf "${WHITE} >> Qual porta deseja para o Backend? (Enter para ${CYAN}${default_backend_port}${WHITE}) ${WHITE}\n"
      echo
      read -p "> " backend_port
      [ -z "${backend_port}" ] && backend_port="${default_backend_port}"
      echo
      if ! porta_em_uso "${backend_port}"; then
        break
      else
        printf "${RED} >> A porta ${backend_port} já está em uso. Por favor, escolha outra.${WHITE}\n"
        echo
      fi
    done

    while true; do
      printf "${WHITE} >> Qual porta deseja para o Frontend? (Enter para ${CYAN}${default_frontend_port}${WHITE}) ${WHITE}\n"
      echo
      read -p "> " frontend_port
      [ -z "${frontend_port}" ] && frontend_port="${default_frontend_port}"
      echo
      if ! porta_em_uso "${frontend_port}"; then
        break
      else
        printf "${RED} >> A porta ${frontend_port} já está em uso. Por favor, escolha outra.${WHITE}\n"
        echo
      fi
    done
  fi

  sleep 2
}

# Informa os dados de instalação
dados_instalacao_base() {
  printf "   ${WHITE}Anote os dados abaixo\n\n"
  printf "   ${WHITE}Subdominio Backend: ---->> ${YELLOW}${subdominio_backend}\n"
  printf "   ${WHITE}Subdominio Frontend: --->> ${YELLOW}${subdominio_frontend}\n"
  printf "   ${WHITE}Seu Email: ------------->> ${YELLOW}${email_deploy}\n"
  printf "   ${WHITE}Nome da Empresa: ------->> ${YELLOW}${empresa}\n"
  printf "   ${WHITE}Senha Deploy: ---------->> ${YELLOW}${senha_deploy}\n"
  printf "   ${WHITE}Senha Master: ---------->> ${YELLOW}${senha_master}\n"
  printf "   ${WHITE}Titulo da Aplicação: --->> ${YELLOW}${nome_titulo}\n"
  printf "   ${WHITE}Numero de Suporte: ----->> ${YELLOW}${numero_suporte}\n"
  printf "   ${WHITE}FACEBOOK_APP_ID: ------->> ${YELLOW}${facebook_app_id}\n"
  printf "   ${WHITE}FACEBOOK_APP_SECRET: --->> ${YELLOW}${facebook_app_secret}\n"
  printf "   ${WHITE}Origem dos Arquivos: --->> ${YELLOW}Pasta local (sem Git)${WHITE}\n"
  printf "   ${WHITE}Proxy Usado: ----------->> ${YELLOW}${proxy}\n"
  printf "   ${WHITE}Porta Backend: --------->> ${YELLOW}${backend_port}\n"
  printf "   ${WHITE}Porta Frontend: -------->> ${YELLOW}${frontend_port}\n"
}

# Confirma os dados de instalação
confirma_dados_instalacao_base() {
  printf " >> Confira abaixo os dados dessa instalação! \n"
  echo
  dados_instalacao_base
  echo
  printf "${WHITE} >> Os dados estão corretos? ${GREEN}S/${RED}N:${WHITE} \n"
  echo
  read -p "> " confirmacao
  echo
  confirmacao=$(echo "${confirmacao}" | tr '[:lower:]' '[:upper:]')
  if [ "${confirmacao}" == "S" ]; then
    printf "${GREEN} >> Continuando a Instalação... ${WHITE} \n"
    echo
  else
    printf "${GREEN} >> Retornando ao Menu Principal... ${WHITE} \n"
    echo
    sleep 2
    menu
  fi
}

# Atualiza sistema operacional
atualiza_vps_base() {
  UPDATE_FILE="$(pwd)/update.x"
  {
    ubuntu_preparar
    sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt update -y && sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" && sudo DEBIAN_FRONTEND=noninteractive apt-get install build-essential -y && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y apparmor-utils
    touch "${UPDATE_FILE}"
    sleep 2
  } || trata_erro "atualiza_vps_base"
}

# Cria usuário deploy
cria_deploy_base() {
  banner
  printf "${WHITE} >> Agora, vamos criar o usuário para deploy...\n"
  echo
  {
    sudo useradd -m -p $(openssl passwd -1 ${senha_deploy}) -s /bin/bash -G sudo deploy
    sudo usermod -aG sudo deploy
    sleep 2
  } || trata_erro "cria_deploy_base"
}

# Configura timezone
config_timezone_base() {
  banner
  printf "${WHITE} >> Configurando Timezone...\n"
  echo
  {
    sudo su - root <<EOF
  timedatectl set-timezone America/Sao_Paulo
EOF
    sleep 2
  } || trata_erro "config_timezone_base"
}

# ------------------------------------------------------------
# PORTAS DO ÁUDIO DO WHATSAPP PLUS (UDP 50000-50999)
#  O áudio das ligações do WhatsApp Plus vai do navegador para o servidor
#  por WebRTC nessa faixa (wacalls-chat/cmd/server/bridgeportas.go). Se o
#  firewall bloquear, a ligação é atendida mas fica MUDA nos dois sentidos.
#  Roda em TODA atualização (opção 2) e na atualização só do WhatsApp Plus.
#  Funciona com ufw ou com iptables puro. Nunca derruba a atualização.
# ------------------------------------------------------------
liberar_portas_audio_wacalls() {
  local _min="${WACALLS_RTC_PORTA_MIN:-50000}" _max="${WACALLS_RTC_PORTA_MAX:-50999}"
  if [ -f /etc/equipechat-sem-firewall ]; then
    printf "${YELLOW} >> Áudio do WhatsApp Plus: o instalador não mexe no firewall (/etc/equipechat-sem-firewall). Libere UDP ${_min}-${_max} manualmente.${WHITE}\n"
    return 0
  fi
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi "Status: active"; then
    ufw allow ${_min}:${_max}/udp >/dev/null 2>&1 \
      && printf "${GREEN} >> Áudio do WhatsApp Plus: UDP ${_min}-${_max} liberado no firewall (ufw).${WHITE}\n" \
      || printf "${YELLOW} >> Não consegui liberar UDP ${_min}-${_max} no ufw. Rode: ufw allow ${_min}:${_max}/udp${WHITE}\n"
  elif command -v ufw >/dev/null 2>&1; then
    # ufw desligado: deixa a regra pronta para quando for ligado.
    ufw allow ${_min}:${_max}/udp >/dev/null 2>&1
    printf "${GREEN} >> Áudio do WhatsApp Plus: regra UDP ${_min}-${_max} criada (ufw está desligado).${WHITE}\n"
  elif command -v iptables >/dev/null 2>&1; then
    if ! iptables -C INPUT -p udp --dport ${_min}:${_max} -j ACCEPT >/dev/null 2>&1; then
      iptables -I INPUT -p udp --dport ${_min}:${_max} -j ACCEPT >/dev/null 2>&1
      command -v netfilter-persistent >/dev/null 2>&1 && netfilter-persistent save >/dev/null 2>&1
    fi
    printf "${GREEN} >> Áudio do WhatsApp Plus: UDP ${_min}-${_max} liberado (iptables).${WHITE}\n"
  fi
  printf "${WHITE} >> Se a VPS tiver firewall no painel da hospedagem, libere lá também UDP ${_min}-${_max}.${WHITE}\n"
  return 0
}

# Configura firewall
config_firewall_base() {
  banner
  printf "${WHITE} >> Configurando o firewall Portas 80 e 443...\n"
  echo
  {
    if [ "${ARCH}" = "x86_64" ]; then
      sudo su - root <<EOF >/dev/null 2>&1
  ufw allow 80/tcp && ufw allow 22/tcp && ufw allow 443/tcp
  ufw allow 50000:50999/udp
EOF
      sleep 2

    elif [ "${ARCH}" = "aarch64" ]; then
      sudo su - root <<EOF >/dev/null 2>&1
  sudo iptables -F &&
  sudo iptables -A INPUT -i lo -j ACCEPT &&
  sudo iptables -A OUTPUT -o lo -j ACCEPT &&
  sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT &&
  sudo iptables -A INPUT -p udp --dport 80 -j ACCEPT &&
  sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT &&
  sudo iptables -A INPUT -p udp --dport 50000:50999 -j ACCEPT &&
  sudo iptables -A INPUT -p udp --dport 443 -j ACCEPT &&
  sudo service netfilter-persistent save
EOF
      sleep 2

    else
      echo "Arquitetura não suportada."
    fi
  } || trata_erro "config_firewall_base"
}

# Instala dependência puppeteer
instala_puppeteer_base() {
  banner
  printf "${WHITE} >> Instalando puppeteer dependencies...\n"
  echo
  {
    sudo apt-get update -y >/dev/null 2>&1 || true
    # Só os nomes que existem nesta versão do Ubuntu (ver escolher_pacotes).
    local pacotes
    pacotes="$(escolher_pacotes \
      libaom-dev libass-dev libfreetype6-dev libfribidi-dev \
      libharfbuzz-dev libgme-dev libgsm1-dev libmp3lame-dev \
      libopencore-amrnb-dev libopencore-amrwb-dev libopenmpt-dev \
      libopus-dev libfdk-aac-dev librubberband-dev libspeex-dev \
      libssh-dev libtheora-dev libvidstab-dev libvo-amrwbenc-dev \
      libvorbis-dev libvpx-dev libwebp-dev libx264-dev libx265-dev \
      libxvidcore-dev libzmq3-dev libsdl2-dev build-essential \
      yasm cmake libtool libc6 libc6-dev unzip wget pkg-config texinfo zlib1g-dev \
      libxshmfence-dev "libgcc-s1|libgcc1" libgbm-dev fontconfig locales gconf-service libasound2 \
      libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
      libgconf-2-4 "libgdk-pixbuf-2.0-0|libgdk-pixbuf2.0-0" libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
      libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
      libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
      libxss1 libxtst6 ca-certificates fonts-liberation "libayatana-appindicator3-1|libappindicator1" libnss3 \
      lsb-release xdg-utils \
      "libsrt-openssl-dev|libsrt-dev")"
    printf "${WHITE} >> Ubuntu ${UBUNTU_VERSION}: instalando $(echo ${pacotes} | wc -w) pacotes.${WHITE}\n"
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ${pacotes}
    sleep 2
  } || trata_erro "instala_puppeteer_base"
}

# Instala FFMPEG (usa pacote oficial da distribuição para garantir libs compatíveis)
instala_ffmpeg_base() {
  banner
  printf "${WHITE} >> Instalando FFMPEG (pacote oficial da distribuição)...\n"
  echo

  # Se já tem ffmpeg funcional (sem libs faltando), pula
  if command -v ffmpeg >/dev/null 2>&1 && ! ldd "$(command -v ffmpeg)" 2>/dev/null | grep -q "not found"; then
    printf " >> FFMPEG já instalado e funcional. Continuando...\n"
    touch "${FFMPEG}" 2>/dev/null || true
    echo
    return 0
  fi

  sleep 2

  {
    # Remove qualquer ffmpeg "quebrado" (binário estático sem libs, ex.: builds BtbN antigos)
    if command -v ffmpeg >/dev/null 2>&1 && ldd "$(command -v ffmpeg)" 2>/dev/null | grep -q "not found"; then
      printf "${YELLOW} >> Removendo ffmpeg quebrado (bibliotecas ausentes)...${WHITE}\n"
      FFMPEG_BIN="$(command -v ffmpeg)"
      FFPROBE_BIN="$(command -v ffprobe 2>/dev/null)"
      FFPLAY_BIN="$(command -v ffplay 2>/dev/null)"
      sudo rm -f "${FFMPEG_BIN}" "${FFPROBE_BIN}" "${FFPLAY_BIN}" 2>/dev/null || true
      sudo apt remove --purge ffmpeg -y 2>/dev/null || true
    fi

    sudo apt update -y
    sudo apt install -y ffmpeg

    # Validação final
    if ! command -v ffmpeg >/dev/null 2>&1; then
      printf "${RED} >> Falha ao instalar ffmpeg via apt.${WHITE}\n"
      return 1
    fi
    if ldd "$(command -v ffmpeg)" 2>/dev/null | grep -q "not found"; then
      printf "${RED} >> ffmpeg instalado mas com bibliotecas faltando.${WHITE}\n"
      return 1
    fi

    touch "${FFMPEG}"
    printf "${GREEN} >> FFMPEG instalado com sucesso ($(ffmpeg -version 2>/dev/null | head -1)).${WHITE}\n"
  } || trata_erro "instala_ffmpeg_base"
}

# Instala Postgres
instala_postgres_base() {
  banner
  printf "${WHITE} >> Instalando postgres...\n"
  echo
  {
    # Repositório oficial do PostgreSQL. A chave vai para /etc/apt/keyrings
    # (o apt-key saiu do Ubuntu 25.04 em diante). Se o repositório ainda não
    # tiver a versão do Ubuntu (lançamento muito novo), usa a do 24.04 (noble).
    local pg_codename="${UBUNTU_CODENAME}"
    if ! curl -fsI "https://apt.postgresql.org/pub/repos/apt/dists/${pg_codename}-pgdg/Release" >/dev/null 2>&1; then
      printf "${YELLOW} >> Repositório do PostgreSQL ainda sem '${pg_codename}': usando o do Ubuntu 24.04 (noble).${WHITE}\n"
      pg_codename="noble"
    fi
    sudo apt-get install -y gnupg curl ca-certificates
    sudo install -d -m 0755 /etc/apt/keyrings
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor --yes -o /etc/apt/keyrings/postgresql.gpg
    sudo chmod a+r /etc/apt/keyrings/postgresql.gpg
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt ${pg_codename}-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
    sudo apt-get update -y && sudo DEBIAN_FRONTEND=noninteractive apt-get -y install postgresql-17
    sleep 2
  } || trata_erro "instala_postgres_base"
}

# Instala NodeJS
instala_node_base() {
  banner
  printf "${WHITE} >> Instalando nodejs...\n"
  echo
  {
    sudo su - root <<'NODEINSTALL'
    # Remove repositórios antigos do NodeSource
    rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null
    rm -f /etc/apt/sources.list.d/nodesource*.list 2>/dev/null
    
    printf " >> Tentando instalar Node.js 22.x LTS...\n"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>&1 | grep -v "does not have a Release file" || {
      printf " >> Node.js 22.x não disponível. Tentando Node.js 20.x...\n"
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | grep -v "does not have a Release file" || {
        printf " >> Erro ao configurar repositório. Tentando método alternativo...\n"
        curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh 2>/dev/null || \
        curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/nodesource_setup.sh
        bash /tmp/nodesource_setup.sh 2>&1 | grep -v "does not have a Release file" || {
          printf " >> Falha ao configurar repositório NodeSource.\n"
          exit 1
        }
      }
    }
    
    printf " >> Atualizando lista de pacotes...\n"
    apt-get update -y 2>&1 | grep -v "does not have a Release file" | grep -v "Key is stored in legacy" || true
    
    printf " >> Instalando Node.js...\n"
    apt-get install -y nodejs || {
      printf " >> Erro ao instalar Node.js via apt.\n"
      exit 1
    }
    
    if ! command -v node &> /dev/null; then
      printf " >> Erro: Node.js não foi encontrado no PATH após instalação.\n"
      find /usr -name node -type f 2>/dev/null | head -5
      exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
      printf " >> Erro: npm não foi encontrado no PATH após instalação.\n"
      find /usr -name npm -type f 2>/dev/null | head -5
      exit 1
    fi
    
    printf " >> Node.js instalado: "
    node --version
    printf " >> npm instalado: "
    npm --version
    
    printf " >> Instalando gerenciador de versões 'n'...\n"
    npm install -g n || {
      printf " >> Aviso: Não foi possível instalar 'n'. Continuando com versão padrão.\n"
    }
    
    if command -v n &> /dev/null; then
      printf " >> Configurando Node.js versão 20.19.4...\n"
      n 20.19.4 || {
        printf " >> Aviso: Não foi possível instalar versão específica. Usando versão padrão.\n"
      }
      
      if [ -f /usr/local/n/versions/node/20.19.4/bin/node ]; then
        ln -sf /usr/local/n/versions/node/20.19.4/bin/node /usr/bin/node
        ln -sf /usr/local/n/versions/node/20.19.4/bin/npm /usr/bin/npm
        ln -sf /usr/local/n/versions/node/20.19.4/bin/npx /usr/bin/npx 2>/dev/null || true
      fi
    fi
    
    NODE_BIN=$(which node 2>/dev/null || find /usr -name node -type f 2>/dev/null | head -1)
    NPM_BIN=$(which npm 2>/dev/null || find /usr -name npm -type f 2>/dev/null | head -1)
    
    if [ -n "$NODE_BIN" ] && [ "$NODE_BIN" != "/usr/bin/node" ]; then
      ln -sf "$NODE_BIN" /usr/bin/node
    fi
    
    if [ -n "$NPM_BIN" ] && [ "$NPM_BIN" != "/usr/bin/npm" ]; then
      ln -sf "$NPM_BIN" /usr/bin/npm
    fi
    
    if ! grep -q "/usr/local/n/versions/node" /etc/profile 2>/dev/null; then
      echo 'export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:$PATH' >> /etc/profile
    fi
    
    for user_home in /root /home/deploy; do
      if [ -d "$user_home" ]; then
        if ! grep -q "/usr/local/n/versions/node" "${user_home}/.bashrc" 2>/dev/null; then
          echo 'export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:$PATH' >> "${user_home}/.bashrc"
        fi
      fi
    done
    
    printf " >> Verificando instalação final...\n"
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:$PATH
    node --version || exit 1
    npm --version || exit 1
NODEINSTALL
    
    sleep 2
  } || trata_erro "instala_node_base"
}

# Instala Redis
instala_redis_base() {
  {
    # Algumas versões novas do Ubuntu podem trazer o Valkey (substituto
    # compatível do Redis) em vez do redis-server. O sistema funciona com os
    # dois: mesma porta 6379 e mesmo protocolo.
    local redis_pacote="redis-server" redis_conf="/etc/redis/redis.conf" redis_servico="redis-server"
    if ! pacote_existe redis-server && pacote_existe valkey-server; then
      redis_pacote="valkey-server"; redis_conf="/etc/valkey/valkey.conf"; redis_servico="valkey-server"
      printf "${YELLOW} >> Ubuntu ${UBUNTU_VERSION} sem redis-server: instalando o Valkey (compatível).${WHITE}\n"
    fi
    sudo su - root <<EOF
  DEBIAN_FRONTEND=noninteractive apt-get install -y ${redis_pacote}
  systemctl enable ${redis_servico}.service
  if grep -qE '^#? *requirepass ' ${redis_conf}; then
    sed -i -E 's/^#? *requirepass .*/requirepass ${senha_deploy}/' ${redis_conf}
  else
    echo 'requirepass ${senha_deploy}' >> ${redis_conf}
  fi
  sed -i 's/^appendonly no/appendonly yes/g' ${redis_conf}
  systemctl restart ${redis_servico}.service
EOF
    sleep 2
  } || trata_erro "instala_redis_base"
}

# Instala PM2
instala_pm2_base() {
  banner
  printf "${WHITE} >> Instalando pm2...\n"
  echo
  
  {
    sudo su - root <<'PM2INSTALL'
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
    
    NODE_BIN=""
    if command -v node &> /dev/null; then
      NODE_BIN=$(which node)
    elif [ -f /usr/local/n/versions/node/20.19.4/bin/node ]; then
      NODE_BIN="/usr/local/n/versions/node/20.19.4/bin/node"
      export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:$PATH
    elif [ -f /usr/bin/node ]; then
      NODE_BIN="/usr/bin/node"
    else
      printf " >> ERRO: Node.js não está instalado.\n"
      find /usr -name node -type f 2>/dev/null | head -5
      exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
      printf " >> ERRO: npm não está instalado.\n"
      exit 1
    fi
    
    node --version || exit 1
    npm --version || exit 1
    
    npm install -g pm2 || {
      printf " >> Erro ao instalar PM2.\n"
      exit 1
    }
    
    if ! command -v pm2 &> /dev/null; then
      PM2_BIN=$(find /usr -name pm2 -type f 2>/dev/null | head -1)
      if [ -n "$PM2_BIN" ]; then
        ln -sf "$PM2_BIN" /usr/bin/pm2 2>/dev/null || true
      else
        printf " >> ERRO: PM2 não foi instalado corretamente\n"
        exit 1
      fi
    fi
    
    pm2 --version || exit 1
    
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:$PATH
    
    if id "deploy" &>/dev/null; then
      pm2 startup ubuntu -u deploy --hp /home/deploy || {
        printf " >> Aviso: Não foi possível configurar startup automático.\n"
      }
    fi
PM2INSTALL
    
    sleep 2
  } || trata_erro "instala_pm2_base"
}

# Instala Nginx e dependências
instala_nginx_base() {
  banner
  printf "${WHITE} >> Instalando Nginx...\n"
  echo
  {
    sudo su - root <<EOF
    apt install -y nginx
    rm -f /etc/nginx/sites-enabled/default
EOF

    sleep 2

    sudo su - root <<EOF
echo 'client_max_body_size 100M;' > /etc/nginx/conf.d/${empresa}.conf
EOF

    sleep 2

    sudo su - root <<EOF
  service nginx restart
EOF

    sleep 2

    sudo su - root <<EOF
  apt install -y snapd
  snap install core
  snap refresh core
EOF

    sleep 2

    sudo su - root <<EOF
  apt-get remove certbot -y 2>/dev/null || true
  snap install --classic certbot
  ln -sf /snap/bin/certbot /usr/bin/certbot
EOF

    sleep 2
  } || trata_erro "instala_nginx_base"
}

# Instala Traefik
instala_traefik_base() {
  useradd --system --shell /bin/false --user-group --no-create-home traefik 2>/dev/null || true
  cd /tmp
  mkdir -p traefik
  cd traefik/
  if [ "${ARCH}" = "x86_64" ]; then
    traefik_arch="amd64"
  elif [ "${ARCH}" = "aarch64" ]; then
    traefik_arch="arm64"
  else
    echo "Arquitetura não suportada: ${ARCH}"
    exit 1
  fi
  traefik_url="https://github.com/traefik/traefik/releases/download/v2.10.5/traefik_v2.10.5_linux_${traefik_arch}.tar.gz"
  curl --remote-name --location "${traefik_url}"
  tar -zxf traefik_v2.10.5_linux_${traefik_arch}.tar.gz
  cp traefik /usr/local/bin/traefik
  chmod a+x /usr/local/bin/traefik
  cd ..
  rm -rf traefik
  mkdir --parents /etc/traefik
  mkdir --parents /etc/traefik/conf.d

  sleep 2

  sudo su - root <<EOF
cat > /etc/traefik/traefik.toml << 'END'
[global]
  checkNewVersion = "false"
  sendAnonymousUsage = "true"

[entryPoints]
  [entryPoints.websecure]
    address = ":443"
  [entryPoints.web]
    address = ":80"

[certificatesResolvers.letsencryptresolver.acme]
  email = "${email_deploy}"
  storage = "/etc/traefik/acme.json"
  [certificatesResolvers.letsencryptresolver.acme.httpChallenge]
    entryPoint = "web"

[log]
  level = "INFO"
  format = "json"
  filePath = "/var/log/traefik/traefik.log"

[accessLog]
  filePath = "/var/log/traefik/access.log"
  format = "common"

[api]
  dashboard = false
  insecure = false

[providers]
  [providers.file]
    directory = "/etc/traefik/conf.d/"
    watch = "true"
END
EOF

  sleep 2

  sudo su - root <<EOF
cat > /etc/traefik/traefik.service << 'END'
[Unit]
Description=Traefik - Proxy
Documentation=https://docs.traefik.io
After=network-online.target
Wants=network-online.target systemd-networkd-wait-online.service
AssertFileIsExecutable=/usr/local/bin/traefik
AssertPathExists=/etc/traefik/traefik.toml

[Service]
User=traefik
AmbientCapabilities=CAP_NET_BIND_SERVICE
Type=notify
ExecStart=/usr/local/bin/traefik --configFile=/etc/traefik/traefik.toml
Restart=always
WatchdogSec=2s
LogsDirectory=traefik

[Install]
WantedBy=multi-user.target
END
EOF

  sleep 2

  sudo su - root <<EOF
cat > /etc/traefik/conf.d/tls.toml << 'END'
[tls.options]
  [tls.options.default]
    sniStrict = true
    minVersion = "VersionTLS12"
END
EOF
  sleep 2

  cp /etc/traefik/traefik.service /etc/systemd/system/
  chown -R traefik:traefik /etc/traefik/
  rm -rf /etc/traefik/traefik.service
  systemctl daemon-reload
  sleep 2
  systemctl enable --now traefik.service
  sleep 2
}

# Cria banco de dados
cria_banco_base() {
  banner
  printf "${WHITE} >> Criando Banco Postgres...\n"
  echo
  {
    sudo su - postgres <<EOF
    createdb ${empresa};
    psql
    CREATE USER ${empresa} SUPERUSER INHERIT CREATEDB CREATEROLE;
    ALTER USER ${empresa} PASSWORD '${senha_deploy}';
    \q
    exit
EOF

    sleep 2
  } || trata_erro "cria_banco_base"
}

# Copia código da pasta local do instalador para /home/deploy
copia_codigo_local() {
  banner
  printf "${WHITE} >> Copiando arquivos do ${nome_titulo} para /home/deploy/${empresa}...\n"
  echo

  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  dest_dir="/home/deploy/${empresa}"

  {
    # Verificar se as pastas backend e frontend existem no diretório do instalador
    if [ ! -d "${INSTALADOR_DIR}/backend" ]; then
      printf "${RED} >> ERRO: Pasta 'backend' não encontrada em ${INSTALADOR_DIR}${WHITE}\n"
      printf "${YELLOW} >> Certifique-se de que as pastas backend, frontend, api_oficial e api_transcricao${WHITE}\n"
      printf "${YELLOW} >> estão no mesmo diretório do instalador.${WHITE}\n"
      exit 1
    fi

    if [ ! -d "${INSTALADOR_DIR}/frontend" ]; then
      printf "${RED} >> ERRO: Pasta 'frontend' não encontrada em ${INSTALADOR_DIR}${WHITE}\n"
      printf "${YELLOW} >> Certifique-se de que as pastas backend, frontend, api_oficial e api_transcricao${WHITE}\n"
      printf "${YELLOW} >> estão no mesmo diretório do instalador.${WHITE}\n"
      exit 1
    fi

    # Criar diretório destino
    mkdir -p "${dest_dir}"

    # Copiar backend
    printf "${WHITE} >> Copiando backend...\n"
    cp -r "${INSTALADOR_DIR}/backend" "${dest_dir}/backend"
    printf "${GREEN} >> ✅ Backend copiado${WHITE}\n"

    # Copiar frontend
    printf "${WHITE} >> Copiando frontend...\n"
    cp -r "${INSTALADOR_DIR}/frontend" "${dest_dir}/frontend"
    printf "${GREEN} >> ✅ Frontend copiado${WHITE}\n"

    # Copiar api_oficial (se existir)
    if [ -d "${INSTALADOR_DIR}/api_oficial" ]; then
      printf "${WHITE} >> Copiando API Oficial...\n"
      cp -r "${INSTALADOR_DIR}/api_oficial" "${dest_dir}/api_oficial"
      printf "${GREEN} >> ✅ API Oficial copiada${WHITE}\n"
    else
      printf "${YELLOW} >> API Oficial não encontrada no diretório. Pulando...${WHITE}\n"
    fi

    # Copiar api_transcricao (se existir)
    if [ -d "${INSTALADOR_DIR}/api_transcricao" ]; then
      printf "${WHITE} >> Copiando API Transcrição...\n"
      cp -r "${INSTALADOR_DIR}/api_transcricao" "${dest_dir}/api_transcricao"
      printf "${GREEN} >> ✅ API Transcrição copiada${WHITE}\n"
    else
      printf "${YELLOW} >> API Transcrição não encontrada no diretório. Pulando...${WHITE}\n"
    fi

    # Ajustar permissões para o usuário deploy
    mkdir -p "${dest_dir}/backend/public/"
    chown deploy:deploy -R "${dest_dir}/"
    chmod 775 -R "${dest_dir}/backend/public/"
    chmod 755 -R "${dest_dir}/frontend/"
    chmod 755 -R "${dest_dir}/backend/"

    # Limpar cache npm com permissões de root que podem causar EACCES
    if [ -d "/home/deploy/.npm" ]; then
      chown deploy:deploy -R /home/deploy/.npm
    fi
    if [ -d "/home/deploy/.cache" ]; then
      chown deploy:deploy -R /home/deploy/.cache
    fi

    # Remover node_modules copiados com permissões de root (serão reinstalados)
    if [ -d "${dest_dir}/frontend/node_modules" ]; then
      rm -rf "${dest_dir}/frontend/node_modules"
      printf "${YELLOW} >> node_modules do frontend removido (será reinstalado)${WHITE}\n"
    fi
    if [ -d "${dest_dir}/backend/node_modules" ]; then
      rm -rf "${dest_dir}/backend/node_modules"
      printf "${YELLOW} >> node_modules do backend removido (será reinstalado)${WHITE}\n"
    fi

    printf "${GREEN} >> Todos os arquivos copiados com sucesso!${WHITE}\n"
    sleep 2
  } || trata_erro "copia_codigo_local"
}

# Instala e configura backend
instala_backend_base() {
  banner
  printf "${WHITE} >> Configurando variáveis de ambiente do ${BLUE}backend${WHITE}...\n"
  echo
  
  if [ -z "${empresa}" ]; then
    carregar_variaveis
    if [ -z "${empresa}" ]; then
      printf "${RED} >> ERRO: Não foi possível carregar a variável 'empresa'. Abortando.\n${WHITE}"
      exit 1
    fi
  fi
  
  if [ ! -d "/home/deploy/${empresa}" ]; then
    printf "${RED} >> ERRO: Diretório /home/deploy/${empresa} não existe!\n${WHITE}"
    exit 1
  fi
  
  {
    sleep 2
    subdominio_backend=$(echo "${subdominio_backend/https:\/\//}")
    subdominio_backend=${subdominio_backend%%/*}
    subdominio_backend=https://${subdominio_backend}
    subdominio_frontend=$(echo "${subdominio_frontend/https:\/\//}")
    subdominio_frontend=${subdominio_frontend%%/*}
    subdominio_frontend=https://${subdominio_frontend}
    sudo su - deploy <<EOF
  cat <<[-]EOF > /home/deploy/${empresa}/backend/.env
# Equipechat By Raphael Batista - Suporte 81 99998-8876
# Todos os direitos reservados. Pirataria é crime (Lei 9.609/98).
NODE_ENV=
BACKEND_URL=${subdominio_backend}
FRONTEND_URL=${subdominio_frontend}
PROXY_PORT=443
PORT=${backend_port}

# CREDENCIAIS BD
DB_HOST=localhost
DB_DIALECT=postgres
DB_PORT=5432
DB_USER=${empresa}
DB_PASS=${senha_deploy}
DB_NAME=${empresa}

# DADOS REDIS
REDIS_URI=redis://:${senha_deploy}@127.0.0.1:6379
REDIS_OPT_LIMITER_MAX=1
REDIS_OPT_LIMITER_DURATION=3000
# REDIS_URI_ACK=redis://:${senha_deploy}@127.0.0.1:6379
# BULL_BOARD=true
# BULL_USER=${email_deploy}
# BULL_PASS=${senha_deploy}

# --- RabbitMQ ---
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBIT_USER=${empresa}
RABBIT_PASS=${senha_deploy}
RABBITMQ_URI=amqp://${empresa}:${senha_deploy}@localhost:5672/

TIMEOUT_TO_IMPORT_MESSAGE=1000

# SECRETS
JWT_SECRET=${jwt_secret}
JWT_REFRESH_SECRET=${jwt_refresh_secret}
MASTER_KEY=${senha_master}

VERIFY_TOKEN=whaticket
FACEBOOK_APP_ID=${facebook_app_id}
FACEBOOK_APP_SECRET=${facebook_app_secret}

# METODOS DE PAGAMENTO (configure conforme necessário)
STRIPE_PRIVATE=
STRIPE_OK_URL=${subdominio_backend}/subscription/stripewebhook
STRIPE_CANCEL_URL=${subdominio_frontend}/financeiro

MP_ACCESS_TOKEN=
MP_NOTIFICATION_URL=${subdominio_backend}/subscription/mercadopagowebhook

ASAAS_TOKEN=
ASAAS_NOTIFICATION_URL=${subdominio_backend}/subscription/asaaswebhook

GERENCIANET_SANDBOX=
GERENCIANET_CLIENT_ID=
GERENCIANET_CLIENT_SECRET=
GERENCIANET_PIX_CERT=
GERENCIANET_PIX_KEY=

# EMAIL
MAIL_HOST="smtp.gmail.com"
MAIL_USER="SEUGMAIL@gmail.com"
MAIL_PASS="SENHA DE APP"
MAIL_FROM="Recuperação de Senha <SEU GMAIL@gmail.com>"
MAIL_PORT="465"

# WhatsApp Oficial
USE_WHATSAPP_OFICIAL=true
# URL_API_OFICIAL=https://SubDominioDaOficial.SEUDOMINIO.com.br
TOKEN_API_OFICIAL="adminpro"
OFFICIAL_CAMPAIGN_CONCURRENCY=10

# API de Transcrição de Audio
TRANSCRIBE_URL=http://localhost:4002

# Push Notifications (Mobile/PWA) - Chaves geradas automaticamente
VAPID_PUBLIC_KEY=VAPID_PUB_PLACEHOLDER
VAPID_PRIVATE_KEY=VAPID_PRIV_PLACEHOLDER
VAPID_SUBJECT=mailto:${email_deploy}
[-]EOF
EOF

    sleep 2

    # Gerar chaves VAPID automaticamente e inserir no .env
    banner
    printf "${WHITE} >> Gerando chaves VAPID para Push Notifications...\n"
    echo
    
    # Garantir PATH do Node para npx funcionar
    if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
      export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
    fi
    
    # Gerar chaves VAPID
    VAPID_KEYS=$(npx --yes web-push generate-vapid-keys --json 2>/dev/null)
    
    if [ -n "${VAPID_KEYS}" ]; then
      VAPID_PUB=$(echo "${VAPID_KEYS}" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4)
      VAPID_PRIV=$(echo "${VAPID_KEYS}" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4)
      
      if [ -n "${VAPID_PUB}" ] && [ -n "${VAPID_PRIV}" ]; then
        sed -i "s|VAPID_PUB_PLACEHOLDER|${VAPID_PUB}|g" /home/deploy/${empresa}/backend/.env
        sed -i "s|VAPID_PRIV_PLACEHOLDER|${VAPID_PRIV}|g" /home/deploy/${empresa}/backend/.env
        printf "${GREEN} >> Chaves VAPID geradas e configuradas com sucesso!${WHITE}\n"
      else
        printf "${YELLOW} >> Aviso: Não foi possível extrair as chaves VAPID. Configure manualmente.${WHITE}\n"
        printf "${YELLOW} >> Execute: npx web-push generate-vapid-keys${WHITE}\n"
      fi
    else
      printf "${YELLOW} >> Aviso: Não foi possível gerar chaves VAPID agora — tentando de novo...${WHITE}\n"
    fi

    # Rede de segurança: se a geração acima falhou (ex: npm/registry
    # instável naquele instante) e o placeholder ficou gravado no .env, o
    # backend detecta a chave inválida e desliga o push sozinho (não
    # derruba mais o processo — ver PushNotificationService.ts), mas o
    # atendente ficaria sem notificação até alguém notar. Essa segunda
    # tentativa, idempotente, cobre esse caso automaticamente.
    garantir_push_notifications_env "/home/deploy/${empresa}/backend/.env" "${email_deploy}"

    sleep 2

    banner
    printf "${WHITE} >> Instalando dependências do ${BLUE}backend${WHITE}...\n"
    echo
    sudo su - deploy <<BACKENDINSTALL
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  elif [ -f /usr/bin/node ]; then
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  else
    NODE_DIR=\$(find /usr -type d -name "node" -o -type f -name "node" 2>/dev/null | head -1 | xargs dirname 2>/dev/null)
    if [ -n "\$NODE_DIR" ]; then
      export PATH=\$NODE_DIR:/usr/bin:\$PATH
    fi
  fi
  
  if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo "ERRO: Node.js ou npm não encontrado."
    exit 1
  fi
  
  BACKEND_DIR="/home/deploy/${empresa}/backend"
  if [ ! -d "\$BACKEND_DIR" ]; then
    echo "ERRO: Diretório do backend não existe: \$BACKEND_DIR"
    exit 1
  fi
  
  cd "\$BACKEND_DIR"
  
  if [ ! -f "package.json" ]; then
    echo "ERRO: package.json não encontrado em \$BACKEND_DIR"
    exit 1
  fi
  
  export PUPPETEER_SKIP_DOWNLOAD=true
  rm -rf node_modules 2>/dev/null || true
  rm -f package-lock.json 2>/dev/null || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  npm install puppeteer-core --legacy-peer-deps
  npm i glob
  npm run build
BACKENDINSTALL

    sleep 2

    sudo su - deploy <<FFMPEGFIX
  BACKEND_DIR="/home/deploy/${empresa}/backend"
  FFMPEG_FILE="\${BACKEND_DIR}/node_modules/@ffmpeg-installer/ffmpeg/index.js"
  
  if [ -f "\$FFMPEG_FILE" ]; then
    sed -i 's|npm3Binary = .*|npm3Binary = "/usr/bin/ffmpeg";|' "\$FFMPEG_FILE"
  fi
  
  mkdir -p "\${BACKEND_DIR}/node_modules/@ffmpeg-installer/linux-x64/" 2>/dev/null || true
  if [ -d "\${BACKEND_DIR}/node_modules/@ffmpeg-installer/linux-x64/" ]; then
    echo '{ "version": "1.1.0", "name": "@ffmpeg-installer/linux-x64" }' > "\${BACKEND_DIR}/node_modules/@ffmpeg-installer/linux-x64/package.json"
  fi
FFMPEGFIX

    sleep 2

    banner
    printf "${WHITE} >> Executando db:migrate...\n"
    echo
    sudo su - deploy <<MIGRATEINSTALL
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  
  cd "/home/deploy/${empresa}/backend"
  npx sequelize db:migrate
MIGRATEINSTALL

    sleep 2

    banner
    printf "${WHITE} >> Executando db:seed...\n"
    echo
    sudo su - deploy <<SEEDINSTALL
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  
  cd "/home/deploy/${empresa}/backend"
  npx sequelize db:seed:all
SEEDINSTALL

    sleep 2

    banner
    printf "${WHITE} >> Iniciando pm2 ${BLUE}backend${WHITE}...\n"
    echo
    sudo su - deploy <<PM2BACKEND
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  
  cd "/home/deploy/${empresa}/backend"
  
  if [ ! -f "dist/server.js" ]; then
    echo "ERRO: Arquivo dist/server.js não encontrado."
    exit 1
  fi
  
  pm2 start dist/server.js --name ${empresa}-backend
PM2BACKEND

    sleep 2
  } || trata_erro "instala_backend_base"
}

# Instala e configura frontend
instala_frontend_base() {
  banner
  printf "${WHITE} >> Instalando dependências do ${BLUE}frontend${WHITE}...\n"
  echo
  
  if [ -z "${empresa}" ]; then
    carregar_variaveis
    if [ -z "${empresa}" ]; then
      printf "${RED} >> ERRO: Não foi possível carregar a variável 'empresa'. Abortando.\n${WHITE}"
      exit 1
    fi
  fi
  
  if [ ! -d "/home/deploy/${empresa}" ]; then
    printf "${RED} >> ERRO: Diretório /home/deploy/${empresa} não existe!\n${WHITE}"
    exit 1
  fi
  
  {
    sudo su - deploy <<FRONTENDINSTALL
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  
  cd "/home/deploy/${empresa}/frontend"
  
  if [ ! -f "package.json" ]; then
    echo "ERRO: package.json não encontrado"
    exit 1
  fi
  
  # Instalacao limpa: deixa o react-scripts controlar sua propria arvore de webpack
  rm -rf node_modules package-lock.json 2>/dev/null || true
  npm cache clean --force >/dev/null 2>&1 || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  node scripts/ensure-ajv.js
FRONTENDINSTALL

    sleep 2

    banner
    printf "${WHITE} >> Configurando variáveis de ambiente ${BLUE}frontend${WHITE}...\n"
    echo
    subdominio_backend=$(echo "${subdominio_backend/https:\/\//}")
    subdominio_backend=${subdominio_backend%%/*}
    subdominio_backend=https://${subdominio_backend}
    sudo su - deploy <<EOF
  cat <<[-]EOF > /home/deploy/${empresa}/frontend/.env
REACT_APP_BACKEND_URL=${subdominio_backend}
REACT_APP_FACEBOOK_APP_ID=${facebook_app_id}
REACT_APP_REQUIRE_BUSINESS_MANAGEMENT=TRUE
REACT_APP_NAME_SYSTEM=${nome_titulo}
REACT_APP_NUMBER_SUPPORT=${numero_suporte}
SERVER_PORT=${frontend_port}
[-]EOF
EOF

    sleep 2

    banner
    printf "${WHITE} >> Compilando o código do ${BLUE}frontend${WHITE}...\n"
    echo
    sudo su - deploy <<FRONTENDBUILD
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  
  cd "/home/deploy/${empresa}/frontend"
  
  if [ -f "server.js" ]; then
    cp server.js server.js.bak
    sed -i 's/3000/'"${frontend_port}"'/g' server.js
    # Se o sed esvaziou o arquivo, restaurar o backup
    if [ ! -s "server.js" ]; then
      echo "AVISO: server.js ficou vazio apos sed, restaurando backup..."
      cp server.js.bak server.js
      # Aplicar porta via script node para ser mais seguro
      node -e "const fs=require('fs');let c=fs.readFileSync('server.js','utf8');c=c.replace(/3000/g,'${frontend_port}');fs.writeFileSync('server.js',c);"
    fi
    # Verificação final - se ainda vazio, recriar server.js completo
    if [ ! -s "server.js" ]; then
      echo "AVISO: Recriando server.js do zero..."
      cat > server.js << 'SERVERJS'
const express = require("express");
const path = require("path");
const app = express();
const dotenv = require("dotenv");
dotenv.config();
app.use(express.static(path.join(__dirname, "build")));
app.get("/*", function (req, res) {
    res.sendFile(path.join(__dirname, "build", "index.html"));
});
const port = process.env.PORT || process.env.SERVER_PORT || 3000;
app.listen(port, () => {
    console.log("Server is running on port " + port);
});
SERVERJS
    fi
  else
    # server.js não existe, criar do zero
    echo "AVISO: server.js não encontrado, criando..."
    cat > server.js << 'SERVERJS'
const express = require("express");
const path = require("path");
const app = express();
const dotenv = require("dotenv");
dotenv.config();
app.use(express.static(path.join(__dirname, "build")));
app.get("/*", function (req, res) {
    res.sendFile(path.join(__dirname, "build", "index.html"));
});
const port = process.env.PORT || process.env.SERVER_PORT || 3000;
app.listen(port, () => {
    console.log("Server is running on port " + port);
});
SERVERJS
  fi
  
  NODE_OPTIONS="--max-old-space-size=4096 --openssl-legacy-provider" npm run build
FRONTENDBUILD

    sleep 2

    banner
    printf "${WHITE} >> Iniciando pm2 ${BLUE}frontend${WHITE}...\n"
    echo
    sudo su - deploy <<PM2FRONTEND
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  
  cd "/home/deploy/${empresa}/frontend"
  
  if [ ! -f "server.js" ]; then
    echo "ERRO: server.js não encontrado"
    exit 1
  fi
  
  pm2 start server.js --name ${empresa}-frontend
  pm2 save
PM2FRONTEND

    sleep 2
  } || trata_erro "instala_frontend_base"
}

# Configura cron
config_cron_base() {
  printf "${GREEN} >> Adicionando cron atualizar o uso da public às 3h da manhã...${WHITE} \n"
  echo
  {
    if ! command -v cron >/dev/null 2>&1; then
      sudo apt-get update
      sudo apt-get install -y cron
    fi
    sleep 2
    wget -O /home/deploy/atualiza_public.sh https://raw.githubusercontent.com/FilipeCamillo/busca_tamaho_pasta/main/busca_tamaho_pasta.sh >/dev/null 2>&1
    chmod +x /home/deploy/atualiza_public.sh >/dev/null 2>&1
    chown deploy:deploy /home/deploy/atualiza_public.sh >/dev/null 2>&1
    echo '#!/bin/bash
if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
  export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
elif [ -f /usr/bin/node ]; then
  export PATH=/usr/bin:/usr/local/bin:$PATH
fi
pm2 restart all' >/home/deploy/reinicia_instancia.sh
    chmod +x /home/deploy/reinicia_instancia.sh
    chown deploy:deploy /home/deploy/reinicia_instancia.sh >/dev/null 2>&1
    sudo su - deploy <<'EOF'
        CRON_JOB1="0 3 * * * wget -O /home/deploy/atualiza_public.sh https://raw.githubusercontent.com/FilipeCamillo/busca_tamaho_pasta/main/busca_tamaho_pasta.sh && bash /home/deploy/atualiza_public.sh >> /home/deploy/cron.log 2>&1"
        CRON_JOB2="0 1 * * * /bin/bash /home/deploy/reinicia_instancia.sh >> /home/deploy/cron.log 2>&1"
        CRON_EXISTS1=$(crontab -l 2>/dev/null | grep -F "${CRON_JOB1}")
        CRON_EXISTS2=$(crontab -l 2>/dev/null | grep -F "${CRON_JOB2}")

        if [[ -z "${CRON_EXISTS1}" ]] || [[ -z "${CRON_EXISTS2}" ]]; then
            {
                crontab -l 2>/dev/null
                [[ -z "${CRON_EXISTS1}" ]] && echo "${CRON_JOB1}"
                [[ -z "${CRON_EXISTS2}" ]] && echo "${CRON_JOB2}"
            } | crontab -
        fi
EOF

    sleep 2
  } || trata_erro "config_cron_base"
}

# Configura Nginx
config_nginx_base() {
  banner
  printf "${WHITE} >> Configurando nginx ${BLUE}frontend${WHITE}...\n"
  echo
  {
    frontend_hostname=$(echo "${subdominio_frontend/https:\/\//}")
    sudo su - root <<EOF
cat > /etc/nginx/sites-available/${empresa}-frontend << 'END'
server {
  server_name ${frontend_hostname};
  location / {
    proxy_pass http://127.0.0.1:${frontend_port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_cache_bypass \$http_upgrade;
  }
}
END
ln -sf /etc/nginx/sites-available/${empresa}-frontend /etc/nginx/sites-enabled
EOF

    sleep 2

    banner
    printf "${WHITE} >> Configurando Nginx ${BLUE}backend${WHITE}...\n"
    echo
    backend_hostname=$(echo "${subdominio_backend/https:\/\//}")
    sudo su - root <<EOF
cat > /etc/nginx/sites-available/${empresa}-backend << 'END'
upstream backend {
        server 127.0.0.1:${backend_port};
        keepalive 32;
    }
server {
  server_name ${backend_hostname};
  # wacalls-chat (mensagem + chamada WhatsApp) fala só com o backend Node
  # em 127.0.0.1:8091 — não precisa de bloco de proxy aqui, diferente do
  # wacalls-voip antigo (removido).
  location / {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_cache_bypass \$http_upgrade;
    proxy_buffering on;
  }
}
END

ln -sf /etc/nginx/sites-available/${empresa}-backend /etc/nginx/sites-enabled
EOF

    sleep 2

    banner
    printf "${WHITE} >> Emitindo SSL do ${subdominio_backend}...\n"
    echo
    backend_domain=$(echo "${subdominio_backend/https:\/\//}")
    sudo su - root <<EOF
    certbot -m ${email_deploy} \
            --nginx \
            --agree-tos \
            --expand \
            -n \
            -d ${backend_domain}
EOF

    sleep 2

    banner
    printf "${WHITE} >> Emitindo SSL do ${subdominio_frontend}...\n"
    echo
    frontend_domain=$(echo "${subdominio_frontend/https:\/\//}")
    sudo su - root <<EOF
    certbot -m ${email_deploy} \
            --nginx \
            --agree-tos \
            --expand \
            -n \
            -d ${frontend_domain}
EOF

    sleep 2
  } || trata_erro "config_nginx_base"
}

# Configura Traefik
config_traefik_base() {
  {
    source /home/deploy/${empresa}/backend/.env
    subdominio_backend=$(echo ${BACKEND_URL} | sed 's|https://||')
    subdominio_frontend=$(echo ${FRONTEND_URL} | sed 's|https://||')
    sudo su - root <<EOF
cat > /etc/traefik/conf.d/routers-${subdominio_backend}.toml << 'END'
[http.routers]
  [http.routers.backend]
    rule = "Host(\`${subdominio_backend}\`)"
    service = "backend"
    entryPoints = ["web"]
    middlewares = ["https-redirect"]

  [http.routers.backend-secure]
    rule = "Host(\`${subdominio_backend}\`)"
    service = "backend"
    entryPoints = ["websecure"]
    [http.routers.backend-secure.tls]
      certResolver = "letsencryptresolver"

[http.services]
  [http.services.backend]
    [http.services.backend.loadBalancer]
      [[http.services.backend.loadBalancer.servers]]
        url = "http://127.0.0.1:${backend_port}"

[http.middlewares]
  [http.middlewares.https-redirect.redirectScheme]
    scheme = "https"
    permanent = true
END
EOF

    sleep 2

    sudo su - root <<EOF
cat > /etc/traefik/conf.d/routers-${subdominio_frontend}.toml << 'END'
[http.routers]
  [http.routers.frontend]
    rule = "Host(\`${subdominio_frontend}\`)"
    service = "frontend"
    entryPoints = ["web"]
    middlewares = ["https-redirect"]

  [http.routers.frontend-secure]
    rule = "Host(\`${subdominio_frontend}\`)"
    service = "frontend"
    entryPoints = ["websecure"]
    [http.routers.frontend-secure.tls]
      certResolver = "letsencryptresolver"

[http.services]
  [http.services.frontend]
    [http.services.frontend.loadBalancer]
      [[http.services.frontend.loadBalancer.servers]]
        url = "http://127.0.0.1:${frontend_port}"

[http.middlewares]
  [http.middlewares.https-redirect.redirectScheme]
    scheme = "https"
    permanent = true
END
EOF

    sleep 2
  } || trata_erro "config_traefik_base"
}

# Ajusta latência
config_latencia_base() {
  banner
  printf "${WHITE} >> Reduzindo Latência...\n"
  echo
  {
    sudo su - root <<EOF
cat >> /etc/hosts << 'END'
127.0.0.1   ${subdominio_backend}
127.0.0.1   ${subdominio_frontend}
END
EOF

    sleep 2

    sudo su - deploy <<'RESTARTPM2'
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:$PATH
  fi
  pm2 restart all
RESTARTPM2

    sleep 2
  } || trata_erro "config_latencia_base"
}

# Finaliza a instalação e mostra dados de acesso
fim_instalacao_base() {
  banner

  # Mesma rede de segurança da atualização: confere o RESULTADO de cada build
  # (artefato existe? é mais novo que o código?) e reconstrói o que ficou
  # para trás, antes de anunciar sucesso. Instalação do zero também erra —
  # um build de Go que falha por permissão de GOPATH, por exemplo, deixaria o
  # WhatsApp Plus fora do ar sem ninguém perceber.
  #
  # Fica DEPOIS do banner de propósito: o banner limpa a tela e apagaria o
  # relatório se viesse antes.
  verificar_artefatos_build || true

  printf "${GREEN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  printf "${GREEN}   ✅ INSTALAÇÃO CONCLUÍDA COM SUCESSO!${WHITE}\n"
  printf "${GREEN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  echo
  printf "   ${WHITE}Backend:  ${BLUE}${subdominio_backend}\n"
  printf "   ${WHITE}Frontend: ${BLUE}${subdominio_frontend}\n"
  if [ -n "${subdominio_oficial}" ]; then
    printf "   ${WHITE}API Oficial: ${BLUE}https://${subdominio_oficial}\n"
  fi
  echo
  printf "   ${WHITE}Usuário: ${BLUE}admin@equipechat.com\n"
  printf "   ${WHITE}Senha:   ${BLUE}adminpro\n"
  echo
  printf "   ${CYAN}Equipechat${WHITE} By ${GREEN}Raphael Batista${WHITE} - Suporte: ${YELLOW}81 99998-8876${WHITE}\n"
  echo

  # Limpeza de segurança — AGENDADA para a saída, não feita agora.
  #
  # Antes a pasta do instalador era apagada 2 segundos depois desta tela,
  # em segundo plano, com o menu ainda aberto. Só que essa pasta é a que tem
  # backend/, frontend/, api_oficial/, api_transcricao/ e wacalls-chat/ — o
  # código-fonte inteiro. Quem voltava ao menu logo depois para instalar a API
  # Oficial, o WhatsApp Plus (Ferramentas) ou repetir uma etapa encontrava
  # tudo apagado e recebia "pasta não encontrada ao lado do instalador".
  #
  # Agora o caminho fica guardado e a remoção acontece no sair() — quando o
  # usuário realmente termina de usar o instalador.
  INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -d "$INSTALLER_DIR" ] && [ "$INSTALLER_DIR" != "/" ] && [ "$INSTALLER_DIR" != "/root" ]; then
    LIMPAR_INSTALADOR_AO_SAIR="$INSTALLER_DIR"
    printf "${YELLOW}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${YELLOW}   🔒 LIMPEZA DE SEGURANÇA${WHITE}\n"
    printf "${YELLOW}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${WHITE}   A pasta do instalador será removida quando você sair (opção 0).${WHITE}\n"
    printf "${WHITE}   Pasta: ${CYAN}${INSTALLER_DIR}${WHITE}\n"
    printf "${WHITE}   Até lá ela continua disponível para instalar a API Oficial,${WHITE}\n"
    printf "${WHITE}   o WhatsApp Plus ou repetir qualquer etapa pelo menu.${WHITE}\n"
    echo
  fi

  printf "${WHITE}>> Aperte qualquer tecla para voltar ao menu principal ou CTRL+C para finalizar\n"
  read -p ""
  echo
}

################################################################
#                         ATUALIZAÇÃO                          #
################################################################

backup_app_atualizar() {
  carregar_variaveis
  detectar_instalacao || return 1
  local app_dir="/home/deploy/${empresa}"
  local backend_env="${app_dir}/backend/.env"
  if [ ! -f "${backend_env}" ]; then
    printf "${RED} >> ERRO: .env do backend não encontrado em ${backend_env}${WHITE}
"
    return 1
  fi
  set -a
  source "${backend_env}"
  set +a
  local db_user="${DB_USER:-${empresa}}"
  local db_name="${DB_NAME:-${empresa}}"
  local db_host="${DB_HOST:-localhost}"
  local db_port="${DB_PORT:-5432}"
  local db_password="${DB_PASS:-${senha_deploy}}"
  {
    banner
    printf "${WHITE} >> Atualizando instalação detectada em: ${CYAN}${app_dir}${WHITE}
"
    echo
    printf "${WHITE} >> Antes de atualizar deseja fazer backup do banco de dados? ${GREEN}S/${RED}N:${WHITE}
"
    echo
    read -p "> " confirmacao_backup
    echo
    confirmacao_backup=$(echo "${confirmacao_backup}" | tr '[:lower:]' '[:upper:]')
    if [ "${confirmacao_backup}" == "S" ]; then
      [ ! -d "/home/deploy/backups" ] && mkdir -p "/home/deploy/backups"
      backup_timestamp=$(date +%d-%m-%Y_%Hh%Mm)
      backup_file="/home/deploy/backups/${empresa}_${backup_timestamp}.sql"
      if [ -z "${db_password}" ]; then
        printf "${YELLOW} >> DB_PASS não encontrado no .env. Pulando backup do banco.${WHITE}
"
        backup_file="none"
      elif PGPASSWORD="${db_password}" pg_dump -U "${db_user}" -h "${db_host}" -p "${db_port}" "${db_name}" >"${backup_file}"; then
        printf "${GREEN} >> Backup do banco de dados ${db_name} concluído. Arquivo: ${backup_file}
"
      else
        rm -f "${backup_file}"
        backup_file="none"
        printf "${YELLOW} >> Não foi possível fazer backup do banco. Continuando somente com backup dos arquivos.${WHITE}
"
      fi
      sleep 2

      # Backup completo dos arquivos da aplicação (código) — somente se usuário aceitou backup
      banner
      printf "${WHITE} >> Criando backup dos arquivos da aplicação para rollback...\n"
      echo
      [ ! -d "/home/deploy/backups/code" ] && mkdir -p "/home/deploy/backups/code"
      code_backup_dir="/home/deploy/backups/code/${empresa}_${backup_timestamp:-$(date +%d-%m-%Y_%Hh%Mm)}"

      # Copiar backend e frontend (excluindo node_modules para economizar espaço)
      mkdir -p "${code_backup_dir}"
      rsync -a --exclude='node_modules' --exclude='.git' "${app_dir}/backend/" "${code_backup_dir}/backend/" 2>/dev/null
      rsync -a --exclude='node_modules' --exclude='.git' "${app_dir}/frontend/" "${code_backup_dir}/frontend/" 2>/dev/null

      if [ -d "${app_dir}/api_oficial" ]; then
        rsync -a --exclude='node_modules' --exclude='.git' "${app_dir}/api_oficial/" "${code_backup_dir}/api_oficial/" 2>/dev/null
      fi
      if [ -d "${app_dir}/api_transcricao" ]; then
        rsync -a --exclude='venv' --exclude='.git' "${app_dir}/api_transcricao/" "${code_backup_dir}/api_transcricao/" 2>/dev/null
      fi

      # Salvar referência do último backup para rollback rápido
      echo "${code_backup_dir}" > /home/deploy/backups/ULTIMO_BACKUP_CODE
      echo "${backup_file:-none}" > /home/deploy/backups/ULTIMO_BACKUP_DB

      code_size=$(du -sh "${code_backup_dir}" 2>/dev/null | cut -f1)
      printf "${GREEN} >> ✅ Backup dos arquivos concluído (${code_size})${WHITE}\n"
      printf "${WHITE}    Salvo em: ${CYAN}${code_backup_dir}${WHITE}\n"
      echo

      sleep 2
    else
      printf " >> Backup pulado pelo usuário. Continuando a atualização...\n"
      echo
      sleep 1
    fi
  } || trata_erro "backup_app_atualizar"
}

# Rollback para versão anterior
rollback_versao() {
  carregar_variaveis
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${RED}⏪ ROLLBACK - VOLTAR VERSÃO ANTERIOR${WHITE}                  ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo

  APP_DIR="/home/deploy/${empresa}"
  BACKUP_CODE_DIR="/home/deploy/backups/code"
  BACKUP_DB_DIR="/home/deploy/backups"

  # Verificar se existem backups
  if [ ! -d "${BACKUP_CODE_DIR}" ]; then
    printf "${RED}❌ Nenhum backup de código encontrado em ${BACKUP_CODE_DIR}${WHITE}\n"
    printf "${YELLOW}   Você precisa ter feito pelo menos uma atualização com backup para usar o rollback.${WHITE}\n"
    echo
    printf "${WHITE} >> Pressione Enter para voltar...${WHITE}\n"
    read -r
    return
  fi

  # Listar backups disponíveis
  printf "${WHITE} Backups de código disponíveis:\n"
  echo
  
  local backup_list=()
  local i=1
  for dir in $(ls -dt ${BACKUP_CODE_DIR}/${empresa}_* 2>/dev/null); do
    if [ -d "$dir" ]; then
      dir_name=$(basename "$dir")
      dir_size=$(du -sh "$dir" 2>/dev/null | cut -f1)
      dir_date=$(echo "$dir_name" | sed "s/${empresa}_//" | sed 's/_/ /g')
      printf "   [${BLUE}${i}${WHITE}] ${dir_name} (${dir_size})\n"
      backup_list+=("$dir")
      i=$((i + 1))
    fi
  done

  if [ ${#backup_list[@]} -eq 0 ]; then
    printf "${RED}❌ Nenhum backup encontrado para ${empresa}${WHITE}\n"
    echo
    printf "${WHITE} >> Pressione Enter para voltar...${WHITE}\n"
    read -r
    return
  fi

  echo
  printf "   [${BLUE}0${WHITE}] Voltar\n"
  echo
  printf "${WHITE} >> Escolha o backup para restaurar:${WHITE}\n"
  read -p "> " backup_choice
  echo

  if [ "${backup_choice}" == "0" ] || [ -z "${backup_choice}" ]; then
    return
  fi

  local idx=$((backup_choice - 1))
  if [ $idx -lt 0 ] || [ $idx -ge ${#backup_list[@]} ]; then
    printf "${RED}Opção inválida.${WHITE}\n"
    sleep 2
    return
  fi

  local selected_backup="${backup_list[$idx]}"
  local selected_name=$(basename "$selected_backup")

  # Verificar se existe backup do banco correspondente
  local db_backup_file="${BACKUP_DB_DIR}/${selected_name}.sql"
  # Tentar encontrar backup de DB com timestamp similar
  local db_timestamp=$(echo "$selected_name" | sed "s/${empresa}_//")
  local possible_db=$(ls ${BACKUP_DB_DIR}/${empresa}_${db_timestamp}*.sql 2>/dev/null | head -1)

  printf "${RED}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${RED}║  ⚠️  ATENÇÃO: O rollback irá:                               ║${WHITE}\n"
  printf "${RED}║                                                              ║${WHITE}\n"
  printf "${RED}║  1. Parar todos os serviços                                  ║${WHITE}\n"
  printf "${RED}║  2. Restaurar os arquivos do backup selecionado              ║${WHITE}\n"
  if [ -n "$possible_db" ]; then
    printf "${RED}║  3. Restaurar o banco de dados do backup                     ║${WHITE}\n"
  fi
  printf "${RED}║  4. Reconstruir e reiniciar a aplicação                      ║${WHITE}\n"
  printf "${RED}║                                                              ║${WHITE}\n"
  printf "${RED}║  Backup: ${CYAN}${selected_name}${RED}                     ║${WHITE}\n"
  printf "${RED}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo
  printf "${WHITE} >> Tem certeza? Digite ${RED}SIM${WHITE} para confirmar:${WHITE}\n"
  read -p "> " confirm_rollback
  echo

  if [ "${confirm_rollback}" != "SIM" ]; then
    printf "${YELLOW} >> Rollback cancelado.${WHITE}\n"
    sleep 2
    return
  fi

  # Passo 1: Parar serviços
  banner
  printf "${WHITE} >> [1/4] Parando serviços...\n"
  echo
  sudo su - deploy <<'STOPPM2'
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:$PATH
  fi
  pm2 stop all
STOPPM2
  sleep 2

  # Passo 2: Restaurar arquivos
  banner
  printf "${WHITE} >> [2/4] Restaurando arquivos do backup...\n"
  echo

  # Salvar .env atuais
  cp "${APP_DIR}/backend/.env" /tmp/backend_env_rollback 2>/dev/null || true
  cp "${APP_DIR}/frontend/.env" /tmp/frontend_env_rollback 2>/dev/null || true

  # Restaurar código do backup
  if [ -d "${selected_backup}/backend" ]; then
    printf "${WHITE}    Restaurando backend...\n"
    rsync -a --delete --exclude='node_modules' --exclude='.env' --exclude='public' "${selected_backup}/backend/" "${APP_DIR}/backend/"
    printf "${GREEN}    ✅ Backend restaurado${WHITE}\n"
  fi

  if [ -d "${selected_backup}/frontend" ]; then
    printf "${WHITE}    Restaurando frontend...\n"
    rsync -a --delete --exclude='node_modules' --exclude='.env' --exclude='build' "${selected_backup}/frontend/" "${APP_DIR}/frontend/"
    printf "${GREEN}    ✅ Frontend restaurado${WHITE}\n"
  fi

  if [ -d "${selected_backup}/api_oficial" ]; then
    printf "${WHITE}    Restaurando API Oficial...\n"
    rsync -a --delete --exclude='node_modules' --exclude='.env' "${selected_backup}/api_oficial/" "${APP_DIR}/api_oficial/"
    printf "${GREEN}    ✅ API Oficial restaurada${WHITE}\n"
  fi

  if [ -d "${selected_backup}/api_transcricao" ]; then
    printf "${WHITE}    Restaurando API Transcrição...\n"
    rsync -a --delete --exclude='venv' --exclude='.env' "${selected_backup}/api_transcricao/" "${APP_DIR}/api_transcricao/"
    printf "${GREEN}    ✅ API Transcrição restaurada${WHITE}\n"
  fi

  # Restaurar .env
  cp /tmp/backend_env_rollback "${APP_DIR}/backend/.env" 2>/dev/null || true
  cp /tmp/frontend_env_rollback "${APP_DIR}/frontend/.env" 2>/dev/null || true

  echo
  printf "${GREEN} >> Arquivos restaurados com sucesso!${WHITE}\n"
  sleep 2

  # Passo 3: Restaurar banco (se tiver backup)
  if [ -n "$possible_db" ] && [ -f "$possible_db" ]; then
    banner
    printf "${WHITE} >> [3/4] Restaurar o banco de dados também? ${GREEN}S/${RED}N:${WHITE}\n"
    echo
    read -p "> " restore_db
    restore_db=$(echo "${restore_db}" | tr '[:lower:]' '[:upper:]')
    echo

    if [ "${restore_db}" == "S" ]; then
      printf "${WHITE}    Restaurando banco de dados...\n"
      db_password=$(grep "DB_PASS=" "${APP_DIR}/backend/.env" | cut -d '=' -f2)
      PGPASSWORD="${db_password}" psql -U ${empresa} -h localhost -d ${empresa} < "${possible_db}" 2>/dev/null
      printf "${GREEN}    ✅ Banco de dados restaurado${WHITE}\n"
      echo
      sleep 2
    fi
  else
    printf "${YELLOW} >> [3/4] Nenhum backup de banco encontrado para esta data. Pulando...${WHITE}\n"
    sleep 2
  fi

  # Passo 4: Reconstruir e reiniciar
  banner
  printf "${WHITE} >> [4/4] Reconstruindo e reiniciando a aplicação...\n"
  echo

  source /home/deploy/${empresa}/frontend/.env 2>/dev/null
  frontend_port=${SERVER_PORT:-3000}

  chown deploy:deploy -R "${APP_DIR}/"
  chmod 775 -R "${APP_DIR}/backend/public/" 2>/dev/null || true

  sudo su - deploy <<ROLLBACKBUILD
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  
  BACKEND_DIR="${APP_DIR}/backend"
  FRONTEND_DIR="${APP_DIR}/frontend"
  
  cd "\$BACKEND_DIR"
  export PUPPETEER_SKIP_DOWNLOAD=true
  rm -rf node_modules 2>/dev/null || true
  rm -f package-lock.json 2>/dev/null || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  npm install puppeteer-core --legacy-peer-deps
  npm i glob

  # Conferencia antes de compilar: cada dependencia declarada precisa mesmo
  # resolver. Um npm install interrompido (rede, disco cheio) deixa a arvore
  # pela metade; o build ate passa e o processo so quebra no ar com
  # MODULE_NOT_FOUND, sem dizer que a culpa foi da instalacao.
  if [ -f scripts/verifica-dependencias.js ]; then
    node scripts/verifica-dependencias.js || {
      echo ">> [BACKEND] instalacao incompleta - refazendo npm install"
      rm -rf node_modules package-lock.json
      npm install --no-audit --no-fund --include=dev
      node scripts/verifica-dependencias.js || echo ">> [BACKEND] ATENCAO: ainda faltam dependencias"
    }
  fi

  if ! npm run build; then
    echo ""
    echo ">> [BACKEND] ATENCAO: o build do backend FALHOU. A verificacao final vai tentar de novo e mostrar o log."
    echo ""
  fi
  sleep 2
  npx sequelize db:migrate || echo ">> [BACKEND] ATENCAO: as migrations FALHARAM (veja a mensagem acima)."
  sleep 2
  
  cd "\$FRONTEND_DIR"
  # Frontend: instalacao limpa para o react-scripts controlar sua propria arvore
  rm -rf node_modules package-lock.json 2>/dev/null || true
  npm cache clean --force >/dev/null 2>&1 || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  node scripts/ensure-ajv.js
  
  if [ -f "server.js" ]; then
    sed -i 's/3000/'"$frontend_port"'/g' server.js
  fi
  
  NODE_OPTIONS="--max-old-space-size=4096 --openssl-legacy-provider" npm run build
  sleep 2
  pm2 flush
  pm2 reset all
  pm2 restart all
  pm2 save
ROLLBACKBUILD

  # Reiniciar proxy
  sudo su - root <<EOF
    if systemctl is-active --quiet nginx; then
      sudo systemctl restart nginx
    elif systemctl is-active --quiet traefik; then
      sudo systemctl restart traefik.service
    fi
EOF

  # Tela final
  banner
  printf "${GREEN}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${GREEN}║        ✅ ROLLBACK CONCLUÍDO COM SUCESSO!                  ║${WHITE}\n"
  printf "${GREEN}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo
  printf "${WHITE} A aplicação foi restaurada para a versão do backup:\n"
  printf "   ${CYAN}${selected_name}${WHITE}\n"
  echo
  printf "${WHITE} O que foi feito:\n"
  printf "   ${GREEN}✅${WHITE} Serviços parados\n"
  printf "   ${GREEN}✅${WHITE} Código restaurado do backup\n"
  if [ -n "$possible_db" ] && [ "${restore_db}" == "S" ]; then
    printf "   ${GREEN}✅${WHITE} Banco de dados restaurado\n"
  fi
  printf "   ${GREEN}✅${WHITE} Dependências reinstaladas\n"
  printf "   ${GREEN}✅${WHITE} Aplicação reconstruída\n"
  printf "   ${GREEN}✅${WHITE} Serviços reiniciados\n"
  echo
  printf "${WHITE} >> Pressione Enter para voltar ao menu...${WHITE}\n"
  read -r
}

baixa_codigo_atualizar() {
  carregar_variaveis
  detectar_instalacao || return 1
  local APP_DIR="/home/deploy/${empresa}"
  if [ ! -d "${APP_DIR}/backend" ] || [ ! -d "${APP_DIR}/frontend" ]; then
    printf "${RED} >> ERRO: instalação não encontrada em ${APP_DIR}${WHITE}
"
    return 1
  fi
  banner
  printf "${WHITE} >> Recuperando Permissões em ${CYAN}${APP_DIR}${WHITE}... 
"
  echo
  sleep 2
  chown deploy:deploy -R "${APP_DIR}"
  chmod 775 -R "${APP_DIR}"

  sleep 2

  banner
  printf "${WHITE} >> Parando Instancias... \n"
  echo
  sleep 2
  sudo su - deploy <<'STOPPM2'
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:$PATH
  fi
  pm2 stop all
STOPPM2

  sleep 2

  otimiza_banco_atualizar

  banner
  printf "${WHITE} >> Atualizando a Aplicação (cópia local)... \n"
  echo
  sleep 2

  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # Backup dos .env antes de sobrescrever
  cp "${APP_DIR}/backend/.env" /tmp/backend_env_backup 2>/dev/null || true
  cp "${APP_DIR}/frontend/.env" /tmp/frontend_env_backup 2>/dev/null || true

  source "${APP_DIR}/frontend/.env" 2>/dev/null || true
  frontend_port=${SERVER_PORT:-3000}

  # Copiar novos arquivos do backend e frontend preservando dados
  if [ -d "${INSTALADOR_DIR}/backend" ]; then
    printf "${WHITE} >> Atualizando backend...\n"
    rsync -a --exclude='node_modules' --exclude='.env' --exclude='dist' --exclude='public' "${INSTALADOR_DIR}/backend/" "${APP_DIR}/backend/"
    # A pasta public/ é excluída de propósito do rsync acima (é onde ficam
    # os uploads de cada empresa — sincronizar ela inteira apagaria/misturaria
    # arquivo de cliente). Mas isso também significa que arquivos ESTÁTICOS
    # do próprio sistema que moram ali (como o widget público
    # public/webchat.js) nunca chegavam no servidor via atualização normal.
    # Copia pontual, só desse arquivo, sem tocar em mais nada da pasta.
    if [ -f "${INSTALADOR_DIR}/backend/public/webchat.js" ]; then
      mkdir -p "${APP_DIR}/backend/public"
      cp -f "${INSTALADOR_DIR}/backend/public/webchat.js" "${APP_DIR}/backend/public/webchat.js"
      chown deploy:deploy "${APP_DIR}/backend/public/webchat.js" 2>/dev/null || true
    fi
    printf "${GREEN} >> ✅ Backend atualizado${WHITE}\n"
  fi

  if [ -d "${INSTALADOR_DIR}/frontend" ]; then
    printf "${WHITE} >> Atualizando frontend...\n"
    rsync -a --exclude='node_modules' --exclude='.env' --exclude='build' "${INSTALADOR_DIR}/frontend/" "${APP_DIR}/frontend/"
    printf "${GREEN} >> ✅ Frontend atualizado${WHITE}\n"
  fi

  if [ -d "${INSTALADOR_DIR}/api_oficial" ]; then
    printf "${WHITE} >> Atualizando API Oficial...\n"
    rsync -a --exclude='node_modules' --exclude='.env' --exclude='dist' "${INSTALADOR_DIR}/api_oficial/" "${APP_DIR}/api_oficial/"
    printf "${GREEN} >> ✅ API Oficial atualizada${WHITE}\n"
  fi

  if [ -d "${INSTALADOR_DIR}/api_transcricao" ]; then
    printf "${WHITE} >> Atualizando API Transcrição...\n"
    rsync -a --exclude='venv' --exclude='.env' "${INSTALADOR_DIR}/api_transcricao/" "${APP_DIR}/api_transcricao/"
    printf "${GREEN} >> ✅ API Transcrição atualizada${WHITE}\n"
  fi

  # Restaurar .env
  cp /tmp/backend_env_backup "${APP_DIR}/backend/.env" 2>/dev/null || true
  cp /tmp/frontend_env_backup "${APP_DIR}/frontend/.env" 2>/dev/null || true

  # Push Notifications: instalações antigas (de antes desse recurso existir)
  # nunca tiveram VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY gravadas no .env — e
  # como a atualização preserva o .env antigo (linha acima), elas
  # continuariam sem push pra sempre. Verifica e gera aqui se faltar,
  # exatamente como já acontece numa instalação nova.
  local _upd_email
  _upd_email=$(grep -E '^VAPID_SUBJECT=' "${APP_DIR}/backend/.env" 2>/dev/null | tail -1 | sed 's/^VAPID_SUBJECT=mailto:\{0,1\}//')
  [ -z "${_upd_email}" ] && _upd_email="admin@equipechat.com.br"
  garantir_push_notifications_env "${APP_DIR}/backend/.env" "${_upd_email}"

  chown deploy:deploy -R "${APP_DIR}/"

  sudo su - deploy <<UPDATEAPP
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi
  
  BACKEND_DIR="${APP_DIR}/backend"
  FRONTEND_DIR="${APP_DIR}/frontend"
  
  cd "\$BACKEND_DIR"
  npm prune --force > /dev/null 2>&1
  export PUPPETEER_SKIP_DOWNLOAD=true
  rm -rf node_modules 2>/dev/null || true
  rm -f package-lock.json 2>/dev/null || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  npm install puppeteer-core --legacy-peer-deps
  npm i glob

  # Conferencia antes de compilar: cada dependencia declarada precisa mesmo
  # resolver. Um npm install interrompido (rede, disco cheio) deixa a arvore
  # pela metade; o build ate passa e o processo so quebra no ar com
  # MODULE_NOT_FOUND, sem dizer que a culpa foi da instalacao.
  if [ -f scripts/verifica-dependencias.js ]; then
    node scripts/verifica-dependencias.js || {
      echo ">> [BACKEND] instalacao incompleta - refazendo npm install"
      rm -rf node_modules package-lock.json
      npm install --no-audit --no-fund --include=dev
      node scripts/verifica-dependencias.js || echo ">> [BACKEND] ATENCAO: ainda faltam dependencias"
    }
  fi

  npm run build
  sleep 2
  npx sequelize db:migrate
  sleep 2
  
  cd "\$FRONTEND_DIR"
  # Frontend: instalacao limpa para o react-scripts controlar sua propria arvore
  # (evita erros como ajv/codegen, caniuse-lite/unpacker/agents e validateOptions)
  rm -rf node_modules package-lock.json 2>/dev/null || true
  npm cache clean --force >/dev/null 2>&1 || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  node scripts/ensure-ajv.js
  
  if [ -f "server.js" ]; then
    sed -i 's/3000/'"$frontend_port"'/g' server.js
  fi
  
  NODE_OPTIONS="--max-old-space-size=4096 --openssl-legacy-provider" npm run build
  sleep 2

  # ── API Oficial (NestJS) ────────────────────────────────────────────────
  # O rsync copia o CODIGO-FONTE e preserva o dist antigo (dist esta na lista
  # de exclusao). Sem compilar aqui, o processo continua executando a versao
  # anterior: o codigo novo fica no disco e nao roda. Foi exatamente isso que
  # aconteceu antes — um erro de TypeScript abortou o build, o dist velho
  # ficou no lugar, e o instalador ainda assim anunciou sucesso.
  API_OFICIAL_DIR="${APP_DIR}/api_oficial"
  rm -f /tmp/apioficial_build.status
  if [ -d "\$API_OFICIAL_DIR" ]; then
    echo ">> Compilando API Oficial..."
    cd "\$API_OFICIAL_DIR"
    npm install --no-audit --no-fund --legacy-peer-deps
    npx prisma generate
    # Antes disso o "npx prisma migrate deploy" dependia do Prisma achar e ler
    # o .env sozinho — funciona na maioria dos casos, mas em alguns contextos
    # (esse bloco todo roda dentro de um heredoc via sudo su - deploy) esse
    # auto-load podia falhar silenciosamente, dando "Environment variable not
    # found: DATABASE_LINK" mesmo com o .env presente e correto. Carregando
    # explícito aqui, o migrate não depende mais de adivinhação.
    if [ -f "\$API_OFICIAL_DIR/.env" ]; then
      set -a
      # shellcheck disable=SC1091
      source "\$API_OFICIAL_DIR/.env"
      set +a
    else
      echo ">> [API Oficial] AVISO: \$API_OFICIAL_DIR/.env não encontrado — migrate vai falhar até esse arquivo existir com DATABASE_LINK configurado."
    fi
    if [ -z "\${DATABASE_LINK:-}" ]; then
      echo ">> [API Oficial] AVISO: variável DATABASE_LINK não está definida (nem no .env nem no ambiente) — pulando migrate deploy pra não travar a atualização. Configure DATABASE_LINK em \$API_OFICIAL_DIR/.env e rode 'npx prisma migrate deploy' manualmente ali dentro."
    else
      npx prisma migrate deploy || echo ">> [API Oficial] migrate deploy falhou (seguindo)"
    fi
    if npm run build && [ -f dist/main.js ]; then
      echo "ok" > /tmp/apioficial_build.status
      echo ">> [API Oficial] build concluido"
      # O "pm2 restart all" mais abaixo so reinicia o que JA esta cadastrado.
      # Numa instalacao onde a API Oficial foi posta no ar por fora do PM2,
      # ou onde a entrada foi removida, o codigo novo compilava e nunca subia.
      if ! pm2 describe api_oficial >/dev/null 2>&1; then
        echo ">> [API Oficial] sem entrada no PM2 - cadastrando"
        pm2 start dist/main.js --name=api_oficial --cwd "\$API_OFICIAL_DIR" >/dev/null 2>&1 \
          && echo ">> [API Oficial] servico cadastrado no PM2" \
          || echo ">> [API Oficial] falha ao cadastrar no PM2"
      fi
    else
      echo "falhou" > /tmp/apioficial_build.status
      echo ">> [API Oficial] BUILD FALHOU - o dist antigo continua no ar"
    fi
  fi

  # ── API de Transcricao (Python) ─────────────────────────────────────────
  # Codigo novo pode exigir dependencia nova; sem instalar, o servico sobe e
  # quebra no import.
  #
  # Instalacao antiga nao criava venv: instalava com pip3 global. Nessa
  # maquina o bloco abaixo imprimia "venv nao encontrada - pulando" e nunca
  # instalava nada. Agora, se a venv nao existir, ela e criada aqui e o PM2 e
  # reapontado para o python dela — a migracao acontece na propria atualizacao,
  # sem precisar rodar a instalacao do zero.
  API_TRANS_DIR="${APP_DIR}/api_transcricao"
  if [ -d "\$API_TRANS_DIR" ] && [ -f "\$API_TRANS_DIR/requirements.txt" ]; then
    echo ">> Atualizando dependencias da API de Transcricao..."

    if [ ! -x "\$API_TRANS_DIR/venv/bin/pip" ]; then
      echo ">> [Transcricao] venv ausente - criando (migracao do pip3 global)"
      rm -rf "\$API_TRANS_DIR/venv"
      python3 -m venv "\$API_TRANS_DIR/venv" 2>/dev/null || echo ">> [Transcricao] falha ao criar venv"
    fi

    if [ -x "\$API_TRANS_DIR/venv/bin/pip" ]; then
      "\$API_TRANS_DIR/venv/bin/pip" install --upgrade pip setuptools wheel >/dev/null 2>&1 || true
      if "\$API_TRANS_DIR/venv/bin/pip" install --upgrade -r "\$API_TRANS_DIR/requirements.txt"; then
        # So reaponta o PM2 depois que as dependencias entraram. Se o pip
        # falhar, o processo antigo continua no ar exatamente como estava.
        if ! pm2 describe api_transcricao 2>/dev/null | grep -q "venv/bin/python"; then
          echo ">> [Transcricao] reapontando o PM2 para o python da venv"
          pm2 delete api_transcricao  >/dev/null 2>&1 || true
          pm2 delete api-transcricao  >/dev/null 2>&1 || true
          pm2 start "\$API_TRANS_DIR/main.py" \
            --name api_transcricao \
            --interpreter "\$API_TRANS_DIR/venv/bin/python3" \
            --cwd "\$API_TRANS_DIR" >/dev/null 2>&1 \
            && echo ">> [Transcricao] servico reapontado" \
            || echo ">> [Transcricao] falha ao subir no PM2 - rode: bash \$API_TRANS_DIR/install-python-app.sh"
        fi
      else
        echo ">> [Transcricao] pip falhou - servico antigo mantido como estava"
      fi
    else
      echo ">> [Transcricao] sem venv - rode: bash \$API_TRANS_DIR/install-python-app.sh"
    fi
  fi

  sleep 2

  # Rotacao de log do PM2. Sem isto os arquivos em ~/.pm2/logs crescem sem
  # limite: sao mais de 1.300 chamadas de log no backend, varias por mensagem
  # recebida. Ja aconteceu de o log encher e esconder o erro que importava.
  # O comando e idempotente; instalado, so reaplica a configuracao.
  pm2 install pm2-logrotate >/dev/null 2>&1 || true
  pm2 set pm2-logrotate:max_size 50M            >/dev/null 2>&1 || true
  pm2 set pm2-logrotate:retain 7                >/dev/null 2>&1 || true
  pm2 set pm2-logrotate:compress true           >/dev/null 2>&1 || true
  pm2 set pm2-logrotate:rotateInterval "0 0 * * *" >/dev/null 2>&1 || true

  pm2 flush
  pm2 reset all
  pm2 restart all
  pm2 save
  pm2 startup
UPDATEAPP

  sudo su - root <<EOF
    if systemctl is-active --quiet nginx; then
      sudo systemctl restart nginx
    elif systemctl is-active --quiet traefik; then
      sudo systemctl restart traefik.service
    fi
EOF

  echo
  printf "${WHITE} >> Backend e frontend atualizados. Seguindo com WhatsApp Plus, troncal SIP e verificação final...\n"
  echo
  sleep 2
  # Antes chamava `menu` aqui: o menu é um laço sem fim, então o resto da
  # atualização (atualizar_base: WhatsApp Plus, troncal SIP, verificação dos
  # artefatos e relatório) NUNCA rodava — quem escolhia "0" saía do
  # instalador com o WhatsApp Plus na versão antiga. Agora volta para quem
  # chamou, e o menu reaparece só no fim de tudo.
  return 0
}

# ─────────────────────────────────────────────────────────────
# Preflight da atualização: libera espaço em disco e garante que o
# PostgreSQL esteja no ar. Sem isso o npm falha com ENOSPC e o
# vacuum/reindex falham com "Connection refused" (foi o erro reportado).
# ─────────────────────────────────────────────────────────────
_espaco_livre_mb() {
  df -Pm / | awk 'NR==2 {print $4}'
}

liberar_espaco_disco() {
  printf "${WHITE} >> Liberando espaço em disco...${WHITE}\n"
  # Caches de pacotes
  sudo apt-get clean >/dev/null 2>&1 || true
  sudo apt-get autoremove -y >/dev/null 2>&1 || true
  # Logs do systemd (mantém 3 dias / 200M)
  sudo journalctl --vacuum-time=3d >/dev/null 2>&1 || true
  sudo journalctl --vacuum-size=200M >/dev/null 2>&1 || true
  # Logs do PM2
  sudo su - deploy -c "pm2 flush" >/dev/null 2>&1 || true
  sudo rm -f /home/deploy/.pm2/logs/*.log >/dev/null 2>&1 || true
  sudo rm -f /home/deploy/.pm2/pm2.log >/dev/null 2>&1 || true
  # Cache do npm (root e deploy)
  sudo npm cache clean --force >/dev/null 2>&1 || true
  sudo su - deploy -c "npm cache clean --force" >/dev/null 2>&1 || true
  sudo rm -rf /home/deploy/.npm/_cacache /root/.npm/_cacache >/dev/null 2>&1 || true
  sudo rm -rf /home/deploy/.npm/_logs/* /root/.npm/_logs/* >/dev/null 2>&1 || true
  # Cache do Go (build do wacalls-chat)
  sudo rm -rf /root/.cache/go-build /home/deploy/.cache/go-build >/dev/null 2>&1 || true
  # Staging de anexos já copiados para o backend. A versão atual remove cada
  # arquivo após o consumo; aqui limpamos resíduos antigos com mais de 7 dias.
  sudo find /home/deploy/wacalls-chat/media/in -type f -mtime +7 -delete >/dev/null 2>&1 || true
  # Temporários antigos
  sudo find /tmp -maxdepth 1 -mtime +2 -exec rm -rf {} + >/dev/null 2>&1 || true
  # Logs rotacionados antigos
  sudo find /var/log -type f \( -name "*.gz" -o -name "*.1" -o -name "*.old" \) -delete >/dev/null 2>&1 || true
  # Backups antigos do instalador (mantém os 3 mais recentes)
  for bkdir in /home/deploy/backup /home/deploy/backups /home/backup; do
    [ -d "$bkdir" ] || continue
    ls -1t "$bkdir" 2>/dev/null | tail -n +4 | while read -r old; do
      sudo rm -rf "${bkdir:?}/${old}" >/dev/null 2>&1 || true
    done
  done
}

garantir_postgres_ativo() {
  if sudo systemctl is-active --quiet postgresql; then
    return 0
  fi
  printf "${YELLOW} >> PostgreSQL parado — iniciando...${WHITE}\n"
  sudo systemctl start postgresql >/dev/null 2>&1 || true
  sleep 5
  if sudo systemctl is-active --quiet postgresql; then
    printf "${GREEN} >> ✅ PostgreSQL ativo${WHITE}\n"
    return 0
  fi
  printf "${RED} >> ⚠ PostgreSQL não subiu. Verifique: journalctl -u postgresql -n 30 --no-pager${WHITE}\n"
  return 1
}

preflight_atualizacao() {
  banner
  printf "${WHITE} >> Verificando ambiente antes de atualizar...${WHITE}\n"
  echo
  local livre
  livre="$(_espaco_livre_mb)"
  printf "${WHITE} >> Espaço livre em /: ${livre} MB${WHITE}\n"

  # Precisa de ~5 GB para node_modules + build do frontend.
  if [ "${livre:-0}" -lt 5000 ]; then
    liberar_espaco_disco
    livre="$(_espaco_livre_mb)"
    printf "${WHITE} >> Espaço livre após limpeza: ${livre} MB${WHITE}\n"
  fi

  if [ "${livre:-0}" -lt 3000 ]; then
    echo
    printf "${RED} ══════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${RED}  DISCO CHEIO: apenas ${livre} MB livres (mínimo 3000 MB).${WHITE}\n"
    printf "${RED}  A atualização foi ABORTADA para não corromper a instalação.${WHITE}\n"
    printf "${RED} ══════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${YELLOW}  Maiores consumidores:${WHITE}\n"
    sudo du -xh -d 1 / 2>/dev/null | sort -rh | head -12
    echo
    printf "${YELLOW}  Sugestões: apagar backups antigos, arquivos em ${WHITE}"
    printf "${YELLOW}/home/deploy/${empresa}/backend/public${WHITE}${YELLOW} e aumentar o disco.${WHITE}\n"
    echo
    read -p "  Pressione Enter para voltar ao menu..." _
    return 1
  fi

  garantir_postgres_ativo || true
  echo
  sleep 1
  return 0
}

otimiza_banco_atualizar() {
  carregar_variaveis
  detectar_instalacao || return 1
  local app_dir="/home/deploy/${empresa}"
  local backend_env="${app_dir}/backend/.env"
  garantir_postgres_ativo || true

  banner
  printf "${WHITE} >> Realizando Manutenção do Banco de Dados... 
"
  echo
  if [ ! -f "${backend_env}" ]; then
    printf "${YELLOW} >> .env do backend não encontrado em ${backend_env}. Pulando manutenção do banco.${WHITE}
"
    sleep 2
    return 0
  fi
  set -a
  source "${backend_env}"
  set +a
  local db_user="${DB_USER:-${empresa}}"
  local db_name="${DB_NAME:-${empresa}}"
  local db_host="${DB_HOST:-localhost}"
  local db_port="${DB_PORT:-5432}"
  local db_password="${DB_PASS:-${senha_deploy}}"
  if [ -z "${db_password}" ]; then
    printf "${YELLOW} >> DB_PASS não encontrado no .env. Pulando manutenção do banco.${WHITE}
"
    sleep 2
    return 0
  fi
  PGPASSWORD="${db_password}" vacuumdb -U "${db_user}" -h "${db_host}" -p "${db_port}" -d "${db_name}" --full --analyze || printf "${YELLOW} >> Aviso: vacuumdb não concluído.${WHITE}
"
  PGPASSWORD="${db_password}" psql -U "${db_user}" -h "${db_host}" -p "${db_port}" -d "${db_name}" -c "REINDEX DATABASE ${db_name};" || printf "${YELLOW} >> Aviso: reindex não concluído.${WHITE}
"
  PGPASSWORD="${db_password}" psql -U "${db_user}" -h "${db_host}" -p "${db_port}" -d "${db_name}" -c "ANALYZE;" || printf "${YELLOW} >> Aviso: analyze não concluído.${WHITE}
"
  sleep 2
}

# Instalar transcrição de áudio automaticamente (durante instalacao_base)
instalar_transcricao_automatica() {
  banner
  printf "${CYAN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  printf "${CYAN}   🎤 INSTALAÇÃO DA TRANSCRIÇÃO DE ÁUDIO NATIVA${WHITE}\n"
  printf "${CYAN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  echo
  printf "${WHITE} >> Instalando API de Transcrição de Áudio automaticamente...\n"
  echo

  local script_path="/home/deploy/${empresa}/api_transcricao/install-python-app.sh"
  if [ -f "$script_path" ]; then
    chmod 775 "$script_path"
    # Passa o nome da instalação explicitamente. O script também sabe se
    # localizar sozinho pelo próprio caminho, mas mandar a variável evita
    # qualquer divergência entre o que o instalador acha e o que ele acha.
    empresa="${empresa}" bash "$script_path"
    printf "${GREEN}══════════════════════════════════════════════════════════════════${WHITE}\n"
    printf "${GREEN}   ✅ Transcrição de Áudio instalada com sucesso!${WHITE}\n"
    printf "${GREEN}══════════════════════════════════════════════════════════════════${WHITE}\n"
  else
    printf "${YELLOW} >> Script de transcrição não encontrado em: $script_path${WHITE}\n"
    printf "${YELLOW} >> Pulando instalação da transcrição. Instale depois pelo menu (opção 3).${WHITE}\n"
  fi
  sleep 2
}

# Instalar transcrição de áudio nativa
instalar_transcricao_audio_nativa() {
  banner
  printf "${WHITE} >> Instalando Transcrição de Áudio Nativa...\n"
  echo
  local script_path="/home/deploy/${empresa}/api_transcricao/install-python-app.sh"
  if [ -f "$script_path" ]; then
    chmod 775 "$script_path"
    empresa="${empresa}" bash "$script_path"
  else
    printf "${RED} >> Script não encontrado em: $script_path${WHITE}\n"
    sleep 2
  fi
  printf "${GREEN} >> Processo de instalação da transcrição finalizado. Voltando ao menu...${WHITE}\n"
  sleep 2
}

# Atualizar API Oficial
atualizar_api_oficial() {
  banner
  printf "${WHITE} >> Atualizando API Oficial...\n"
  echo
  local script_path="$(pwd)/atualizar_apioficial.sh"
  if [ -f "$script_path" ]; then
    chmod 775 "$script_path"
    bash "$script_path"
  else
    printf "${RED} >> Script não encontrado em: $script_path${WHITE}\n"
    sleep 2
  fi
  printf "${GREEN} >> Processo de atualização da API Oficial finalizado. Voltando ao menu...${WHITE}\n"
  sleep 2
}

# Migrar para Equipechat Prime-PRO
migrar_equipechat_pro() {
  banner
  printf "${WHITE} >> Migrando para Equipechat Prime-PRO...\n"
  echo
  local script_path="$(pwd)/atualizador_pro.sh"
  if [ -f "$script_path" ]; then
    chmod 775 "$script_path"
    bash "$script_path"
  else
    printf "${RED} >> Script não encontrado em: $script_path${WHITE}\n"
    printf "${RED} >> Certifique-se de que o arquivo atualizador_pro.sh está no mesmo diretório.${WHITE}\n"
    sleep 2
  fi
  printf "${GREEN} >> Processo de migração finalizado. Voltando ao menu...${WHITE}\n"
  sleep 2
}

# ═══ DESINSTALAR API OFICIAL ═══
desinstalar_api_oficial() {
  carregar_variaveis
  detectar_instalacao || return 1
  banner
  printf "${RED}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${RED}║   DESINSTALAR API OFICIAL (WhatsApp Business)               ║${WHITE}\n"
  printf "${RED}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo

  local api_oficial_dir="/home/deploy/${empresa}/api_oficial"
  local backend_env_path="/home/deploy/${empresa}/backend/.env"

  # Verificar se está instalada
  local pm2_exists=false
  if sudo -u deploy bash -c 'export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH 2>/dev/null; pm2 list' 2>/dev/null | grep -q "api_oficial"; then
    pm2_exists=true
  fi

  if [ ! -d "${api_oficial_dir}" ] && [ "${pm2_exists}" = false ]; then
    printf "${YELLOW} >> A API Oficial não está instalada.${WHITE}\n"
    echo
    printf "${WHITE} >> Pressione Enter para voltar...${WHITE}\n"
    read -r
    return
  fi

  printf "${YELLOW} ATENÇÃO: Isso irá:${WHITE}\n"
  printf "${WHITE}   - Parar o processo PM2 da API Oficial${WHITE}\n"
  printf "${WHITE}   - Desabilitar a API Oficial no backend${WHITE}\n"
  printf "${WHITE}   - Remover a configuração Nginx da API Oficial${WHITE}\n"
  printf "${GREEN}   - O banco 'oficialseparado' NÃO será apagado${WHITE}\n"
  echo
  printf "${WHITE} >> Deseja continuar? (S/N):${WHITE}\n"
  read -p "> " confirm_uninstall
  confirm_uninstall=$(echo "${confirm_uninstall}" | tr '[:lower:]' '[:upper:]')
  echo

  if [ "${confirm_uninstall}" != "S" ]; then
    printf "${YELLOW} >> Cancelado.${WHITE}\n"
    sleep 2
    return
  fi

  # 1. Parar e remover do PM2
  printf "${CYAN} >> Parando API Oficial no PM2...${WHITE}\n"
  sudo su - deploy <<'STOP_API'
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:$PATH
  fi
  pm2 stop api_oficial 2>/dev/null
  pm2 delete api_oficial 2>/dev/null
  pm2 save
STOP_API
  printf "${GREEN} >> [OK] Processo PM2 removido.${WHITE}\n"

  # 2. Desabilitar no backend
  if [ -f "${backend_env_path}" ]; then
    printf "${CYAN} >> Desabilitando API Oficial no backend...${WHITE}\n"
    sudo sed -i 's|^USE_WHATSAPP_OFICIAL=true|USE_WHATSAPP_OFICIAL=false|' "${backend_env_path}"
    printf "${GREEN} >> [OK] Backend atualizado (USE_WHATSAPP_OFICIAL=false).${WHITE}\n"
  fi

  # 3. Remover configuração Nginx
  if [ -f "/etc/nginx/sites-enabled/api_oficial" ]; then
    printf "${CYAN} >> Removendo configuração Nginx da API Oficial...${WHITE}\n"
    sudo rm -f /etc/nginx/sites-enabled/api_oficial
    sudo rm -f /etc/nginx/sites-available/api_oficial
    sudo systemctl reload nginx 2>/dev/null
    printf "${GREEN} >> [OK] Configuração Nginx removida.${WHITE}\n"
  fi

  # 4. Reiniciar backend
  printf "${CYAN} >> Reiniciando backend para aplicar mudanças...${WHITE}\n"
  sudo su - deploy <<'RESTART_BE'
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:$PATH
  fi
  pm2 reload all
RESTART_BE

  echo
  printf "${GREEN}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${GREEN}║   API OFICIAL DESINSTALADA COM SUCESSO!                      ║${WHITE}\n"
  printf "${GREEN}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo
  printf "${YELLOW} O banco 'oficialseparado' foi mantido por segurança.${WHITE}\n"
  printf "${WHITE} Para removê-lo manualmente:${WHITE}\n"
  printf "${WHITE}   sudo -u postgres psql -c \"DROP DATABASE oficialseparado;\"${WHITE}\n"
  echo
  printf "${WHITE} >> Pressione Enter para voltar ao menu...${WHITE}\n"
  read -r
}

# ═══ DESINSTALAR TRANSCRIÇÃO DE ÁUDIO ═══
desinstalar_transcricao_audio() {
  carregar_variaveis
  detectar_instalacao || return 1
  banner
  printf "${RED}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${RED}║   DESINSTALAR TRANSCRIÇÃO DE ÁUDIO                          ║${WHITE}\n"
  printf "${RED}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo

  local transcricao_dir="/home/deploy/${empresa}/api_transcricao"
  local backend_env_path="/home/deploy/${empresa}/backend/.env"

  # Verificar se está instalada
  local pm2_exists=false
  if sudo -u deploy bash -c 'export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH 2>/dev/null; pm2 list' 2>/dev/null | grep -q "transcricao\|api_transcricao\|whisper"; then
    pm2_exists=true
  fi

  local systemd_exists=false
  if systemctl is-active --quiet api_transcricao 2>/dev/null || systemctl list-unit-files | grep -q "api_transcricao"; then
    systemd_exists=true
  fi

  if [ ! -d "${transcricao_dir}" ] && [ "${pm2_exists}" = false ] && [ "${systemd_exists}" = false ]; then
    printf "${YELLOW} >> A Transcrição de Áudio não está instalada.${WHITE}\n"
    echo
    printf "${WHITE} >> Pressione Enter para voltar...${WHITE}\n"
    read -r
    return
  fi

  printf "${YELLOW} ATENÇÃO: Isso irá:${WHITE}\n"
  printf "${WHITE}   - Parar o serviço de Transcrição de Áudio${WHITE}\n"
  printf "${WHITE}   - Resetar a configuração de transcrição no backend${WHITE}\n"
  echo
  printf "${WHITE} >> Deseja continuar? (S/N):${WHITE}\n"
  read -p "> " confirm_uninstall
  confirm_uninstall=$(echo "${confirm_uninstall}" | tr '[:lower:]' '[:upper:]')
  echo

  if [ "${confirm_uninstall}" != "S" ]; then
    printf "${YELLOW} >> Cancelado.${WHITE}\n"
    sleep 2
    return
  fi

  # 1. Parar serviço via PM2
  printf "${CYAN} >> Parando serviço de Transcrição no PM2...${WHITE}\n"
  sudo su - deploy <<'STOP_TRANS'
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:$PATH
  fi
  pm2 stop api_transcricao 2>/dev/null
  pm2 delete api_transcricao 2>/dev/null
  pm2 stop transcricao 2>/dev/null
  pm2 delete transcricao 2>/dev/null
  pm2 save
STOP_TRANS
  printf "${GREEN} >> [OK] Processos PM2 removidos.${WHITE}\n"

  # 2. Parar serviço via systemd (se existir)
  if [ "${systemd_exists}" = true ]; then
    printf "${CYAN} >> Parando serviço systemd...${WHITE}\n"
    sudo systemctl stop api_transcricao 2>/dev/null
    sudo systemctl disable api_transcricao 2>/dev/null
    printf "${GREEN} >> [OK] Serviço systemd desabilitado.${WHITE}\n"
  fi

  # 3. Resetar TRANSCRIBE_URL no backend
  if [ -f "${backend_env_path}" ]; then
    printf "${CYAN} >> Resetando configuração de transcrição no backend...${WHITE}\n"
    if grep -q "^TRANSCRIBE_URL=" "${backend_env_path}"; then
      sudo sed -i 's|^TRANSCRIBE_URL=.*|TRANSCRIBE_URL=|' "${backend_env_path}"
    fi
    printf "${GREEN} >> [OK] Backend atualizado (TRANSCRIBE_URL resetado).${WHITE}\n"
  fi

  # 4. Reiniciar backend
  printf "${CYAN} >> Reiniciando backend para aplicar mudanças...${WHITE}\n"
  sudo su - deploy <<'RESTART_BE2'
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:$PATH
  fi
  pm2 reload all
RESTART_BE2

  echo
  printf "${GREEN}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${GREEN}║   TRANSCRIÇÃO DE ÁUDIO DESINSTALADA COM SUCESSO!             ║${WHITE}\n"
  printf "${GREEN}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo
  printf "${WHITE} Para remover os arquivos completamente:${WHITE}\n"
  printf "${WHITE}   rm -rf ${transcricao_dir}${WHITE}\n"
  echo
  printf "${WHITE} >> Pressione Enter para voltar ao menu...${WHITE}\n"
  read -r
}

# ═══ INSTALAR APENAS API OFICIAL (STANDALONE - sem backend/frontend) ═══
# Removida do menu principal a pedido (era a opção 8, "Instalar APENAS API
# Oficial"). A função continua aqui porque é chamada em outros pontos do
# instalador e para não perder o caminho de instalação isolada, caso volte a
# ser necessária.
instalar_api_oficial_standalone() {
  banner
  printf "${MAGENTA}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${MAGENTA}║   INSTALAR APENAS API OFICIAL (Standalone)                   ║${WHITE}\n"
  printf "${MAGENTA}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo
  printf "${WHITE} Esta opção instala SOMENTE:${WHITE}\n"
  printf "${CYAN}   - PostgreSQL (banco de dados)${WHITE}\n"
  printf "${CYAN}   - Redis (cache)${WHITE}\n"
  printf "${CYAN}   - Node.js + PM2${WHITE}\n"
  printf "${CYAN}   - Nginx (proxy reverso + SSL)${WHITE}\n"
  printf "${CYAN}   - API Oficial (WhatsApp Business)${WHITE}\n"
  echo
  printf "${YELLOW} NÃO instala backend nem frontend do Equipechat Prime.${WHITE}\n"
  printf "${YELLOW} Ideal para quem já tem o backend rodando em outro servidor.${WHITE}\n"
  echo
  printf "${WHITE} >> Deseja continuar? (S/N):${WHITE}\n"
  read -p "> " confirma_standalone
  confirma_standalone=$(echo "${confirma_standalone}" | tr '[:lower:]' '[:upper:]')
  echo

  if [ "${confirma_standalone}" != "S" ]; then
    printf "${YELLOW} >> Cancelado. Voltando ao menu...${WHITE}\n"
    sleep 2
    return
  fi

  # Verificar pasta api_oficial
  INSTALADOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ ! -d "${INSTALADOR_DIR}/api_oficial" ]; then
    printf "${RED} >> ERRO: Pasta 'api_oficial' não encontrada em: ${INSTALADOR_DIR}${WHITE}\n"
    printf "${YELLOW} >> Coloque a pasta api_oficial no mesmo diretório do instalador.${WHITE}\n"
    echo
    printf "${WHITE} >> Pressione Enter para voltar...${WHITE}\n"
    read -r
    return
  fi

  # Coletar dados
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}CONFIGURAÇÃO - API OFICIAL STANDALONE${WHITE}                ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo

  printf "${WHITE} >> Subdomínio da API Oficial (Ex: api.seusistema.com.br):\n"
  echo
  read -p "> " standalone_subdominio
  standalone_subdominio=$(echo "${standalone_subdominio}" | sed 's|https://||g' | sed 's|http://||g' | cut -d'/' -f1)
  echo

  printf "${WHITE} >> Seu email (para certificado SSL):\n"
  echo
  read -p "> " standalone_email
  echo

  printf "${WHITE} >> Nome da empresa/banco (minúsculas, sem espaço, padrão: equipechat):\n"
  echo
  read -p "> " standalone_empresa
  if [ -z "${standalone_empresa}" ]; then standalone_empresa="equipechat"; fi
  standalone_empresa=$(echo "${standalone_empresa}" | tr '[:upper:]' '[:lower:]' | tr -d ' ')
  echo

  printf "${WHITE} >> Senha para banco de dados e Redis (sem caracteres especiais):\n"
  echo
  read -p "> " standalone_senha
  if [ -z "${standalone_senha}" ]; then standalone_senha="equipechat2024"; fi
  echo

  printf "${WHITE} >> URL do Backend principal (Ex: https://backend.seusistema.com.br):\n"
  printf "${YELLOW}    (Onde o backend já está rodando em outro servidor)${WHITE}\n"
  echo
  read -p "> " standalone_backend_url
  if [ -z "${standalone_backend_url}" ]; then standalone_backend_url="http://localhost:8080"; fi
  echo

  printf "${WHITE} >> Porta da API Oficial (padrão: 6000):\n"
  echo
  read -p "> " standalone_port
  if [ -z "${standalone_port}" ]; then standalone_port="6000"; fi
  echo

  # Confirmar dados
  banner
  printf "${WHITE}╔══════════════════════════════════════════════════════════════╗\n"
  printf "${WHITE}║        ${CYAN}CONFIRME OS DADOS (API Oficial Standalone)${WHITE}            ║\n"
  printf "${WHITE}╚══════════════════════════════════════════════════════════════╝\n"
  echo
  printf "   ${WHITE}Subdomínio API: -------->> ${YELLOW}${standalone_subdominio}${WHITE}\n"
  printf "   ${WHITE}Email: ----------------->> ${YELLOW}${standalone_email}${WHITE}\n"
  printf "   ${WHITE}Empresa/Banco: --------->> ${YELLOW}${standalone_empresa}${WHITE}\n"
  printf "   ${WHITE}Senha DB/Redis: -------->> ${YELLOW}${standalone_senha}${WHITE}\n"
  printf "   ${WHITE}Backend URL: ----------->> ${YELLOW}${standalone_backend_url}${WHITE}\n"
  printf "   ${WHITE}Porta API: ------------->> ${YELLOW}${standalone_port}${WHITE}\n"
  echo
  printf "${WHITE} >> Os dados estão corretos? (S/N):${WHITE}\n"
  read -p "> " confirma_dados_standalone
  confirma_dados_standalone=$(echo "${confirma_dados_standalone}" | tr '[:lower:]' '[:upper:]')
  echo

  if [ "${confirma_dados_standalone}" != "S" ]; then
    printf "${YELLOW} >> Cancelado. Voltando ao menu...${WHITE}\n"
    sleep 2
    return
  fi

  # ===== ETAPA 1: Atualizar sistema =====
  banner
  printf "${CYAN} >> [1/8] Atualizando sistema operacional...${WHITE}\n"
  echo
  sudo DEBIAN_FRONTEND=noninteractive apt update -y && sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" && sudo DEBIAN_FRONTEND=noninteractive apt-get install build-essential -y
  sleep 2

  # ===== ETAPA 2: Criar usuário deploy =====
  banner
  printf "${CYAN} >> [2/8] Criando usuário deploy...${WHITE}\n"
  echo
  if id "deploy" &>/dev/null; then
    printf "${YELLOW} >> Usuário deploy já existe. Pulando...${WHITE}\n"
  else
    sudo useradd -m -p $(openssl passwd -1 ${standalone_senha}) -s /bin/bash -G sudo deploy
    sudo usermod -aG sudo deploy
  fi
  sleep 2

  # ===== ETAPA 3: Instalar PostgreSQL =====
  banner
  printf "${CYAN} >> [3/8] Instalando PostgreSQL...${WHITE}\n"
  echo
  if command -v psql &>/dev/null; then
    printf "${YELLOW} >> PostgreSQL já está instalado. Pulando...${WHITE}\n"
  else
    sudo apt-get install -y postgresql postgresql-contrib
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
  fi
  sleep 2

  # Criar usuário e banco
  printf "${WHITE} >> Configurando banco de dados...${WHITE}\n"
  sudo -u postgres psql -c "CREATE USER ${standalone_empresa} WITH PASSWORD '${standalone_senha}' SUPERUSER;" 2>/dev/null || true
  sudo -u postgres psql -c "CREATE DATABASE oficialseparado WITH OWNER ${standalone_empresa};" 2>/dev/null || true
  printf "${GREEN} >> Banco 'oficialseparado' pronto!${WHITE}\n"
  sleep 2

  # ===== ETAPA 4: Instalar Redis =====
  banner
  printf "${CYAN} >> [4/8] Instalando Redis...${WHITE}\n"
  echo
  if command -v redis-server &>/dev/null; then
    printf "${YELLOW} >> Redis já está instalado. Pulando...${WHITE}\n"
  else
    sudo apt-get install -y redis-server
  fi
  # Configurar senha
  sudo sed -i "s/^# requirepass .*/requirepass ${standalone_senha}/" /etc/redis/redis.conf 2>/dev/null
  sudo sed -i "s/^requirepass .*/requirepass ${standalone_senha}/" /etc/redis/redis.conf 2>/dev/null
  sudo systemctl enable redis-server
  sudo systemctl restart redis-server
  printf "${GREEN} >> Redis configurado!${WHITE}\n"
  sleep 2

  # ===== ETAPA 5: Instalar Node.js + PM2 =====
  banner
  printf "${CYAN} >> [5/8] Instalando Node.js e PM2...${WHITE}\n"
  echo
  if command -v node &>/dev/null; then
    printf "${YELLOW} >> Node.js já está instalado ($(node -v)). Pulando...${WHITE}\n"
  else
    curl -fsSL https://raw.githubusercontent.com/tj/n/master/bin/n | sudo bash -s 20.19.4
  fi
  
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:$PATH
  fi
  
  npm install -g pm2 2>/dev/null || sudo npm install -g pm2
  printf "${GREEN} >> Node.js e PM2 instalados!${WHITE}\n"
  sleep 2

  # ===== ETAPA 6: Instalar Nginx =====
  banner
  printf "${CYAN} >> [6/8] Instalando Nginx...${WHITE}\n"
  echo
  if command -v nginx &>/dev/null; then
    printf "${YELLOW} >> Nginx já está instalado. Pulando...${WHITE}\n"
  else
    sudo apt-get install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
  fi
  
  # Instalar certbot
  sudo apt-get install -y certbot python3-certbot-nginx 2>/dev/null || true
  sleep 2

  # ===== ETAPA 7: Copiar e configurar API Oficial =====
  banner
  printf "${CYAN} >> [7/8] Instalando API Oficial...${WHITE}\n"
  echo

  local api_dest="/home/deploy/${standalone_empresa}/api_oficial"
  sudo mkdir -p "/home/deploy/${standalone_empresa}"
  sudo cp -r "${INSTALADOR_DIR}/api_oficial" "${api_dest}"
  sudo chown deploy:deploy -R "/home/deploy/${standalone_empresa}"

  # Gerar JWT
  local standalone_jwt=$(openssl rand -base64 32)

  # Criar .env
  sudo -u deploy bash -c "cat > ${api_dest}/.env <<EOF
DATABASE_LINK=postgresql://${standalone_empresa}:${standalone_senha}@localhost:5432/oficialseparado?schema=public
DATABASE_URL=localhost
DATABASE_PORT=5432
DATABASE_USER=${standalone_empresa}
DATABASE_PASSWORD=${standalone_senha}
DATABASE_NAME=oficialseparado
TOKEN_ADMIN=adminpro
URL_BACKEND_MULT100=${standalone_backend_url}
JWT_REFRESH_SECRET=${standalone_jwt}
REDIS_URI=redis://:${standalone_senha}@127.0.0.1:6379
PORT=${standalone_port}
URL_API_OFICIAL=${standalone_subdominio}
NAME_ADMIN=SetupAutomatizado
EMAIL_ADMIN=admin@equipechat.com
PASSWORD_ADMIN=adminpro
EOF"

  printf "${GREEN} >> .env configurado!${WHITE}\n"

  # Build
  sudo su - deploy <<STANDALONE_BUILD
  if [ -d /usr/local/n/versions/node/20.19.4/bin ]; then
    export PATH=/usr/local/n/versions/node/20.19.4/bin:/usr/bin:/usr/local/bin:\$PATH
  else
    export PATH=/usr/bin:/usr/local/bin:\$PATH
  fi

  cd ${api_dest}
  rm -rf node_modules 2>/dev/null || true
  rm -f package-lock.json 2>/dev/null || true
  npm install --no-audit --no-fund --include=dev --legacy-peer-deps
  npx prisma generate
  npm run build
  npx prisma migrate deploy
  pm2 start dist/main.js --name=api_oficial
  pm2 save
  pm2 startup 2>/dev/null || true
STANDALONE_BUILD

  if [ $? -ne 0 ]; then
    printf "${RED} >> Erro durante a instalação da API Oficial.${WHITE}\n"
    printf "${WHITE} >> Pressione Enter para voltar...${WHITE}\n"
    read -r
    return
  fi
  printf "${GREEN} >> API Oficial compilada e iniciada!${WHITE}\n"
  sleep 2

  # ===== ETAPA 8: Configurar Nginx + SSL =====
  banner
  printf "${CYAN} >> [8/8] Configurando Nginx e SSL...${WHITE}\n"
  echo

  local nginx_conf="/etc/nginx/sites-available/${standalone_empresa}-oficial"
  local nginx_link="/etc/nginx/sites-enabled/${standalone_empresa}-oficial"

  sudo rm -f "${nginx_link}" 2>/dev/null
  sudo rm -f "${nginx_conf}" 2>/dev/null

  sudo bash -c "cat > ${nginx_conf} << 'END'
upstream oficial_standalone {
    server 127.0.0.1:${standalone_port};
    keepalive 32;
}
server {
    server_name ${standalone_subdominio};
    location / {
        proxy_pass http://oficial_standalone;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
END"

  sudo ln -sf "${nginx_conf}" "${nginx_link}"

  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    printf "${GREEN} >> Nginx configurado!${WHITE}\n"
  else
    printf "${RED} >> ERRO na configuração do Nginx. Verifique manualmente.${WHITE}\n"
  fi

  # SSL
  printf "${WHITE} >> Emitindo certificado SSL...${WHITE}\n"
  sudo certbot -m "${standalone_email}" --nginx --agree-tos --expand -n -d "${standalone_subdominio}" || {
    printf "${YELLOW} >> Aviso: Falha no SSL. Tente manualmente: certbot --nginx -d ${standalone_subdominio}${WHITE}\n"
    sleep 3
  }

  # ===== FINALIZAÇÃO =====
  banner
  printf "${GREEN}╔══════════════════════════════════════════════════════════════╗${WHITE}\n"
  printf "${GREEN}║   ✅ API OFICIAL (STANDALONE) INSTALADA COM SUCESSO!       ║${WHITE}\n"
  printf "${GREEN}╚══════════════════════════════════════════════════════════════╝${WHITE}\n"
  echo
  printf "${WHITE} Serviços rodando:${WHITE}\n"
  printf "${CYAN}    PostgreSQL:    porta 5432${WHITE}\n"
  printf "${CYAN}    Redis:         porta 6379${WHITE}\n"
  printf "${CYAN}    API Oficial:   https://${standalone_subdominio}${WHITE}\n"
  echo
  printf "${WHITE} Backend configurado: ${YELLOW}${standalone_backend_url}${WHITE}\n"
  echo
  printf "${WHITE} Credenciais da API Oficial:${WHITE}\n"
  printf "${YELLOW}    Email:  admin@equipechat.com${WHITE}\n"
  printf "${YELLOW}    Senha:  adminpro${WHITE}\n"
  printf "${YELLOW}    Token:  adminpro${WHITE}\n"
  echo
  printf "${RED} IMPORTANTE: No backend principal (.env), configure:${WHITE}\n"
  printf "${YELLOW}    USE_WHATSAPP_OFICIAL=true${WHITE}\n"
  printf "${YELLOW}    URL_API_OFICIAL=https://${standalone_subdominio}${WHITE}\n"
  printf "${YELLOW}    TOKEN_API_OFICIAL=adminpro${WHITE}\n"
  echo

  # Salvar dados
  cat > "${INSTALADOR_DIR}/DADOS_INSTALACAO_OFICIAL_STANDALONE.txt" <<EOF
=== API OFICIAL STANDALONE ===
Data: $(date '+%d/%m/%Y %H:%M:%S')
Empresa: ${standalone_empresa}
API Oficial: https://${standalone_subdominio}
Backend URL: ${standalone_backend_url}
Senha DB: ${standalone_senha}
Porta: ${standalone_port}
EOF
  printf "${GREEN} >> Dados salvos em: DADOS_INSTALACAO_OFICIAL_STANDALONE.txt${WHITE}\n"
  echo
  printf "${WHITE} >> Pressione Enter para voltar ao menu...${WHITE}\n"
  read -r
}



# ------------------------------------------------------------
# ZIP DO SISTEMA AO LADO DO INSTALADOR
#  Se as pastas backend/frontend NÃO estão ao lado deste instalador, mas
#  existe um .zip do sistema na mesma pasta (ex.: /root/ivam-corrigido.zip),
#  o instalador instala o unzip (se faltar), extrai o zip numa pasta limpa
#  com o nome do zip (/root/ivam-corrigido) e se reabre de lá — assim todas
#  as opções (instalar do zero, atualizar...) já encontram as pastas.
#  A pasta de trabalho (pwd) continua a mesma, então VARIAVEIS_INSTALACAO e
#  as etapas salvas não mudam de lugar.
# ------------------------------------------------------------
preparar_zip_do_sistema() {
  [ -n "${EQUIPECHAT_ZIP_EXTRAIDO}" ] && return 0
  local _dir
  _dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  [ -d "${_dir}/backend" ] && [ -d "${_dir}/frontend" ] && return 0

  if ! command -v unzip >/dev/null 2>&1; then
    printf "${WHITE} >> Instalando o unzip para abrir o zip do sistema...${WHITE}\n"
    (apt-get update -qq && apt-get install -y -qq unzip) >/dev/null 2>&1
  fi
  if ! command -v unzip >/dev/null 2>&1; then
    printf "${RED} >> Não consegui instalar o unzip. Rode: apt install -y unzip${WHITE}\n"
    return 0
  fi

  # Zips com backend/ e frontend/ na raiz; havendo mais de um, o mais novo.
  local _zip="" _z
  for _z in $(ls -t "${_dir}"/*.zip 2>/dev/null); do
    if unzip -Z1 "$_z" 2>/dev/null | grep -q '^backend/' && \
       unzip -Z1 "$_z" 2>/dev/null | grep -q '^frontend/'; then
      _zip="$_z"; break
    fi
  done
  [ -z "$_zip" ] && return 0

  local _destino="${_dir}/$(basename "$_zip" .zip)"
  printf "${GREEN} >> Zip do sistema encontrado: ${_zip}${WHITE}\n"
  # Pasta limpa: uma extração antiga é guardada ao lado, nunca misturada.
  if [ -e "$_destino" ]; then
    local _antiga="${_destino}.antiga-$(date +%Y%m%d-%H%M%S)"
    mv "$_destino" "$_antiga"
    printf "${YELLOW} >> Extração anterior guardada em: ${_antiga}${WHITE}\n"
  fi
  mkdir -p "$_destino"
  if ! unzip -q "$_zip" -d "$_destino"; then
    printf "${RED} >> Falha ao extrair ${_zip}.${WHITE}\n"
    return 0
  fi
  printf "${GREEN} >> Extraído em: ${_destino}${WHITE}\n"

  # Usa o instalador que veio no zip; se não vier, leva este junto.
  [ -f "${_destino}/instalador_single.sh" ] || cp "${BASH_SOURCE[0]}" "${_destino}/instalador_single.sh"
  sleep 1
  EQUIPECHAT_ZIP_EXTRAIDO=1 exec bash "${_destino}/instalador_single.sh" "$@"
}

preparar_zip_do_sistema "$@"

carregar_variaveis
menu
