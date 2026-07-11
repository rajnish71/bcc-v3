#!/bin/bash
export MYSQL_PWD=zAkuexH3yylvsguMNXwfeFXf
mysql -h 127.0.0.1 -P 3306 -u bcc_v3_app bcc_v3 --batch -e "
SELECT
  m.id            AS membership_id,
  u.id            AS user_id,
  m.lifecycle_state,
  u.full_name,
  u.email,
  u.username,
  m.expires_at    AS membership_validity
FROM memberships m
JOIN users u ON m.user_id = u.id
ORDER BY m.id;"
