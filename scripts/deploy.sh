#!/usr/bin/env bash
# Script de deploy local no servidor.
# Uso: ./scripts/deploy.sh [nome-do-app]
set -euo pipefail

APP_NAME="${1:-dashboards}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "==> Atualizando codigo em $ROOT_DIR"
git fetch origin main
git reset --hard origin/main

echo "==> Instalando dependencias"
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

echo "==> Reiniciando aplicacao ($APP_NAME)"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 nao encontrado. Instale com: npm install -g pm2"
  exit 1
fi

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  pm2 start server.js --name "$APP_NAME"
fi

pm2 save
echo "==> Deploy concluido"
