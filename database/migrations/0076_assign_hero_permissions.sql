-- ============================================================================
-- 0076_assign_hero_permissions.sql
--
-- Assign hero/spotlight management permissions to active admin and editor roles.
-- ============================================================================

SET NAMES utf8mb4;
START TRANSACTION;

-- Assign gallery.spotlight.set to Super Admin, Platform Admin, and Content Editor
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin', 'Content Editor')
  AND p.permission_key = 'gallery.spotlight.set';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0076_assign_hero_permissions.sql', NOW());

COMMIT;
