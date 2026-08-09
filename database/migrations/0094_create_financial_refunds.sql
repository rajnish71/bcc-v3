-- ============================================================================
-- 0094_create_financial_refunds.sql
-- PAY-001 minimum generic refund foundation.
--
-- Needed for the membership payment/approval reconciliation: admin approval
-- is now the FINAL gate for a paid membership application (after the
-- Financial Contribution reaches COMPLETED, not before). If an application
-- that has already been paid is subsequently REJECTED, the platform must
-- have a refund path -- Membership decides a refund is owed; the Financial
-- Engine owns actually processing it (PAY-001 §OWNERSHIP RULE).
--
-- Design:
--   * financial_refunds is a NEW, generic, business-module-agnostic table --
--     no membership-specific column exists here, matching the existing
--     financial_contributions/financial_transactions/receipts pattern.
--   * Exactly one refund row may ever exist per contribution
--     (uq_refund_contribution) -- this IS the idempotency guard: a duplicate
--     refund request for the same contribution returns the existing row
--     instead of creating a second one.
--   * The original financial_transactions row (the SUCCEEDED settlement
--     attempt) is never touched -- PAY-001 Principle 10 (immutable financial
--     history) is preserved; this table is a new, separate, append-only
--     record of the refund itself.
--   * status starts at REQUESTED (durable the moment a refund is decided,
--     before any provider call is attempted) so a refund is never silently
--     lost even if the provider call fails -- FinancialContributionService
--     moves it to PROCESSING/COMPLETED/FAILED as the provider responds.
--   * provider/provider_reference are nullable: populated only once a
--     Settlement Provider is actually contacted. A refund against a
--     manually-settled (non-provider) contribution stays REQUESTED for
--     offline/manual handling -- no invented automatic manual-refund flow.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS financial_refunds (
  id                   BIGINT         AUTO_INCREMENT PRIMARY KEY,
  uuid                 CHAR(36)       NOT NULL,

  contribution_id      BIGINT         NOT NULL,

  amount_paise         BIGINT         NOT NULL,
  currency             CHAR(3)        NOT NULL DEFAULT 'INR',

  -- Settlement Provider contacted for this refund (e.g. 'RAZORPAY'). NULL
  -- until a provider call is actually attempted (e.g. the original
  -- settlement was 'MANUAL' and no automatic provider refund is possible).
  provider             VARCHAR(50)    NULL,
  provider_reference   VARCHAR(200)   NULL,

  status               ENUM(
                          'REQUESTED',
                          'PROCESSING',
                          'COMPLETED',
                          'FAILED'
                        )              NOT NULL DEFAULT 'REQUESTED',

  reason               VARCHAR(500)   NULL,
  failure_reason       VARCHAR(500)   NULL,

  requested_by_user_id BIGINT         NOT NULL,
  requested_at         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at          TIMESTAMP      NULL,

  UNIQUE KEY uq_refund_uuid         (uuid),
  UNIQUE KEY uq_refund_contribution (contribution_id),

  CONSTRAINT fk_refund_contribution FOREIGN KEY (contribution_id)
    REFERENCES financial_contributions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refund_requested_by FOREIGN KEY (requested_by_user_id)
    REFERENCES users(id) ON DELETE RESTRICT

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_refund_status ON financial_refunds (status);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0094_create_financial_refunds.sql', NOW());

COMMIT;
