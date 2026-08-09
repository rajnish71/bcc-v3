-- ============================================================================
-- 0090_create_financial_event_outbox.sql
-- PAY-001 Step 17 — Durable Financial Business Events
--
-- financial_event_outbox is NOT an audit log. It is a durable delivery/
-- recovery mechanism for Financial Engine Business Events (PAY-001
-- §BUSINESS EVENT MODEL). Each row represents ONE canonical Business Event
-- occurrence, written inside the SAME MySQL transaction as the financial
-- state change that produced it (financial_contributions / financial_
-- transactions / receipts). The Financial Engine only publishes an event to
-- the in-process FinancialEventBus AFTER the producing transaction commits;
-- this table is what makes that event durable across the gap between
-- "financial state committed" and "event handed to the event bus" (or
-- across a process crash in between).
--
-- dispatched_at means exactly one thing: "this event was handed to the
-- in-process EventEmitter" (FinancialEventBus.emit() was called and
-- returned). It does NOT mean the subscribing Business Module finished
-- acting on it -- listeners may still fail asynchronously after emit()
-- returns. A row with dispatched_at IS NULL is a committed event that was
-- never successfully published and is discoverable for future recovery
-- processing (no worker is implemented by this migration/step).
--
-- No Redis/Kafka/queue/worker. MySQL is the only durability mechanism,
-- consistent with TECH-STACK-FREEZE and this platform's single-EC2 budget.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS financial_event_outbox (
  id                     BIGINT         AUTO_INCREMENT PRIMARY KEY,

  -- Stable identity for this Business Event occurrence.
  event_uuid             CHAR(36)       NOT NULL,

  -- Canonical PAY-001 event type, e.g. 'financial.settlement.completed'
  -- (see FINANCIAL_EVENT_TYPES in financial.events.ts). VARCHAR rather than
  -- ENUM so a new event type never requires a schema migration.
  event_type             VARCHAR(60)    NOT NULL,

  contribution_id        BIGINT         NOT NULL,

  -- Denormalized from financial_contributions at the moment the event was
  -- produced, so the canonical FinancialEngineEventPayload can be
  -- reconstructed without a join back through a state that may have since
  -- moved on.
  business_module        VARCHAR(50)    NOT NULL,
  business_reference_id  BIGINT         NOT NULL,
  amount_paise           BIGINT         NOT NULL,
  currency               CHAR(3)        NOT NULL DEFAULT 'INR',

  -- Contribution state at the moment this event was produced (the target
  -- state of the transition, or the state at issuance for RECEIPT_GENERATED).
  contribution_state     ENUM(
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
                         )              NOT NULL,

  -- Event-specific extra context (e.g. { receiptId, receiptNumber } for
  -- RECEIPT_GENERATED). Optional; no unrelated data belongs here.
  metadata               JSON           NULL,

  -- When the Business Event logically occurred (set by the producing
  -- service call, not by MySQL) -- this is FinancialEngineEventPayload.occurredAt.
  occurred_at            TIMESTAMP      NOT NULL,

  -- When this outbox row was durably persisted (== the producing
  -- transaction's commit time, to the second).
  created_at             TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- NULL until FinancialEventBus.emit() has been called for this row
  -- post-commit. See file header for the exact semantics.
  dispatched_at          TIMESTAMP      NULL DEFAULT NULL,

  UNIQUE KEY uq_feo_event_uuid (event_uuid),

  CONSTRAINT fk_feo_contribution FOREIGN KEY (contribution_id)
    REFERENCES financial_contributions(id) ON DELETE RESTRICT

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Recovery query: SELECT ... WHERE dispatched_at IS NULL (committed but
-- never published). created_at supports ordering/inspection of that set.
CREATE INDEX idx_feo_dispatched   ON financial_event_outbox (dispatched_at);
CREATE INDEX idx_feo_created      ON financial_event_outbox (created_at);
CREATE INDEX idx_feo_contribution ON financial_event_outbox (contribution_id);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0090_create_financial_event_outbox.sql', NOW());

COMMIT;
