#!/bin/bash
DB_PASS=$(grep DB_PASSWORD /var/www/bcc-v3/backend/.env | cut -d= -f2)
mysql -h localhost -P 3306 -u bcc_v3_app -p"$DB_PASS" bcc_v3 -e "SELECT id, username, email, status FROM users WHERE email = 'ritu.ahluwalia@gmail.com'"
