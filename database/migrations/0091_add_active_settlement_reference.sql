-- ============================================================================
-- 0091_add_active_settlement_reference.sql
-- PAY-001 Step 18 — Settlement Provider order initiation
--
-- Adds the smallest column required to track a Settlement Provider's order
-- reference (e.g. a Razorpay order id) for the CURRENT settlement attempt,
-- BEFORE the outcome of that attempt is known.
--
-- This is deliberately NOT a financial_transactions column: a Financial
-- Transaction represents an already-known, immutable outcome of a
-- Settlement Attempt (PAY-001 Principle 10 -- "no INSERT-PENDING-then-
-- UPDATE path"). Creating a provider order is not an outcome; it is the
-- start of an attempt. active_settlement_reference is the Financial
-- Engine's own record of "which provider order corresponds to the
-- settlement attempt currently in progress" -- provider-agnostic (any
-- future provider requiring the same pre-outcome bookkeeping can use it),
-- generic (no Razorpay-specific column name), and meaningful ONLY while
-- state = 'SETTLEMENT_IN_PROGRESS':
--
--  • Set once, by whichever request first successfully creates a provider
--    order for the current attempt (idempotency: a repeat/duplicate
--    request for the same attempt reuses this value instead of creating a
--    second provider order).
--  • Cleared back to NULL whenever the Contribution leaves
--    SETTLEMENT_IN_PROGRESS (to SETTLED, FAILED or ABANDONED), so a
--    subsequent retry's fresh attempt never inherits a stale reference
--    from a prior, resolved attempt.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE financial_contributions
  ADD COLUMN active_settlement_reference VARCHAR(200) NULL AFTER cancellation_reason;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0091_add_active_settlement_reference.sql', NOW());

COMMIT;
