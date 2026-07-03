-- ============================================================================
-- seed_0002_registration_permissions.sql
-- Permissions gating the two admin-initiated registration methods
-- (ADMIN_CREATED, INVITATION). Idempotent. Not wired into schema_migrations
-- tracking -- run manually, once, same pattern as seed_0001.
--
-- Coordinator gets identity.user.create because spec 01.2 says so verbatim:
-- "Admin-created account (coordinator creates account for a member)".
-- Invitation creation is left to Super Admin / Platform Admin / Coordinator
-- alike -- narrower than user-create was not asked for and would need a
-- governance call, so it mirrors user-create's role set for now; flag if
-- that's too broad.
-- ============================================================================
INSERT IGNORE INTO permissions (permission_key, description) VALUES
  ('identity.user.create',       'Create a platform identity on behalf of another person (admin-created registration)'),
  ('identity.invitation.create', 'Issue an invitation link for invitation-based registration'),
  ('identity.role.assign',       'Grant or revoke an RBAC role on a user'),
  ('identity.role.view',         'View a user''s current RBAC role assignments');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin')
  AND p.permission_key IN ('identity.user.create', 'identity.invitation.create', 'identity.role.assign', 'identity.role.view');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Coordinator'
  AND p.permission_key IN ('identity.user.create', 'identity.invitation.create', 'identity.role.view');
