-- ============================================================================
-- 0110_membership_renewal_operations.sql
--
-- Release 1 -- Individual Membership Renewal (frozen HA governance).
--
-- 1. membership_renewal_operations: one row per self-service RENEWAL or
--    administrative REINSTATEMENT operation on an EXISTING membership row.
--    It is the term-provenance record (previous term, new term, source PAY-001
--    Contribution, funded value, status). It never creates or numbers a
--    membership; "pending renewal" is an OPERATION status here, never a
--    membership lifecycle state.
--      open_lock  -- at most ONE open (REQUESTED / PROOF_REQUIRED /
--                    AWAITING_PAYMENT) operation per membership; concurrent
--                    requests collide on this UNIQUE key (same generated
--                    column pattern as member_recognitions.active_lock, 0005).
--      term_key   -- at most ONE renewal operation per renewal term
--                    (RENEWAL-{membershipId}-{previous term end}); NULL for
--                    reinstatement (re-requestable after an admin rejection).
--
-- 2. membership_application_documents.renewal_operation_id: Student
--    eligibility proof uploaded for a specific renewal operation (NULL for
--    every existing application document -- unchanged behaviour).
--
-- 3. class_entitlements renewal_window_days = 45 for the three Release 1
--    classes (configuration, not code; MEM-008 "Configurable"). The Student
--    proof requirement key (renewal_required_document_types) is deliberately
--    NOT seeded: MEM-008 says proof "may be requested" -- an administrator
--    enables it via the class entitlements endpoint.
--
-- Idempotency
--   CREATE TABLE IF NOT EXISTS; ADD COLUMN IF NOT EXISTS is not available for
--   FK columns in MySQL 8.0, so the ALTER is not re-runnable (fails loudly);
--   INSERT IGNORE on the uq (membership_class_id, entitlement_key) key.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS membership_renewal_operations (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                 CHAR(36) NOT NULL UNIQUE,
  membership_id        BIGINT NOT NULL,
  user_id              BIGINT NOT NULL,
  membership_class_id  INT NOT NULL,
  operation_type       ENUM('RENEWAL','REINSTATEMENT') NOT NULL,
  status               ENUM('REQUESTED','PROOF_REQUIRED','AWAITING_PAYMENT','APPLIED',
                            'REJECTED','EXPIRED','BLOCKED') NOT NULL,

  previous_term_start  DATETIME NULL,
  previous_term_end    DATETIME NULL,
  new_term_start       DATETIME NULL,
  new_term_end         DATETIME NULL,

  contribution_id      BIGINT NULL,
  funded_amount_paise  INT NULL,

  consent_log_id       BIGINT NULL,
  terms_version        VARCHAR(50) NULL,

  decided_by_user_id   BIGINT NULL,
  decision_note        VARCHAR(500) NULL,
  decided_at           DATETIME NULL,
  applied_at           DATETIME NULL,

  term_key             VARCHAR(80) NULL,
  open_lock            BIGINT GENERATED ALWAYS AS
                         (IF(status IN ('REQUESTED','PROOF_REQUIRED','AWAITING_PAYMENT'), membership_id, NULL)) STORED,

  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_renewal_op_membership FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE RESTRICT,
  CONSTRAINT fk_renewal_op_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,

  UNIQUE KEY uq_renewal_op_open (open_lock),
  UNIQUE KEY uq_renewal_op_term (term_key),
  KEY idx_renewal_op_membership (membership_id),
  KEY idx_renewal_op_contribution (contribution_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE membership_application_documents
  ADD COLUMN renewal_operation_id BIGINT NULL AFTER membership_id,
  ADD KEY idx_app_docs_renewal_op (renewal_operation_id);

INSERT IGNORE INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
SELECT id, 'renewal_window_days', '45'
FROM membership_classes
WHERE code IN ('STUDENT_MEMBER', 'INDIVIDUAL_MEMBER', 'INDIVIDUAL_BIENNIAL');

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0110_membership_renewal_operations.sql', NOW());

COMMIT;
