SELECT '--- Total Registered Users ---' AS stat;
SELECT COUNT(*) FROM users;

SELECT '--- Users by Account Status ---' AS stat;
SELECT status, COUNT(*) FROM users GROUP BY status;

SELECT '--- Membership Status Breakdown ---' AS stat;
SELECT lifecycle_state, COUNT(*) FROM memberships GROUP BY lifecycle_state;

SELECT '--- Membership Class Breakdown ---' AS stat;
SELECT mc.name, COUNT(*) 
FROM memberships m 
JOIN membership_classes mc ON m.membership_class_id = mc.id 
GROUP BY mc.name;

SELECT '--- Role Breakdown ---' AS stat;
SELECT r.name, COUNT(*) 
FROM user_roles ur 
JOIN roles r ON ur.role_id = r.id 
GROUP BY r.name;
