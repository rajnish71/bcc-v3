-- ============================================================================
-- 0124_rescope_recognition_active_lock.sql
--
-- TENURE-ARCH-001 v1.1 WP2 (6/6, applied LAST): rescope the Single Active
-- Recognition lock to Recognition Classes only.
--
-- MEM-006 v1.1 Amendment 001: the Single Active Recognition Rule applies to
-- Recognition Classes only; Senior Member is a Status Overlay and does not
-- take the slot. Until now member_recognitions.active_lock gave every ACTIVE
-- row -- including legacy SENIOR_MEMBER rows -- the one-per-membership slot
-- (§19 #7).
--
--   before: IF(status = 'ACTIVE', membership_id, NULL)
--   after:  IF(status = 'ACTIVE' AND recognition_code <> 'SENIOR_MEMBER', membership_id, NULL)
--
-- uq_one_active_recognition (UNIQUE on active_lock) is unchanged and keeps
-- enforcing at most one ACTIVE Recognition Class per membership.
--
-- Effect on existing rows: only the derived active_lock value of ACTIVE
-- SENIOR_MEMBER rows becomes NULL (explicitly authorized). No recorded
-- column changes; the SENIOR_MEMBER enum value is kept; no row is added or
-- removed. ALTER TABLE rebuilds the stored generated column without firing
-- the 0123 legacy guard triggers.
--
-- Idempotency: re-running the MODIFY produces the same definition.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE member_recognitions
  MODIFY COLUMN active_lock BIGINT
    GENERATED ALWAYS AS (IF(status = 'ACTIVE' AND recognition_code <> 'SENIOR_MEMBER', membership_id, NULL)) STORED;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0124_rescope_recognition_active_lock.sql', NOW());

COMMIT;
