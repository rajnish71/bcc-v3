-- ============================================================================
-- 0088_create_financial_engine.sql
-- PAY-001 Financial Contribution & Transaction Architecture — Foundation
--
-- Supersedes the 0023_create_payments_and_pending_payment.sql placeholder.
-- The 0023 migration header itself stated its fields were "Module 11
-- (Financial — Core) scope" and expected to be altered when that module was
-- built. Verified before authoring: no application code has ever inserted
-- into payments (repository audit, Step 2 analysis). All memberships rows
-- carry pending_payment_id = NULL.
--
-- CHANGES IN THIS MIGRATION
--
-- 1. CREATE financial_contributions  — canonical PAY-001 Financial Contribution
--    with the full 10-state lifecycle. Generic business-module reference; no
--    membership-specific FK. Zero-value amounts are valid (PAY-001 §12).
--
-- 2. CREATE financial_transactions   — immutable, append-only per-attempt
--    settlement records. One Contribution may produce multiple Transactions.
--    No updated_at column: absence signals immutability at schema level.
--    Application code must never UPDATE rows in this table (PAY-001 §10).
--
-- 3. CREATE receipts                 — platform-issued receipts after a
--    Contribution reaches COMPLETED state. Platform-assigned receipt_number.
--    PAY-001 Principle 8: receipts belong to the platform, not the provider.
--
-- 4. ALTER memberships               — rename pending_payment_id →
--    pending_contribution_id and rewire FK to financial_contributions.id.
--
-- 5. DROP payments                   — obsolete placeholder removed. Its
--    outgoing FKs (to memberships and users) drop with the table. The
--    incoming FK from memberships was removed in step 4.
--
-- MONEY: all amounts stored as integer paise (1 INR = 100 paise).
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- ── 1. financial_contributions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS financial_contributions (
  id                    BIGINT           AUTO_INCREMENT PRIMARY KEY,
  uuid                  CHAR(36)         NOT NULL,

  -- Payer identity. RESTRICT prevents user row deletion while contributions
  -- exist; the platform soft-deletes users via deleted_at in practice.
  payer_user_id         BIGINT           NOT NULL,

  -- Generic business-module reference. DB-level referential integrity across
  -- multiple business tables is not possible; integrity is enforced at the
  -- application layer (PAY-001 ownership rule).
  business_module       VARCHAR(50)      NOT NULL,   -- 'MEMBERSHIP', 'EVENT', …
  business_reference_id BIGINT           NOT NULL,   -- PK in that module's table

  -- Human-readable description of the obligation (set by Business Module).
  purpose               VARCHAR(200)     NOT NULL,

  -- Amount in integer paise. Zero is valid per PAY-001 Principle 12.
  amount_paise          BIGINT           NOT NULL,
  currency              CHAR(3)          NOT NULL DEFAULT 'INR',

  -- PAY-001 full 10-state lifecycle.
  state                 ENUM(
                          'CREATED',
                          'AWAITING_SETTLEMENT',
                          'SETTLEMENT_IN_PROGRESS',
                          'SETTLED',
                          'COMPLETED',
                          'FAILED',
                          'CANCELLED',
                          'EXPIRED',
                          'ABANDONED',
                          'REFUNDED'
                        )                NOT NULL DEFAULT 'CREATED',

  -- Idempotency key — mandatory, unique, supplied by the Business Module.
  -- A deterministic key per obligation prevents duplicate contributions for
  -- the same business event (PAY-001 Principle 7).
  idempotency_key       VARCHAR(100)     NOT NULL,

  -- Optional expiry deadline. Policy is the Business Module's responsibility;
  -- expiry processing belongs to the Financial Engine (PAY-001 §STATE OWNERSHIP).
  expires_at            TIMESTAMP        NULL DEFAULT NULL,

  -- Populated when state transitions to CANCELLED.
  cancellation_reason   VARCHAR(500)     NULL,

  created_at            TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_fc_uuid            (uuid),
  UNIQUE KEY uq_fc_idempotency_key (idempotency_key),

  CONSTRAINT fk_fc_payer FOREIGN KEY (payer_user_id)
    REFERENCES users(id) ON DELETE RESTRICT

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_fc_payer        ON financial_contributions (payer_user_id);
CREATE INDEX idx_fc_business_ref ON financial_contributions (business_module, business_reference_id);
CREATE INDEX idx_fc_state        ON financial_contributions (state);

-- ── 2. financial_transactions ────────────────────────────────────────────────
-- Immutable, append-only per-attempt settlement records.
-- PAY-001 Principle 10: "Financial Transactions shall never be modified after
-- creation." The absence of updated_at signals this intent at the schema level.

CREATE TABLE IF NOT EXISTS financial_transactions (
  id                   BIGINT         AUTO_INCREMENT PRIMARY KEY,
  uuid                 CHAR(36)       NOT NULL,

  contribution_id      BIGINT         NOT NULL,

  -- Settlement Provider for this attempt. A VARCHAR rather than an ENUM so
  -- new providers require no schema alteration (PAY-001 Principle 17).
  provider             VARCHAR(50)    NOT NULL,  -- 'RAZORPAY', 'MANUAL', 'ZERO_VALUE', …

  -- Provider-side reference — external identifier only.
  -- PAY-001 Principle 14: platform identity is the authoritative record.
  -- NULL for manual/offline/zero-value settlements.
  provider_reference   VARCHAR(200)   NULL,

  amount_paise         BIGINT         NOT NULL,
  currency             CHAR(3)        NOT NULL DEFAULT 'INR',

  -- Outcome of this individual settlement attempt.
  outcome              ENUM(
                         'PENDING',
                         'SUCCEEDED',
                         'FAILED',
                         'ABANDONED'
                       )              NOT NULL DEFAULT 'PENDING',

  -- Failure message from provider; NULL on success.
  failure_reason       VARCHAR(500)   NULL,

  -- Immutable creation timestamp. No updated_at by design (PAY-001 §10).
  created_at           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_ft_uuid (uuid),

  CONSTRAINT fk_ft_contribution FOREIGN KEY (contribution_id)
    REFERENCES financial_contributions(id) ON DELETE RESTRICT

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_ft_contribution ON financial_transactions (contribution_id);
CREATE INDEX idx_ft_outcome      ON financial_transactions (outcome);

-- ── 3. receipts ──────────────────────────────────────────────────────────────
-- Platform-issued receipt after a Contribution reaches COMPLETED state.
-- PAY-001 Principle 8: "Receipts belong to the BCC Unified Platform."
-- Exactly one receipt per completed Contribution (UNIQUE on contribution_id).
-- Provider receipts (Razorpay payment IDs, etc.) stay on financial_transactions.

CREATE TABLE IF NOT EXISTS receipts (
  id                   BIGINT         AUTO_INCREMENT PRIMARY KEY,
  uuid                 CHAR(36)       NOT NULL,

  contribution_id      BIGINT         NOT NULL,

  -- Platform-assigned receipt number (format governed by operational
  -- configuration per PAY-001 §OPERATIONAL CONFIGURATION). Unique at DB level.
  receipt_number       VARCHAR(50)    NOT NULL,

  amount_paise         BIGINT         NOT NULL,
  currency             CHAR(3)        NOT NULL DEFAULT 'INR',

  issued_at            TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_receipt_uuid         (uuid),
  UNIQUE KEY uq_receipt_contribution (contribution_id),
  UNIQUE KEY uq_receipt_number       (receipt_number),

  CONSTRAINT fk_receipt_contribution FOREIGN KEY (contribution_id)
    REFERENCES financial_contributions(id) ON DELETE RESTRICT

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. Reconcile memberships.pending_payment_id → pending_contribution_id ────
-- Drop the FK that pointed to the obsolete payments table.
-- All existing pending_payment_id values are NULL (verified by audit).

ALTER TABLE memberships
  DROP FOREIGN KEY fk_membership_pending_payment;

ALTER TABLE memberships
  RENAME COLUMN pending_payment_id TO pending_contribution_id;

ALTER TABLE memberships
  ADD CONSTRAINT fk_membership_pending_contribution
    FOREIGN KEY (pending_contribution_id)
    REFERENCES financial_contributions(id) ON DELETE SET NULL;

-- ── 5. Drop obsolete payments placeholder ────────────────────────────────────
-- The outgoing FKs on payments (to memberships and users) are ON the payments
-- table and are removed automatically when the table is dropped. The incoming
-- FK from memberships was removed in step 4 above, so no FK remains pointing
-- at payments.id.

DROP TABLE payments;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0088_create_financial_engine.sql', NOW());

COMMIT;
