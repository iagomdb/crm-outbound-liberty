#!/usr/bin/env bash
# Instala Docker Engine + Compose no Linux Mint / Ubuntu.
# Uso:  sudo bash scripts/setup-docker.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode com sudo:  sudo bash scripts/setup-docker.sh" >&2
  exit 1
fi

echo ">> dependências"
apt-get update
apt-get install -y ca-certificates curl

echo ">> chave GPG do Docker"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo ">> repositório apt"
# Mint usa a base Ubuntu; UBUNTU_CODENAME=noble no Mint 22.x
. /etc/os-release
CODENAME="${UBUNTU_CODENAME:-noble}"
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

echo ">> instalando Docker (${CODENAME})"
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo ">> permitir docker sem sudo"
groupadd -f docker
TARGET_USER="${SUDO_USER:-$USER}"
usermod -aG docker "$TARGET_USER"

echo
docker --version
docker compose version
echo
echo "OK. Rode 'newgrp docker' (ou faça logout/login) para usar docker sem sudo."
echo "Depois:  docker compose up --build"
