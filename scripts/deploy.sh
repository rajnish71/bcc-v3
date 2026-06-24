#!/bin/bash
# ============================================================================
# deploy.sh — invoked ONLY via the restricted GitHub Actions SSH key's forced
# command (see authorized_keys entry). Pulls latest master, rebuilds backend
# and frontend, restarts the backend under PM2. No sudo anywhere in this
# script — none of these steps need it, since ubuntu already owns
# node_modules/dist and the PM2 daemon that's running bcc-v3-backend.
# ============================================================================
set -euo pipefail

LOG="/var/www/bcc-v3/deploy.log"
exec >> "$LOG" 2>&1

echo ""
echo "=== Deploy started: $(date) ==="

cd /var/www/bcc-v3

echo "--- git pull ---"
git pull origin master

echo "--- backend: install + build + restart ---"
cd /var/www/bcc-v3/backend
npm ci
npm run build
pm2 restart bcc-v3-backend

echo "--- frontend: install + build ---"
cd /var/www/bcc-v3/frontend
npm ci
npm run build

echo "=== Deploy finished: $(date) ==="
