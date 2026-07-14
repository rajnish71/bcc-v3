#!/bin/bash
DB_PASS=$(grep DB_PASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2)
DB="mysql -h localhost -P 3306 -u bcc_v3_app -p$DB_PASS bcc_v3 --batch"

echo "=== Memberships ==="
$DB -e "SELECT * FROM memberships WHERE user_id = 43"

echo "=== Refresh Tokens ==="
$DB -e "SELECT * FROM refresh_tokens WHERE user_id = 43"

echo "=== Auth Identities ==="
$DB -e "SELECT * FROM auth_identities WHERE user_id = 43"

echo "=== Account Lockouts ==="
$DB -e "SELECT * FROM account_lockouts WHERE user_id = 43"

echo "=== Users ==="
$DB -e "SELECT * FROM users WHERE id = 43"
