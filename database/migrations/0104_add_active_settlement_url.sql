-- ============================================================================
-- 0104_add_active_settlement_url.sql
-- PAY-001 — hosted settlement URL for the current settlement attempt
--
-- Companion to 0091 (active_settlement_reference). Some Settlement Provider
-- mechanisms -- e.g. a Razorpay Payment Link -- produce a hosted URL the
-- payer opens to settle, in addition to the provider reference id. The
-- Financial Engine must persist that URL so a repeated "create link"
-- request for the SAME attempt returns the existing link instead of
-- creating a second, independently payable one (PAY-001 Principle 7).
--
-- Generic and provider-agnostic, exactly like active_settlement_reference:
--  • NOT membership-specific, NOT a family/corporate payments table.
--  • NOT a financial_transactions column -- a hosted link is the start of an
--    attempt, not an outcome (PAY-001 Principle 10).
--  • Meaningful ONLY while state = 'SETTLEMENT_IN_PROGRESS'. Set together
--    with active_settlement_reference, cleared together with it the moment
--    the attempt resolves (SETTLED / FAILED / ABANDONED), so a retry's fresh
--    attempt never inherits a stale, possibly-expired link.
--  • NULL for Checkout (Orders API) attempts, which have no hosted URL --
--    this is also how the engine tells a hosted-link attempt apart from an
--    Orders attempt without parsing provider id prefixes.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE financial_contributions
  ADD COLUMN active_settlement_url VARCHAR(500) NULL AFTER active_settlement_reference;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0104_add_active_settlement_url.sql', NOW());

COMMIT;
