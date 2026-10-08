-- ============================================================================
-- scripts/tools/tenure/wp2-rollback.sql
--
-- TENURE-ARCH-001 v1.1 WP2 -- controlled EMERGENCY rollback of migrations
-- 0119-0124, while the WP2 tables are still empty.
--
-- This is the exact reverse sequence scratch-tested on 2026-10-08 against a
-- disposable MySQL 8.0 database built from production's pre-WP2 DDL, after
-- all six migrations had been applied. Result: member_recognitions and
-- membership_audit_log DDL (including the active_lock generation expression)
-- identical to production pre-WP2; recognition and audit rows byte-identical;
-- the three WP2 tables, the 0123 triggers and the six schema_migrations rows
-- removed.
--
-- PRECONDITIONS -- all must hold, or do NOT run this file:
--   1. recognized_service_periods, senior_status_overlays and
--      senior_status_transitions are EMPTY (no WP3/WP4 data written).
--      Dropping them is the only way to remove rows (their triggers refuse
--      DELETE), so once WP2 append-only history exists this rollback would
--      destroy it. It is NOT safe after population unless a separately
--      authorized, data-preserving procedure exists.
--   2. No membership holds more than one ACTIVE recognition. Restoring the
--      old active_lock is REFUSED (duplicate key on uq_one_active_recognition)
--      if a Senior holder also holds an ACTIVE Honorary -- tested. The
--      accepted containment rule (no Honorary assignment to the eight Senior
--      holders until WP5) keeps this true.
--   3. Production application compatibility has been checked: the deployed
--      code must not read or write the WP2 tables or
--      membership_audit_log.subject_user_id. (Through WP2 nothing does.)
--   4. A pre-rollback snapshot exists: run wp2-production-snapshot.sql and the
--      mysqldump command in its header first.
--
-- EXECUTION -- privileged MySQL, like the WP2 trigger migrations (the
-- application migration user lacks the trigger privileges; production runs
-- binlog with log_bin_trust_function_creators = 0):
--   1. Run the precondition queries below; every count must be 0.
--   2. sudo mysql bcc_v3 < scripts/tools/tenure/wp2-rollback.sql
--   3. Re-run wp2-production-snapshot.sql and compare with the pre-WP2 capture.
-- DDL commits implicitly; if a step fails, stop and investigate before
-- re-running (every step is safe to repeat except the DROP FOREIGN KEY /
-- DROP COLUMN pair once already applied).
-- ============================================================================

SET NAMES utf8mb4;

-- ── Preconditions (read-only; every value must be 0) ────────────────────────
SELECT
  (SELECT COUNT(*) FROM recognized_service_periods) AS rsp_rows,
  (SELECT COUNT(*) FROM senior_status_overlays)     AS overlay_rows,
  (SELECT COUNT(*) FROM senior_status_transitions)  AS transition_rows,
  (SELECT COUNT(*) FROM (SELECT membership_id FROM member_recognitions
                          WHERE status = 'ACTIVE' GROUP BY membership_id
                         HAVING COUNT(*) > 1) AS d) AS memberships_with_two_active;

-- ── 1. 0124: restore the pre-WP2 active_lock expression ─────────────────────
ALTER TABLE member_recognitions
  MODIFY COLUMN active_lock BIGINT GENERATED ALWAYS AS (IF(status = 'ACTIVE', membership_id, NULL)) STORED;

-- ── 2. 0123: drop the legacy Senior guard triggers ──────────────────────────
DROP TRIGGER IF EXISTS trg_recognition_senior_legacy_insert;
DROP TRIGGER IF EXISTS trg_recognition_senior_legacy_update;
DROP TRIGGER IF EXISTS trg_recognition_senior_legacy_delete;

-- ── 3. 0122: remove membership_audit_log.subject_user_id (FK, index, column)
ALTER TABLE membership_audit_log DROP FOREIGN KEY fk_audit_subject_user;
ALTER TABLE membership_audit_log DROP INDEX idx_audit_subject_user, DROP COLUMN subject_user_id;

-- ── 4-6. 0121, 0120, 0119: drop the WP2 tables (their triggers go with them)
DROP TABLE IF EXISTS senior_status_transitions;
DROP TABLE IF EXISTS senior_status_overlays;
DROP TABLE IF EXISTS recognized_service_periods;

-- ── 7. Remove the WP2 schema_migrations records ─────────────────────────────
DELETE FROM schema_migrations WHERE filename IN (
  '0119_create_recognized_service_periods.sql',
  '0120_create_senior_status_overlays.sql',
  '0121_create_senior_status_transitions.sql',
  '0122_membership_audit_log_subject_user.sql',
  '0123_guard_legacy_senior_recognitions.sql',
  '0124_rescope_recognition_active_lock.sql');
