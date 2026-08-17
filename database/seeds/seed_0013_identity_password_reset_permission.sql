-- ============================================================================
-- seed_0013_identity_password_reset_permission.sql
-- F-033 remediation: the admin password-reset endpoint
-- (POST /api/v1/membership/admin/users/:userId/reset-password) was gated by
-- membership.application.approve -- a permission scoped to approving
-- PENDING membership applications, not credential administration. That let
-- Coordinator (and Membership Manager) reset any user's password, including
-- users with equal or greater privilege.
--
-- identity.user.reset_password replaces it as the endpoint's guard,
-- granted only to Super Admin / Platform Admin -- same role set as
-- identity.role.assign (seed_0002), the closest existing precedent for
-- administrative authority over another identity's account state.
--
-- Target-user privilege protection (e.g. blocking Platform Admin from
-- resetting Super Admin's password) is explicitly out of scope here --
-- no such rank mechanism exists anywhere in the current RBAC architecture
-- to reuse, and none is introduced by this seed. Deferred as a separate
-- authorization decision.
--
-- Idempotent. Not wired into schema_migrations tracking -- run manually,
-- once, same pattern as seed_0001-seed_0012.
-- ============================================================================
INSERT IGNORE INTO permissions (permission_key, description) VALUES
  ('identity.user.reset_password', 'Reset another user''s password (administrative action)');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin')
  AND p.permission_key = 'identity.user.reset_password';
