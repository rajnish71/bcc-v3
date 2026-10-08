-- ============================================================================
-- 0125_add_identity_reconcile_permission.sql
-- IDENTITY-ARCH-001 reconciliation amendment: Duplicate Identity Reconciliation.
--
-- Follows the exact pattern of 0109/0117: permissions(permission_key,
-- description) + role_permissions via CROSS JOIN on roles.name. No new role.
-- No Super Admin bypass: Super Admin holds this key only via the explicit
-- grant below. Gates POST /api/v1/identity/admin/reconcile-duplicate-identity.
--
--   identity.reconcile    Super Admin ONLY
--
-- Do not grant to Platform Admin, Coordinator, Membership Manager or any
-- other role without explicit written instruction.
-- Data only: no schema change (identity_audit_log.action_type is VARCHAR).
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO permissions (permission_key, description)
VALUES ('identity.reconcile',
        'Reconcile a PENDING duplicate identity into its COMPLETE canonical identity (Super Admin only)');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin'
  AND p.permission_key = 'identity.reconcile';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0125_add_identity_reconcile_permission.sql', NOW());

COMMIT;
