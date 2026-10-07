-- ============================================================================
-- 0119_create_recognized_service_periods.sql
--
-- TENURE-ARCH-001 v1.1 WP2 (1/6): the Recognized Service Ledger (§5).
--
-- One row = one evidence-backed period of an individual's recognized BCC
-- membership service. Tenure is computed ONLY from CURRENT + VERIFIED rows
-- with established continuity, by the WP1 engine
-- (backend/src/modules/membership/tenure). Nothing here evaluates tenure.
--
-- Dates hold the STATED boundary, not the resolved one:
--   EXACT  -> the date;
--   MONTH  -> the 1st of the stated month   (attestation required);
--   YEAR   -> 1 January of the stated year  (attestation required).
-- Resolution (R1: BOUNDARY = certain minimum, PERIOD = full stated period)
-- happens in the engine, never in storage.
--
-- Invariants enforced here:
--   * individual ownership: user_id; an optional membership must be the
--     same user's own INDIVIDUAL membership (group membership never
--     transfers tenure -- MEM-006 v1.1, R2);
--   * evidence/precision consistency and POINT => no continuity (CHECKs);
--   * append-only correction: identity, boundary, evidence, basis, source
--     and supersession fields are immutable; verification moves only out of
--     UNVERIFIED, once; correction_state moves only out of CURRENT, once;
--     a correction is a NEW row whose supersedes_period_id names the old row
--     (same user, at most one direct successor);
--   * no DELETE (trigger) and FK RESTRICT everywhere;
--   * idempotent native capture: at most one original (non-correction) row
--     per (native_source_type, native_source_id).
--
-- Schema only. No rows are written. No writer is wired (WP3/WP7).
-- Triggers: apply with the mysql CLI (DELIMITER) as a user with TRIGGER
-- privilege (prod: sudo mysql bcc_v3 < 0119_create_recognized_service_periods.sql).
--
-- Idempotency: CREATE TABLE IF NOT EXISTS; DROP TRIGGER IF EXISTS /
-- CREATE TRIGGER. The runner skips applied files by filename.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS recognized_service_periods (
  id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id                 BIGINT NOT NULL,
  membership_id           BIGINT NULL,

  start_date              DATE NOT NULL,
  start_precision         ENUM('EXACT','MONTH','YEAR') NOT NULL,
  start_attestation       ENUM('BOUNDARY','PERIOD') NULL,
  end_date                DATE NULL,                    -- NULL = open-ended (ongoing)
  end_precision           ENUM('EXACT','MONTH','YEAR') NULL,
  end_attestation         ENUM('BOUNDARY','PERIOD') NULL,

  evidence_kind           ENUM('BOUNDARY','PERIOD','POINT') NOT NULL,
  continuity_established  TINYINT(1) NOT NULL,
  basis                   ENUM('NATIVE_LIFECYCLE','HISTORICAL_RECONCILIATION','GOVERNANCE_ATTESTATION') NOT NULL,
  native_source_type      VARCHAR(64) NULL,
  native_source_id        BIGINT NULL,
  evidence_reference      VARCHAR(500) NULL,
  evidence_note           TEXT NULL,

  verification_status     ENUM('UNVERIFIED','VERIFIED','REJECTED') NOT NULL DEFAULT 'UNVERIFIED',
  verified_by_user_id     BIGINT NULL,
  verified_at             TIMESTAMP NULL,
  verification_reason     VARCHAR(500) NULL,

  correction_state        ENUM('CURRENT','CORRECTED','SUPERSEDED') NOT NULL DEFAULT 'CURRENT',
  supersedes_period_id    BIGINT NULL,

  established_by_type     ENUM('SYSTEM','ADMIN') NOT NULL,
  established_by_user_id  BIGINT NULL,
  established_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Idempotent native capture: one original row per native source.
  native_capture_lock     VARCHAR(100) GENERATED ALWAYS AS (
                            IF(native_source_type IS NOT NULL AND supersedes_period_id IS NULL,
                               CONCAT(native_source_type, ':', native_source_id), NULL)
                          ) STORED,

  CONSTRAINT fk_rsp_user          FOREIGN KEY (user_id)                REFERENCES users(id)                      ON DELETE RESTRICT,
  CONSTRAINT fk_rsp_membership    FOREIGN KEY (membership_id)          REFERENCES memberships(id)                ON DELETE RESTRICT,
  CONSTRAINT fk_rsp_verified_by   FOREIGN KEY (verified_by_user_id)    REFERENCES users(id)                      ON DELETE RESTRICT,
  CONSTRAINT fk_rsp_established_by FOREIGN KEY (established_by_user_id) REFERENCES users(id)                     ON DELETE RESTRICT,
  CONSTRAINT fk_rsp_supersedes    FOREIGN KEY (supersedes_period_id)   REFERENCES recognized_service_periods(id) ON DELETE RESTRICT,

  -- Stated-boundary encoding and attestation (§6, R1).
  CONSTRAINT chk_rsp_start_attestation CHECK (
    (start_precision = 'EXACT' AND start_attestation IS NULL)
    OR (start_precision IN ('MONTH','YEAR') AND start_attestation IS NOT NULL)),
  CONSTRAINT chk_rsp_start_encoding CHECK (
    (start_precision <> 'MONTH' OR DAY(start_date) = 1)
    AND (start_precision <> 'YEAR' OR (MONTH(start_date) = 1 AND DAY(start_date) = 1))),
  CONSTRAINT chk_rsp_end_shape CHECK (
    (end_date IS NULL AND end_precision IS NULL AND end_attestation IS NULL)
    OR (end_date IS NOT NULL AND end_precision IS NOT NULL)),
  CONSTRAINT chk_rsp_end_attestation CHECK (
    end_precision IS NULL
    OR (end_precision = 'EXACT' AND end_attestation IS NULL)
    OR (end_precision IN ('MONTH','YEAR') AND end_attestation IS NOT NULL)),
  CONSTRAINT chk_rsp_end_encoding CHECK (
    end_date IS NULL
    OR ((end_precision <> 'MONTH' OR DAY(end_date) = 1)
        AND (end_precision <> 'YEAR' OR (MONTH(end_date) = 1 AND DAY(end_date) = 1)))),

  -- POINT evidence never establishes continuity (§5.5, §6.3).
  CONSTRAINT chk_rsp_point_no_continuity CHECK (evidence_kind <> 'POINT' OR continuity_established = 0),
  CONSTRAINT chk_rsp_continuity_bool CHECK (continuity_established IN (0, 1)),

  -- Native source <=> NATIVE_LIFECYCLE basis; type and id together.
  CONSTRAINT chk_rsp_native_source CHECK (
    (basis = 'NATIVE_LIFECYCLE' AND native_source_type IS NOT NULL AND native_source_id IS NOT NULL)
    OR (basis <> 'NATIVE_LIFECYCLE' AND native_source_type IS NULL AND native_source_id IS NULL)),

  -- Verification decision fields.
  CONSTRAINT chk_rsp_verification CHECK (
    (verification_status = 'UNVERIFIED' AND verified_by_user_id IS NULL AND verified_at IS NULL)
    OR (verification_status = 'VERIFIED' AND verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL)
    OR (verification_status = 'REJECTED' AND verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL
        AND verification_reason IS NOT NULL AND TRIM(verification_reason) <> '')),

  CONSTRAINT chk_rsp_established_by CHECK (established_by_type = 'SYSTEM' OR established_by_user_id IS NOT NULL),

  UNIQUE KEY uq_rsp_native_capture (native_capture_lock),
  UNIQUE KEY uq_rsp_supersedes (supersedes_period_id),
  KEY idx_rsp_user_counted (user_id, correction_state, verification_status),
  KEY idx_rsp_membership (membership_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

DROP TRIGGER IF EXISTS trg_rsp_before_insert $$
CREATE TRIGGER trg_rsp_before_insert
BEFORE INSERT ON recognized_service_periods
FOR EACH ROW
BEGIN
  DECLARE v_owner BIGINT;
  DECLARE v_owner_type VARCHAR(20);
  DECLARE v_prior_user BIGINT;

  -- A membership link must be the same individual's own INDIVIDUAL membership.
  IF NEW.membership_id IS NOT NULL THEN
    SELECT user_id, owner_type INTO v_owner, v_owner_type
      FROM memberships WHERE id = NEW.membership_id;
    IF v_owner_type <> 'INDIVIDUAL' OR NOT (v_owner <=> NEW.user_id) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'TENURE-ARCH-001: a service period may reference only the same user''s own INDIVIDUAL membership.';
    END IF;
  END IF;

  -- A correction supersedes a period of the same individual.
  IF NEW.supersedes_period_id IS NOT NULL THEN
    SELECT user_id INTO v_prior_user
      FROM recognized_service_periods WHERE id = NEW.supersedes_period_id;
    IF NOT (v_prior_user <=> NEW.user_id) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'TENURE-ARCH-001: a correction must supersede a period of the same user.';
    END IF;
  END IF;

  -- Rows enter the ledger as CURRENT; state moves only by later correction.
  IF NEW.correction_state <> 'CURRENT' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: a new service period must be CURRENT.';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_rsp_before_update $$
CREATE TRIGGER trg_rsp_before_update
BEFORE UPDATE ON recognized_service_periods
FOR EACH ROW
BEGIN
  IF NOT (NEW.id <=> OLD.id)
     OR NOT (NEW.user_id <=> OLD.user_id)
     OR NOT (NEW.membership_id <=> OLD.membership_id)
     OR NOT (NEW.start_date <=> OLD.start_date)
     OR NOT (NEW.start_precision <=> OLD.start_precision)
     OR NOT (NEW.start_attestation <=> OLD.start_attestation)
     OR NOT (NEW.end_date <=> OLD.end_date)
     OR NOT (NEW.end_precision <=> OLD.end_precision)
     OR NOT (NEW.end_attestation <=> OLD.end_attestation)
     OR NOT (NEW.evidence_kind <=> OLD.evidence_kind)
     OR NOT (NEW.continuity_established <=> OLD.continuity_established)
     OR NOT (NEW.basis <=> OLD.basis)
     OR NOT (NEW.native_source_type <=> OLD.native_source_type)
     OR NOT (NEW.native_source_id <=> OLD.native_source_id)
     OR NOT (NEW.evidence_reference <=> OLD.evidence_reference)
     OR NOT (NEW.evidence_note <=> OLD.evidence_note)
     OR NOT (NEW.supersedes_period_id <=> OLD.supersedes_period_id)
     OR NOT (NEW.established_by_type <=> OLD.established_by_type)
     OR NOT (NEW.established_by_user_id <=> OLD.established_by_user_id)
     OR NOT (NEW.established_at <=> OLD.established_at)
     OR NOT (NEW.created_at <=> OLD.created_at) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: service period boundaries, evidence and provenance are immutable; append a superseding period.';
  END IF;

  -- Verification is decided once, out of UNVERIFIED.
  IF OLD.verification_status <> 'UNVERIFIED'
     AND (NOT (NEW.verification_status <=> OLD.verification_status)
          OR NOT (NEW.verified_by_user_id <=> OLD.verified_by_user_id)
          OR NOT (NEW.verified_at <=> OLD.verified_at)
          OR NOT (NEW.verification_reason <=> OLD.verification_reason)) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: a verification decision is final; correct by appending a superseding period.';
  END IF;

  -- Correction state leaves CURRENT once and never returns.
  IF OLD.correction_state <> 'CURRENT' AND NOT (NEW.correction_state <=> OLD.correction_state) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'TENURE-ARCH-001: a corrected or superseded period cannot change state again.';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_rsp_before_delete $$
CREATE TRIGGER trg_rsp_before_delete
BEFORE DELETE ON recognized_service_periods
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'TENURE-ARCH-001: recognized service periods are append-only and cannot be deleted.';
END $$

DELIMITER ;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0119_create_recognized_service_periods.sql', NOW());

COMMIT;
