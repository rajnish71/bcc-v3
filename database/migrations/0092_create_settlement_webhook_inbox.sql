-- ============================================================================
-- 0092_create_settlement_webhook_inbox.sql
-- PAY-001 Step 19 — Settlement Provider webhook ingestion (Razorpay)
--
-- settlement_webhook_inbox is the durable INBOUND counterpart to
-- financial_event_outbox (migration 0090), which is OUTBOUND only. Do not
-- combine them:
--
--   Razorpay -> webhook -> settlement_webhook_inbox   (this table)
--   Financial Engine -> financial_event_outbox         (0090, unchanged)
--
-- Each row represents ONE verified Settlement Provider webhook delivery.
-- Rows are only ever written AFTER signature verification succeeds --
-- this table is never used to record an unverified/rejected request.
--
-- Deduplication (Razorpay may redeliver the same event): the UNIQUE key on
-- (provider, provider_event_id) is the durable idempotency guard for the
-- inbox layer -- a redelivered event fails to INSERT a second row and the
-- existing row is consulted instead. Provider-generic naming so a future
-- Settlement Provider's webhook can reuse this same table without a new
-- migration.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS settlement_webhook_inbox (
  id                  BIGINT         AUTO_INCREMENT PRIMARY KEY,

  -- Settlement Provider tag, e.g. 'RAZORPAY' (financial_transactions.provider
  -- uses the same values -- see razorpay-settlement.provider.ts).
  provider            VARCHAR(30)    NOT NULL,

  -- Provider's own unique event identifier (Razorpay: X-Razorpay-Event-Id
  -- header). The durable redelivery-dedup key, together with `provider`.
  provider_event_id   VARCHAR(100)   NOT NULL,

  -- Provider's event type, e.g. 'payment.captured', 'payment.failed'.
  -- VARCHAR rather than ENUM so a new event type never requires a schema
  -- migration -- most event types are received and acknowledged without
  -- being acted on (see HANDLED_EVENT_TYPES in razorpay-webhook.service.ts).
  event_type          VARCHAR(60)    NOT NULL,

  -- Full verified webhook body, retained for investigation/reprocessing.
  -- mysql2 auto-parses JSON columns -- application code must never call
  -- JSON.parse() on a value read from this column (CLAUDE.md §5.7).
  payload              JSON          NOT NULL,

  -- Resolved once this event is matched to a Financial Contribution via
  -- financial_contributions.active_settlement_reference. Persisted BEFORE
  -- recordSettlementOutcome() is called so a crash/redelivery between the
  -- match and the outcome write can resume without re-matching against a
  -- reference that active_settlement_reference may have since cleared.
  contribution_id      BIGINT        NULL,

  status               ENUM('RECEIVED', 'PROCESSED', 'FAILED')
                                      NOT NULL DEFAULT 'RECEIVED',

  -- Set only on FAILED (no matching contribution, amount/currency mismatch,
  -- or an exception during processing). Never contains the webhook secret.
  processing_error     TEXT          NULL,

  received_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at         TIMESTAMP     NULL DEFAULT NULL,

  UNIQUE KEY uq_swi_provider_event (provider, provider_event_id),

  CONSTRAINT fk_swi_contribution FOREIGN KEY (contribution_id)
    REFERENCES financial_contributions(id) ON DELETE SET NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_swi_contribution ON settlement_webhook_inbox (contribution_id);
CREATE INDEX idx_swi_status       ON settlement_webhook_inbox (status);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0092_create_settlement_webhook_inbox.sql', NOW());

COMMIT;
