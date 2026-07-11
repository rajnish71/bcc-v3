#!/bin/bash
MYSQL_PWD=zAkuexH3yylvsguMNXwfeFXf mysql -h 127.0.0.1 -P 3306 -u bcc_v3_app bcc_v3 --batch -e "SELECT id, full_name, username, email, status, created_at FROM users ORDER BY id;"
