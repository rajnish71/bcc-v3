-- ============================================================================
-- 0068_seed_class_entitlements.sql
-- Promotes the renewal entitlement seed from seed_0004_entitlement_recognition_renewal.sql
-- into a tracked migration so it is applied automatically on all environments.
--
-- WITHOUT this data, MembershipLifecycleService.computeExpiry() throws:
--   ConflictException: "Basic Member" is renewable but has no
--   renewal_term_months configured — refusing to activate with an undefined term.
--   Run seed_0004 or set it via the entitlements endpoint.
--
-- This means every admin attempt to activate a BASIC / FULL / STUDENT /
-- INDIVIDUAL membership fails, memberships remain PENDING or APPROVED, and
-- isActiveMember() always returns false → 403 on photo upload.
--
-- Idempotent: INSERT IGNORE silently skips rows that already exist (i.e. on
-- environments where seed_0004 was run manually).
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- 12-month renewal term for every renewable class
INSERT IGNORE INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
SELECT mc.id, 'renewal_term_months', '12'
FROM membership_classes mc
WHERE mc.is_renewable = 1;

-- 60-day grace period for every renewable class
INSERT IGNORE INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
SELECT mc.id, 'grace_period_days', '60'
FROM membership_classes mc
WHERE mc.is_renewable = 1;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0068_seed_class_entitlements.sql', NOW());

COMMIT;
