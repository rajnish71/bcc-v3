SELECT
  u.id AS userid,
  u.full_name AS name,
  u.username,
  u.status,
  COALESCE(mc.name, 'None') AS membership_class
FROM users u
LEFT JOIN memberships m ON u.id = m.user_id
LEFT JOIN membership_classes mc ON m.membership_class_id = mc.id
WHERE u.username IN ('kshitijpatle', 'ankittiwari', 'afzalkhan', 'rahilkhan', 'bablukhan', 'raghavc', 'rkkhare1212')
   OR u.full_name LIKE '%Bablu Khan%'
   OR u.full_name LIKE '%Raghav%'
   OR u.full_name LIKE '%Khare%'
ORDER BY u.id;
