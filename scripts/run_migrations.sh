#!/bin/bash
# ============================================================================
# run_migrations.sh
# Applies every .sql file in database/migrations/ in filename order, skipping
# any already recorded in schema_migrations. Safe to re-run at any time —
# already-applied files are detected and skipped, not blindly re-executed.
#
# Credentials are read from backend/.env (never hardcoded here, never
# committed — backend/.env is gitignored).
# ============================================================================
set -euo pipefail

cd /var/www/bcc-v3

set -a
source backend/.env
set +a

export MYSQL_PWD="${DB_PASSWORD}"   # avoids password appearing in `ps` output via -p flag
MYSQL_CMD=(mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" "${DB_NAME}")

MIGRATIONS_DIR="/var/www/bcc-v3/database/migrations"

echo "=== Applying migrations from ${MIGRATIONS_DIR} ==="
echo ""

for filepath in $(ls "${MIGRATIONS_DIR}"/*.sql | sort); do
  filename=$(basename "$filepath")

  # On the very first run schema_migrations doesn't exist yet — that query
  # will error, so we treat any error here as "not applied yet" and proceed.
  already_applied=$("${MYSQL_CMD[@]}" -N -e "SELECT COUNT(*) FROM schema_migrations WHERE filename = '${filename}'" 2>/dev/null || echo "0")

  if [ "$already_applied" = "1" ]; then
    echo "SKIP   ${filename} (already applied)"
    continue
  fi

  echo "APPLY  ${filename}"
  "${MYSQL_CMD[@]}" < "$filepath"

  "${MYSQL_CMD[@]}" -e "INSERT INTO schema_migrations (filename) VALUES ('${filename}') ON DUPLICATE KEY UPDATE filename = filename"
  echo "OK     ${filename}"
  echo ""
done

echo "=== Migration run complete — applied migrations: ==="
"${MYSQL_CMD[@]}" -e "SELECT filename, applied_at FROM schema_migrations ORDER BY id"

unset MYSQL_PWD
