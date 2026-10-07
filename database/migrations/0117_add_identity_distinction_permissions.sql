-- ============================================================================
-- 0117_add_identity_distinction_permissions.sql
-- Photographic Distinctions -- Implementation Phase 1 (RBAC foundation).
--
-- Follows the exact pattern of 0101/0109/0114: permissions(permission_key,
-- description) + role_permissions via CROSS JOIN on roles.name. No new role.
-- No Super Admin bypass: Super Admin holds these keys only via the explicit
-- grants below. Nothing here derives from membership or recognition.
--
--   identity.distinction.view              Super Admin, Platform Admin, Coordinator
--   identity.distinction.remove            Super Admin, Platform Admin
--                                          (covers Remove AND Restore)
--   identity.distinction.catalogue.manage  Super Admin
--
-- Do not grant to any other role without explicit written instruction.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO permissions (permission_key, description) VALUES
  ('identity.distinction.view',
   'View members'' self-declared Photographic Distinctions, including withdrawn/removed history'),
  ('identity.distinction.remove',
   'Remove or restore a member''s self-declared Photographic Distinction (audited, reason required)'),
  ('identity.distinction.catalogue.manage',
   'Manage the Photographic Distinctions institution and distinction catalogue (Super Admin only)');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin', 'Coordinator')
  AND p.permission_key = 'identity.distinction.view';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin')
  AND p.permission_key = 'identity.distinction.remove';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin'
  AND p.permission_key = 'identity.distinction.catalogue.manage';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0117_add_identity_distinction_permissions.sql', NOW());

COMMIT;
