-- ============================================================================
-- 0114_add_financial_read_permission_and_financial_authority_role.sql
-- Track 4 -- Admin Financial Visibility (read-only).
--
-- Follows the exact pattern of 0101/0109: permissions(permission_key,
-- description) + role_permissions via CROSS JOIN on roles.name.
--
-- financial.read gates the read-only admin financial visibility API
-- (GET /api/v1/financial/admin/{overview,contributions,refunds,receipts,
-- exceptions,search}) and the Hub "Financial" workspace group. It is
-- independent of financial.settlement.verify (settlement evidence review /
-- provider reconciliation) and financial.audit.view (forensic request/
-- session/IP/User-Agent provenance) -- neither is granted here.
--
-- Financial Authority is a platform RBAC role (MEM-006 P3: RBAC is
-- decoupled from membership). It is NOT a membership class, plan,
-- organizational position, event assignment or volunteer classification.
-- Category SYSTEM, not OPERATIONAL: OPERATIONAL role names are rendered on
-- public photographer profiles (hub-profile.service.ts), and this role
-- must never surface there.
--
-- Granted to Super Admin and Financial Authority ONLY. Do not grant to
-- Coordinator, Platform Admin, Finance Manager, Content Editor, Moderator
-- or any operational role without explicit written instruction.
-- No user is assigned the Financial Authority role by this migration.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO roles (name, category)
VALUES ('Financial Authority', 'SYSTEM');

INSERT IGNORE INTO permissions (permission_key, description)
VALUES ('financial.read', 'Read-only administrative financial visibility (contributions, refunds, receipts, exceptions, search) -- Track 4');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Financial Authority')
  AND p.permission_key = 'financial.read';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0114_add_financial_read_permission_and_financial_authority_role.sql', NOW());

COMMIT;
