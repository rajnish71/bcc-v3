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
#
# git reset --hard rewrites this file on disk mid-run. bash reads a script
# this small into its buffer near process start, so a process already
# executing would otherwise keep running the pre-reset content it read at
# startup. To avoid that, the first pass re-execs this file by absolute path
# immediately after reset completes, guarded by DEPLOY_SYNCED so the second
# pass runs the rest of the deployment from the now-current file on disk
# without repeating fetch/reset or re-acquiring the lock (fd 200 survives
# exec, so the flock held by the first pass stays held throughout).
# ============================================================================
set -euo pipefail

SCRIPT="/var/www/bcc-v3/scripts/deploy.sh"

LOG="/var/www/bcc-v3/deploy.log"
exec >> "$LOG" 2>&1

if [ -z "${DEPLOY_SYNCED:-}" ]; then
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

  export DEPLOY_SYNCED=1
  exec "$SCRIPT"
fi

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
