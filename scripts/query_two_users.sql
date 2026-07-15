SELECT
  u.id AS userid,
  u.full_name AS name,
  u.full_name AS display_name,
  u.username,
  u.status,
  COALESCE(mc.name, 'None') AS membership_class,
  COALESCE(m.lifecycle_state, 'None') AS membership_status
FROM users u
LEFT JOIN memberships m ON u.id = m.user_id
LEFT JOIN membership_classes mc ON m.membership_class_id = mc.id
WHERE u.full_name LIKE '%Bablu Khan%'
   OR u.full_name LIKE '%Vikas Kumar Gangpari%'
   OR u.full_name LIKE '%Vikas%Gangpari%'
ORDER BY u.id;
