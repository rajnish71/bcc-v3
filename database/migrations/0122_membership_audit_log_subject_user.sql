-- ============================================================================
-- 0122_membership_audit_log_subject_user.sql
--
-- TENURE-ARCH-001 v1.1 WP2 (4/6): membership audit subject-user reference
-- (§16). Ledger and Senior overlay events concern an individual USER, but
-- membership_audit_log is keyed only by a nullable membership_id. This adds a
-- nullable subject_user_id so those events can name the person they concern.
--
--   * nullable; every existing row stays NULL and is not touched;
--   * FK ON DELETE SET NULL, matching the table's existing actor/membership
--     FKs, so historical rows are never blocked or removed;
--   * indexed for subject-user lookup.
--
-- No audit rows are written. No append-only (UPDATE/DELETE) protection is
-- added to membership_audit_log here: that is a separate, domain-wide change
-- outside the WP2 authorization.
--
-- Idempotency: each step runs only if the column / index / FK is absent
-- (information_schema guard + prepared statement; MySQL 8.0 has no
-- ADD COLUMN IF NOT EXISTS). The runner also skips applied files.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

SET @wp2_sql := IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'membership_audit_log' AND column_name = 'subject_user_id') = 0,
  'ALTER TABLE membership_audit_log ADD COLUMN subject_user_id BIGINT NULL AFTER membership_id',
  'DO 0');
PREPARE wp2_stmt FROM @wp2_sql;
EXECUTE wp2_stmt;
DEALLOCATE PREPARE wp2_stmt;

SET @wp2_sql := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'membership_audit_log' AND index_name = 'idx_audit_subject_user') = 0,
  'ALTER TABLE membership_audit_log ADD INDEX idx_audit_subject_user (subject_user_id)',
  'DO 0');
PREPARE wp2_stmt FROM @wp2_sql;
EXECUTE wp2_stmt;
DEALLOCATE PREPARE wp2_stmt;

SET @wp2_sql := IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = 'membership_audit_log'
      AND constraint_name = 'fk_audit_subject_user' AND constraint_type = 'FOREIGN KEY') = 0,
  'ALTER TABLE membership_audit_log ADD CONSTRAINT fk_audit_subject_user FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE SET NULL',
  'DO 0');
PREPARE wp2_stmt FROM @wp2_sql;
EXECUTE wp2_stmt;
DEALLOCATE PREPARE wp2_stmt;

SET @wp2_sql := NULL;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0122_membership_audit_log_subject_user.sql', NOW());

COMMIT;
