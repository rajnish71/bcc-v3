#!/bin/bash
export MYSQL_PWD=zAkuexH3yylvsguMNXwfeFXf
DB="mysql -h 127.0.0.1 -P 3306 -u bcc_v3_app bcc_v3 --batch"

echo "-- Deleting membership 43..."
$DB -e "DELETE FROM memberships WHERE id = 43;"
echo "   done: $($DB -e "SELECT ROW_COUNT();" | tail -1) row(s)"

echo "-- Deleting refresh_tokens for user 36..."
$DB -e "DELETE FROM refresh_tokens WHERE user_id = 36;"
echo "   done: $($DB -e "SELECT ROW_COUNT();" | tail -1) row(s)"

echo "-- Deleting auth_identities for user 36..."
$DB -e "DELETE FROM auth_identities WHERE user_id = 36;"
echo "   done: $($DB -e "SELECT ROW_COUNT();" | tail -1) row(s)"

echo "-- Deleting user 36..."
$DB -e "DELETE FROM users WHERE id = 36;"
echo "   done: $($DB -e "SELECT ROW_COUNT();" | tail -1) row(s)"

echo ""
echo "=== Final members list ==="
$DB -e "
SELECT m.id AS membership_id, m.membership_number, m.lifecycle_state, u.id AS user_id, u.full_name, u.email
FROM memberships m
JOIN users u ON m.user_id = u.id
ORDER BY m.id;"
