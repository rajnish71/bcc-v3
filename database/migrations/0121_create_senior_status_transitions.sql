-- ============================================================================
-- 0121_create_senior_status_transitions.sql
--
-- TENURE-ARCH-001 v1.1 WP2 (3/6): append-only Senior overlay transition
-- history (§12.2 invariant 4, §13, §16).
--
--   AWARDED       NULL    -> ACTIVE   first transition of an AUTO overlay, SYSTEM actor
--   CARRIED_OVER  NULL    -> ACTIVE   first transition of a MANUAL overlay (§14.1)
--   REMOVED       ACTIVE  -> REMOVED  governance removal: ADMIN actor + reason (D1)
--   RESCINDED     REMOVED -> ACTIVE   governance rescission: ADMIN actor + reason;
--                                     restores the same record (R4)
--
-- Every transition references the membership_audit_log row written in the
-- same transaction (NOT NULL, one audit row per transition), so state change
-- and audit stay coupled (§16).
--
-- Chain integrity (trigger): AWARDED / CARRIED_OVER only as an overlay's
-- first transition and matching its provenance; REMOVED / RESCINDED only
-- from the to_status of the overlay's latest transition.
--
-- Append-only: UPDATE and DELETE are refused. FK RESTRICT everywhere.
-- Schema only. No rows are written and no transition workflow exists (WP3+).
-- Triggers: apply with the mysql CLI (DELIMITER) as a user with TRIGGER
-- privilege (prod: sudo mysql bcc_v3 < 0121_create_senior_status_transitions.sql).
--
-- Idempotency: CREATE TABLE IF NOT EXISTS; DROP TRIGGER IF EXISTS /
-- CREATE TRIGGER. The runner skips applied files by filename.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS senior_status_transitions (
  id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
  overlay_id               BIGINT NOT NULL,
  from_status              ENUM('ACTIVE','REMOVED') NULL,
  to_status                ENUM('ACTIVE','REMOVED') NOT NULL,
  transition_type          ENUM('AWARDED','CARRIED_OVER','REMOVED','RESCINDED') NOT NULL,
  actor_type               ENUM('SYSTEM','ADMIN') NOT NULL,
  actor_user_id            BIGINT NULL,
  reason                   VARCHAR(500) NULL,
  occurred_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  membership_audit_log_id  BIGINT NOT NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_sst_overlay FOREIGN KEY (overlay_id)              REFERENCES senior_status_overlays(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sst_actor   FOREIGN KEY (actor_user_id)           REFERENCES users(id)                  ON DELETE RESTRICT,
  CONSTRAINT fk_sst_audit   FOREIGN KEY (membership_audit_log_id) REFERENCES membership_audit_log(id)   ON DELETE RESTRICT,

  CONSTRAINT chk_sst_shape CHECK (
    (transition_type = 'AWARDED'      AND from_status IS NULL     AND to_status = 'ACTIVE'  AND actor_type = 'SYSTEM')
    OR (transition_type = 'CARRIED_OVER' AND from_status IS NULL     AND to_status = 'ACTIVE')
    OR (transition_type = 'REMOVED'      AND from_status = 'ACTIVE'  AND to_status = 'REMOVED' AND actor_type = 'ADMIN')
    OR (transition_type = 'RESCINDED'    AND from_status = 'REMOVED' AND to_status = 'ACTIVE'  AND actor_type = 'ADMIN')),
  CONSTRAINT chk_sst_governance_reason CHECK (
    transition_type NOT IN ('REMOVED','RESCINDED') OR (reason IS NOT NULL AND TRIM(reason) <> '')),
  CONSTRAINT chk_sst_admin_actor CHECK (actor_type <> 'ADMIN' OR actor_user_id IS NOT NULL),

  UNIQUE KEY uq_sst_audit (membership_audit_log_id),
  KEY idx_sst_overlay (overlay_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_sst_before_insert $$
CREATE TRIGGER trg_sst_before_insert
BEFORE INSERT ON senior_status_transitions
FOR EACH ROW
BEGIN
  DECLARE v_provenance VARCHAR(10);
  DECLARE v_prior_count INT;
  DECLARE v_last_to VARCHAR(10);

  SELECT provenance INTO v_provenance FROM senior_status_overlays WHERE id = NEW.overlay_id;
  SELECT COUNT(*) INTO v_prior_count FROM senior_status_transitions WHERE overlay_id = NEW.overlay_id;

  IF NEW.transition_type IN ('AWARDED','CARRIED_OVER') THEN
    IF v_prior_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'TENURE-ARCH-001: AWARDED / CARRIED_OVER may only be an overlay''s first transition.';
    END IF;
    IF (NEW.transition_type = 'AWARDED' AND NOT (v_provenance <=> 'AUTO'))
       OR (NEW.transition_type = 'CARRIED_OVER' AND NOT (v_provenance <=> 'MANUAL')) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'TENURE-ARCH-001: AWARDED requires an AUTO overlay; CARRIED_OVER requires a MANUAL overlay.';
    END IF;
  ELSE
    SELECT to_status INTO v_last_to
      FROM senior_status_transitions
     WHERE overlay_id = NEW.overlay_id
     ORDER BY id DESC
     LIMIT 1;
    IF NOT (v_last_to <=> NEW.from_status) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'TENURE-ARCH-001: a REMOVED / RESCINDED transition must start from the overlay''s current recorded status.';
    END IF;
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_sst_before_update $$
CREATE TRIGGER trg_sst_before_update
BEFORE UPDATE ON senior_status_transitions
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'TENURE-ARCH-001: Senior status transitions are append-only.';
END $$

DROP TRIGGER IF EXISTS trg_sst_before_delete $$
CREATE TRIGGER trg_sst_before_delete
BEFORE DELETE ON senior_status_transitions
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'TENURE-ARCH-001: Senior status transitions are append-only.';
END $$

DELIMITER ;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0121_create_senior_status_transitions.sql', NOW());

COMMIT;
