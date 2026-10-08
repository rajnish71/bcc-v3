-- ============================================================================
-- 0123_guard_legacy_senior_recognitions.sql
--
-- TENURE-ARCH-001 v1.1 WP2 (5/6): database guard for the legacy
-- member_recognitions SENIOR_MEMBER representation.
--
-- Senior is a Status Overlay (MEM-006 v1.1); the legacy recognition-based
-- representation is non-conforming (§19 #6) and was contained at the
-- application layer by WP0 (SENIOR_LEGACY_PATHWAY_CONTAINED). This adds the
-- same boundary in the database, for any writer:
--
--   * no new SENIOR_MEMBER row may be inserted;
--   * no row may be changed into, out of, or within SENIOR_MEMBER -- the
--     existing legacy Senior rows (the 8 protected MANUAL records, ids 8-15
--     in production) are frozen exactly as recorded;
--   * no SENIOR_MEMBER row may be deleted.
--
-- Reads are unaffected. Non-Senior recognitions (Honorary classes) keep
-- working exactly as before. There is no session bypass: MANUAL carry-over
-- (WP4) only READS these rows and references them from
-- senior_status_overlays; any later approved change to the legacy rows must
-- redefine these triggers in its own reviewed migration.
--
-- No data is read or changed.
-- Triggers: apply with the mysql CLI (DELIMITER) as a user with TRIGGER
-- privilege (prod: sudo mysql bcc_v3 < 0123_guard_legacy_senior_recognitions.sql).
--
-- Idempotency: DROP TRIGGER IF EXISTS / CREATE TRIGGER.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_recognition_senior_legacy_insert $$
CREATE TRIGGER trg_recognition_senior_legacy_insert
BEFORE INSERT ON member_recognitions
FOR EACH ROW
BEGIN
  IF NEW.recognition_code = 'SENIOR_MEMBER' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: SENIOR_MEMBER is a Status Overlay; new legacy SENIOR_MEMBER recognitions cannot be created.';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_recognition_senior_legacy_update $$
CREATE TRIGGER trg_recognition_senior_legacy_update
BEFORE UPDATE ON member_recognitions
FOR EACH ROW
BEGIN
  IF OLD.recognition_code = 'SENIOR_MEMBER' OR NEW.recognition_code = 'SENIOR_MEMBER' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: legacy SENIOR_MEMBER recognitions are frozen and cannot be modified.';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_recognition_senior_legacy_delete $$
CREATE TRIGGER trg_recognition_senior_legacy_delete
BEFORE DELETE ON member_recognitions
FOR EACH ROW
BEGIN
  IF OLD.recognition_code = 'SENIOR_MEMBER' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: legacy SENIOR_MEMBER recognitions cannot be deleted.';
  END IF;
END $$

DELIMITER ;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0123_guard_legacy_senior_recognitions.sql', NOW());

COMMIT;
