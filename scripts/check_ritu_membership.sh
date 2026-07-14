#!/bin/bash
DB_PASS=$(grep DB_PASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2)
DB="mysql -h localhost -P 3306 -u bcc_v3_app -p$DB_PASS bcc_v3 --batch"

echo "=== Memberships for Ritu (user_id = 30) ==="
$DB -e "SELECT * FROM memberships WHERE user_id = 30"

echo "=== Available Membership Classes ==="
$DB -e "SELECT * FROM membership_classes"
