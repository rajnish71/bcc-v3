-- ============================================================================
-- 0120_create_senior_status_overlays.sql
--
-- TENURE-ARCH-001 v1.1 WP2 (2/6): the Senior Member Status Overlay (§12).
--
-- MEM-006 v1.1: Senior Member is a Status Overlay keyed to the individual
-- USER -- not a Recognition Class, not a membership row, not a
-- member_recognitions row. It does not participate in the Single Active
-- Recognition Rule and coexists with any Recognition Class.
--
-- One overlay record per user (UNIQUE user_id); status ACTIVE / REMOVED.
--   AUTO   -- engine award: achieved_date, eligibility_date and an immutable
--             qualification snapshot are required; no legacy reference;
--             eligibility_date <= achieved_date (no backdating, R5D).
--   MANUAL -- carried pre-existing governance record (§14.1): must reference
--             a legacy member_recognitions row with recognition_code =
--             SENIOR_MEMBER AND track = MANUAL belonging to the same user;
--             achieved_date and the snapshot may stay NULL and are never
--             invented. Honorary rows (even with Senior wording in their
--             reason) can never qualify.
--
-- Immutable once written: user, provenance, achieved_date, eligibility_date,
-- qualification snapshot (NULL stays NULL), source evaluation, legacy
-- reference, legacy recording date. historical_achievement_date may be set
-- once from NULL when independently evidenced. Only status moves
-- (ACTIVE <-> REMOVED, recorded in senior_status_transitions). Rows enter as
-- ACTIVE (AWARDED / CARRIED_OVER) and are never deleted.
--
-- qualification_snapshot is TEXT holding JSON (CLAUDE.md §5.7: mysql2 would
-- auto-parse a JSON column), validated with JSON_VALID.
--
-- Schema only. No overlay rows are created; the 8 legacy MANUAL Senior rows
-- (member_recognitions 8-15) are NOT carried over here (WP4).
-- Triggers: apply with the mysql CLI (DELIMITER) as a user with TRIGGER
-- privilege (prod: sudo mysql bcc_v3 < 0120_create_senior_status_overlays.sql).
--
-- Idempotency: CREATE TABLE IF NOT EXISTS; DROP TRIGGER IF EXISTS /
-- CREATE TRIGGER. The runner skips applied files by filename.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS senior_status_overlays (
  id                           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id                      BIGINT NOT NULL,
  status                       ENUM('ACTIVE','REMOVED') NOT NULL,
  provenance                   ENUM('AUTO','MANUAL') NOT NULL,
  achieved_date                DATE NULL,
  historical_achievement_date  DATE NULL,
  eligibility_date             DATE NULL,
  qualification_snapshot       TEXT NULL,
  source_evaluation_ref        VARCHAR(100) NULL,
  legacy_recognition_id        BIGINT NULL,
  legacy_recording_date        DATE NULL,
  created_at                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_sso_user               FOREIGN KEY (user_id)               REFERENCES users(id)               ON DELETE RESTRICT,
  CONSTRAINT fk_sso_legacy_recognition FOREIGN KEY (legacy_recognition_id) REFERENCES member_recognitions(id) ON DELETE RESTRICT,

  CONSTRAINT chk_sso_auto CHECK (
    provenance <> 'AUTO'
    OR (achieved_date IS NOT NULL AND eligibility_date IS NOT NULL AND qualification_snapshot IS NOT NULL
        AND legacy_recognition_id IS NULL AND legacy_recording_date IS NULL)),
  CONSTRAINT chk_sso_manual CHECK (provenance <> 'MANUAL' OR legacy_recognition_id IS NOT NULL),
  CONSTRAINT chk_sso_no_backdating CHECK (
    achieved_date IS NULL OR eligibility_date IS NULL OR eligibility_date <= achieved_date),
  CONSTRAINT chk_sso_snapshot_json CHECK (qualification_snapshot IS NULL OR JSON_VALID(qualification_snapshot)),

  UNIQUE KEY uq_sso_user (user_id),
  UNIQUE KEY uq_sso_legacy_recognition (legacy_recognition_id),
  KEY idx_sso_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_sso_before_insert $$
CREATE TRIGGER trg_sso_before_insert
BEFORE INSERT ON senior_status_overlays
FOR EACH ROW
BEGIN
  DECLARE v_code VARCHAR(40);
  DECLARE v_track VARCHAR(10);
  DECLARE v_owner BIGINT;

  IF NEW.status <> 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: a Senior overlay is created ACTIVE (AWARDED or CARRIED_OVER).';
  END IF;

  IF NEW.provenance = 'MANUAL' THEN
    SELECT mr.recognition_code, mr.track, m.user_id INTO v_code, v_track, v_owner
      FROM member_recognitions mr
      JOIN memberships m ON m.id = mr.membership_id
     WHERE mr.id = NEW.legacy_recognition_id;
    IF NOT (v_code <=> 'SENIOR_MEMBER') OR NOT (v_track <=> 'MANUAL') OR NOT (v_owner <=> NEW.user_id) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'TENURE-ARCH-001: a MANUAL Senior overlay must carry the same user''s legacy SENIOR_MEMBER MANUAL recognition.';
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_sso_before_update $$
CREATE TRIGGER trg_sso_before_update
BEFORE UPDATE ON senior_status_overlays
FOR EACH ROW
BEGIN
  IF NOT (NEW.id <=> OLD.id)
     OR NOT (NEW.user_id <=> OLD.user_id)
     OR NOT (NEW.provenance <=> OLD.provenance)
     OR NOT (NEW.achieved_date <=> OLD.achieved_date)
     OR NOT (NEW.eligibility_date <=> OLD.eligibility_date)
     OR NOT (NEW.qualification_snapshot <=> OLD.qualification_snapshot)
     OR NOT (NEW.source_evaluation_ref <=> OLD.source_evaluation_ref)
     OR NOT (NEW.legacy_recognition_id <=> OLD.legacy_recognition_id)
     OR NOT (NEW.legacy_recording_date <=> OLD.legacy_recording_date)
     OR NOT (NEW.created_at <=> OLD.created_at) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: Senior overlay provenance, dates, snapshot and legacy reference are immutable.';
  END IF;

  IF OLD.historical_achievement_date IS NOT NULL
     AND NOT (NEW.historical_achievement_date <=> OLD.historical_achievement_date) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: an established historical achievement date is immutable.';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_sso_before_delete $$
CREATE TRIGGER trg_sso_before_delete
BEFORE DELETE ON senior_status_overlays
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'TENURE-ARCH-001: Senior overlays are never deleted; removal is a governed status transition.';
END $$

DELIMITER ;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0120_create_senior_status_overlays.sql', NOW());

COMMIT;
