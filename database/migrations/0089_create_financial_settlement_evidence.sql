-- ============================================================================
-- 0089_create_financial_settlement_evidence.sql
-- PAY-001 Manual Settlement Foundation (Step 10).
--
-- Settlement Evidence is NOT a PAY-001 canonical entity. It represents
-- "someone claims that payment occurred" -- a mutable, reviewable claim
-- that precedes an authoritative Financial Transaction. It is deliberately
-- generic: it references financial_contributions.id only, never a
-- Membership/Event/Contest-specific FK (Financial Engine independence,
-- PAY-001 §OWNERSHIP RULE).
--
-- Modeled directly on membership_application_documents (migration 0027) --
-- same review_status / reviewed_by_user_id / reviewed_at / review_note
-- shape, same presigned-R2-upload pattern for the optional proof object.
--
-- Append-only submissions: a rejected evidence row is never overwritten.
-- A retry after rejection is a NEW row (review_status = PENDING_REVIEW),
-- preserving full history -- mirrors membership_approval_stages' rejection
-- + re-application pattern (0027).
--
-- No UNIQUE constraint on the reference/UTR column: the same UTR could
-- legitimately recur across unrelated contributions in edge cases the
-- audit could not rule out (e.g. a bank statement reference format that
-- is not globally unique across time). This is flagged as an open
-- question in the Step 10 report rather than silently constrained.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS financial_settlement_evidence (
  id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                    CHAR(36)      NOT NULL,

  -- Generic Financial Engine relationship only -- no business-module FK
  -- (PAY-001 Ownership Rule: the Financial Engine is business-module-agnostic).
  financial_contribution_id BIGINT      NOT NULL,

  -- Member-submitted reference identifier (UTR / bank transaction ID / etc.).
  reference_identifier    VARCHAR(100)  NOT NULL,
  payment_date            DATE          NOT NULL,
  claimed_amount_paise    BIGINT        NOT NULL,

  -- Optional proof upload via the existing presigned-PUT R2 pattern.
  -- Nullable: PAY-001/repository evidence does not require proof to be
  -- mandatory -- the reference identifier is sufficient to test the flow.
  proof_object_key        VARCHAR(512)  NULL,
  proof_mime_type         VARCHAR(100)  NULL,
  proof_size_bytes        BIGINT        NULL,

  submitted_by_user_id    BIGINT        NOT NULL,
  submitted_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  review_status           ENUM('PENDING_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  review_note             VARCHAR(500)  NULL,
  reviewed_by_user_id     BIGINT        NULL,
  reviewed_at             TIMESTAMP     NULL,

  created_at              TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_fse_uuid (uuid),

  CONSTRAINT fk_fse_contribution FOREIGN KEY (financial_contribution_id)
    REFERENCES financial_contributions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fse_submitted_by FOREIGN KEY (submitted_by_user_id)
    REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fse_reviewed_by FOREIGN KEY (reviewed_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL,

  KEY idx_fse_contribution (financial_contribution_id, review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- RBAC: permission for verifying manually-submitted settlement evidence.
-- Follows the exact pattern of 0073 (gallery.spotlight.set).
INSERT IGNORE INTO permissions (permission_key, description)
VALUES ('financial.settlement.verify', 'Approve or reject member-submitted settlement evidence (manual UPI / bank transfer)');

-- Assign to the same administrative roles used for other sensitive admin
-- actions in this repository (0076 pattern: Super Admin, Platform Admin).
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Platform Admin')
  AND p.permission_key = 'financial.settlement.verify';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0089_create_financial_settlement_evidence.sql', NOW());

COMMIT;
