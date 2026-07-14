#!/bin/bash
DB_PASS=$(grep DB_PASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2)
DB="mysql -h localhost -P 3306 -u bcc_v3_app -p$DB_PASS bcc_v3 --batch"

echo "Deleting refresh_tokens..."
$DB -e "DELETE FROM refresh_tokens WHERE user_id = 43;"

echo "Deleting auth_identities..."
$DB -e "DELETE FROM auth_identities WHERE user_id = 43;"

echo "Deleting login_history..."
$DB -e "DELETE FROM login_history WHERE user_id = 43;"

echo "Deleting users..."
$DB -e "DELETE FROM users WHERE id = 43;"

echo "Done."
