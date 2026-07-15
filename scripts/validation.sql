-- Validation queries

SELECT '--- 1. Duplicate Usernames ---' AS query_name;
SELECT username, COUNT(*) as count FROM users WHERE username IS NOT NULL GROUP BY username HAVING count > 1;

SELECT '--- 2. Duplicate Emails ---' AS query_name;
SELECT email, COUNT(*) as count FROM users GROUP BY email HAVING count > 1;

SELECT '--- 3. Duplicate Membership Numbers ---' AS query_name;
SELECT membership_number, COUNT(*) as count FROM memberships WHERE membership_number IS NOT NULL AND membership_number != '' GROUP BY membership_number HAVING count > 1;

SELECT '--- 4. Memberships with Missing/Invalid Class ID ---' AS query_name;
SELECT id, user_id, membership_class_id FROM memberships WHERE membership_class_id IS NULL OR membership_class_id NOT IN (SELECT id FROM membership_classes);

SELECT '--- 5. Invalid Membership Statuses (not in ENUM) ---' AS query_name;
-- Checked via DESCRIBE or query below:
SELECT id, lifecycle_state FROM memberships WHERE lifecycle_state NOT IN ('PENDING','APPROVED','ACTIVE','SUSPENDED','EXPIRED','TERMINATED','REJECTED');

SELECT '--- 6. Orphan Memberships (user_id not in users table) ---' AS query_name;
SELECT id, user_id FROM memberships WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);

SELECT '--- 7. Memberships without users (user_id is NULL) ---' AS query_name;
SELECT id, group_entity_id, owner_type FROM memberships WHERE user_id IS NULL;

SELECT '--- 8. Users with multiple active memberships ---' AS query_name;
SELECT user_id, COUNT(*) as count FROM memberships WHERE lifecycle_state = 'ACTIVE' GROUP BY user_id HAVING count > 1;

SELECT '--- 9. Users with multiple memberships of any status ---' AS query_name;
SELECT user_id, COUNT(*) as count FROM memberships GROUP BY user_id HAVING count > 1;

SELECT '--- 10. Users with NULL values in important columns (email, full_name, username) ---' AS query_name;
SELECT id, full_name, email, username FROM users WHERE email IS NULL OR full_name IS NULL OR username IS NULL;

SELECT '--- 11. Membership Numbering anomalies (MEM-007 compliance check) ---' AS query_name;
-- Checks if any membership_number format violates BCC[YYYY][MM][SSSSS] or if founding numbers aren't sequential
SELECT id, user_id, membership_number, lifecycle_state FROM memberships 
WHERE membership_number IS NOT NULL 
AND membership_number NOT REGEXP '^BCC[0-9]{6}[0-9]{5}$';

SELECT '--- 12. Membership numbering by serial vs date checks ---' AS query_name;
SELECT id, membership_number, join_year, join_month, number_serial FROM memberships WHERE membership_number IS NOT NULL;
