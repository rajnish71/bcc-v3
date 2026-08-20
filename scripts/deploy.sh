#!/bin/bash
# ============================================================================
# deploy.sh — invoked ONLY via the restricted GitHub Actions SSH key's forced
# command (see authorized_keys entry). Pulls latest master, rebuilds backend
# and frontend, restarts the backend under PM2. No sudo anywhere in this
# script — none of these steps need it, since ubuntu already owns
# node_modules/dist and the PM2 daemon that's running bcc-v3-backend.
#
# Frontend is built into dist-staging and published only after a successful
# build, via same-filesystem rename (dist -> dist-old, dist-staging -> dist).
# A failed or interrupted frontend build never touches the live,
# Nginx-served frontend/dist tree. dist-old retains one prior generation for
# rollback and is pruned at the start of the next successful publish.
# ============================================================================
set -euo pipefail

LOG="/var/www/bcc-v3/deploy.log"
exec >> "$LOG" 2>&1

LOCK="/var/www/bcc-v3/.deploy.lock"
exec 200>"$LOCK"
if ! flock -n 200; then
  echo ""
  echo "=== Deploy skipped: $(date) — another deployment is already in progress ==="
  exit 1
fi

echo ""
echo "=== Deploy started: $(date) ==="

cd /var/www/bcc-v3

echo "--- git fetch and reset ---"
git fetch origin master
git reset --hard origin/master

echo "--- backend: install + build + restart ---"
cd /var/www/bcc-v3/backend
npm ci
npm run build
pm2 restart bcc-v3-backend

echo "--- frontend: install ---"
cd /var/www/bcc-v3/frontend
npm ci

echo "--- frontend: build to staging (dist-staging) ---"
rm -rf dist-staging
npm run build -- --outDir dist-staging

echo "--- frontend: publish staged build ---"
rm -rf dist-old
if [ -d dist ]; then
  mv dist dist-old
fi
mv dist-staging dist

echo "=== Deploy finished: $(date) ==="
