SELECT
  u.id AS userid,
  u.username,
  u.full_name AS display_name,
  u.email,
  u.status AS account_status,
  COALESCE(m.lifecycle_state, 'None') AS membership_status,
  COALESCE(mc.name, 'None') AS membership_class,
  COALESCE(m.membership_number, 'None') AS membership_number,
  COALESCE((
    SELECT GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ', ')
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = u.id
  ), 'None') AS roles
FROM users u
LEFT JOIN memberships m ON u.id = m.user_id
LEFT JOIN membership_classes mc ON m.membership_class_id = mc.id
ORDER BY 
  CASE WHEN m.membership_number IS NULL OR m.membership_number = '' THEN 1 ELSE 0 END, 
  m.membership_number ASC, 
  u.id ASC;
