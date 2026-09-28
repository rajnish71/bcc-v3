-- ============================================================================
-- 0101_add_financial_audit_view_permission.sql
-- Payment & Authentication Observability Remediation -- OBS-10.
--
-- Follows the exact pattern of 0089/0098: permissions(permission_key,
-- description) + role_permissions via CROSS JOIN on Super Admin/Platform
-- Admin. This permission gates the read-only financial trace API
-- (GET /api/v1/financial/admin/trace) and any other forensic-provenance
-- surface exposing client_ip/user_agent -- ordinary members and holders of
-- the existing financial.settlement.verify permission do not see this data
-- implicitly; the two permissions are independent.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO permissions (permission_key, description)
VALUES ('financial.audit.view', 'View forensic financial/authentication provenance (request/session/IP/User-Agent correlation) via the financial trace API');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin')
  AND p.permission_key = 'financial.audit.view';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0101_add_financial_audit_view_permission.sql', NOW());

COMMIT;
