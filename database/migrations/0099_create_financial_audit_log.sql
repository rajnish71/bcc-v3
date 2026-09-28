-- ============================================================================
-- 0099_create_financial_audit_log.sql
-- Payment & Authentication Observability Remediation -- OBS-02.
--
-- financial_audit_log is a durable OBSERVABILITY / PROVENANCE layer, NOT a
-- new canonical financial state machine. PAY-001 remains the sole authority
-- over Financial Contribution / Transaction / Refund lifecycle (see
-- financial-contribution.service.ts) -- this table only records what
-- already happened there, so a future investigator can reconstruct:
-- actor -> session -> request -> contribution -> settlement -> provider
-- order -> provider payment -> transaction -> final state, without relying
-- primarily on ephemeral application logs.
--
-- Atomicity (OBS-11): callers insert into this table using the SAME
-- transaction as the business write it accompanies (see
-- FinancialAuditService.record() in
-- backend/src/modules/financial/audit/financial-audit.service.ts) -- there
-- is no outbox/async delivery for this table, unlike
-- financial_event_outbox (0090), which this table is never combined with.
-- A failed audit insert rolls back the accompanying business write.
--
-- Immutability (OBS-12): rows are permanent. UPDATE is restricted by
-- trigger to exactly the approved privacy operation (client_ip/user_agent
-- redaction to NULL after the 24-month retention window); DELETE is
-- rejected outright. Mirrors the house SIGNAL SQLSTATE '45000' style
-- established in 0009/0059.
--
-- Metadata whitelist (OBS-02/Section 13): metadata_json is TEXT, not JSON,
-- per CLAUDE.md §5.7 (mysql2 auto-parses JSON columns; this column is read
-- back as a plain string and parsed by application code only where
-- needed). Only an explicit, small set of whitelisted fields is ever
-- written here by FinancialAuditService.record() -- never arbitrary
-- headers, tokens, cookies, or request/response bodies.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS financial_audit_log (
  id                     BIGINT        AUTO_INCREMENT PRIMARY KEY,
  uuid                   CHAR(36)      NOT NULL,

  event_type             VARCHAR(64)   NOT NULL,

  -- Generic Financial Engine correlations. All nullable -- not every audit
  -- event carries every reference (e.g. SETTLEMENT_EVIDENCE_SUBMITTED has
  -- no transaction_id yet).
  contribution_id        BIGINT        NULL,
  transaction_id         BIGINT        NULL,
  refund_id              BIGINT        NULL,
  settlement_evidence_id BIGINT        NULL,
  webhook_inbox_id       BIGINT        NULL,

  -- Actor identity. actor_user_id is NULL for WEBHOOK/SYSTEM actors (same
  -- pairing discipline as financial_refunds.requested_by_user_id, migration
  -- 0096) and may also be NULL for a MEMBER/ADMIN event recorded from a
  -- caller that has not yet threaded request provenance through -- see the
  -- remediation handoff for the documented business-module-caller gap.
  actor_type             ENUM('MEMBER','ADMIN','SYSTEM','WEBHOOK') NOT NULL,
  actor_user_id          BIGINT        NULL,

  -- Request/session correlation (OBS-01/OBS-03). NULL for events recorded
  -- outside an HTTP request, or for historical events predating this
  -- migration -- never fabricated (Section 11).
  request_id             CHAR(36)      NULL,
  session_id             CHAR(36)      NULL,

  -- Network/client provenance (OBS-04/OBS-05). client_ip is VARCHAR(45),
  -- matching refresh_tokens.ip_address's existing convention (fits an
  -- IPv6 address). user_agent is capped at 500 chars by application code
  -- before insert (OBS-05); the column allows exactly that ceiling.
  client_ip              VARCHAR(45)   NULL,
  user_agent             VARCHAR(500)  NULL,
  http_route             VARCHAR(255)  NULL,

  -- Settlement Provider correlation (OBS-06/OBS-07). Retained here even
  -- after financial_contributions.active_settlement_reference is cleared on
  -- leaving SETTLEMENT_IN_PROGRESS (financial-contribution.service.ts
  -- applyTransition()) -- this is the entire point of OBS-06: a provider
  -- order id must never disappear from the historical record.
  provider_order_ref     VARCHAR(128)  NULL,
  provider_payment_ref   VARCHAR(128)  NULL,
  provider_receipt_ref   VARCHAR(128)  NULL,

  previous_state         VARCHAR(32)   NULL,
  resulting_state        VARCHAR(32)   NULL,

  -- Whitelisted metadata only (see header). TEXT, not JSON -- CLAUDE.md §5.7.
  metadata_json          TEXT          NULL,

  created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_fal_uuid (uuid),

  CONSTRAINT fk_fal_contribution FOREIGN KEY (contribution_id)
    REFERENCES financial_contributions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fal_transaction FOREIGN KEY (transaction_id)
    REFERENCES financial_transactions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fal_refund FOREIGN KEY (refund_id)
    REFERENCES financial_refunds(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fal_evidence FOREIGN KEY (settlement_evidence_id)
    REFERENCES financial_settlement_evidence(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fal_webhook FOREIGN KEY (webhook_inbox_id)
    REFERENCES settlement_webhook_inbox(id) ON DELETE RESTRICT,
  -- users.id is BIGINT (CLAUDE.md §5.5) -- actor_user_id must match.
  -- RESTRICT, not SET NULL: MySQL does not fire triggers for cascaded FK
  -- actions, so SET NULL would silently rewrite actor_user_id on a
  -- permanent audit row when a user is hard-deleted, bypassing
  -- trg_financial_audit_log_restrict_update. Same rule as
  -- financial_contributions.payer_user_id (fk_fc_payer, migration 0088).
  CONSTRAINT fk_fal_actor FOREIGN KEY (actor_user_id)
    REFERENCES users(id) ON DELETE RESTRICT,

  KEY idx_fal_contribution     (contribution_id, created_at),
  KEY idx_fal_request          (request_id),
  KEY idx_fal_session          (session_id),
  KEY idx_fal_provider_order   (provider_order_ref),
  KEY idx_fal_provider_payment (provider_payment_ref),
  KEY idx_fal_actor            (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Immutability (OBS-12) ────────────────────────────────────────────────

DELIMITER $$

DROP TRIGGER IF EXISTS trg_financial_audit_log_no_delete $$
CREATE TRIGGER trg_financial_audit_log_no_delete
BEFORE DELETE ON financial_audit_log
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'OBS-12 VIOLATION: financial_audit_log rows are permanent and cannot be deleted.';
END $$

-- UPDATE is restricted to exactly the approved privacy operation: redacting
-- client_ip and/or user_agent to NULL after the 24-month retention window
-- (Section 12 approved policy). Redaction is one-way -- a NULL value can
-- never be changed back to non-NULL, and a non-NULL value can only ever
-- change to NULL, never to a different value. Every other column must be
-- byte-for-byte unchanged.
DROP TRIGGER IF EXISTS trg_financial_audit_log_restrict_update $$
CREATE TRIGGER trg_financial_audit_log_restrict_update
BEFORE UPDATE ON financial_audit_log
FOR EACH ROW
BEGIN
  DECLARE client_ip_ok BOOLEAN;
  DECLARE user_agent_ok BOOLEAN;

  SET client_ip_ok = (NEW.client_ip <=> OLD.client_ip) OR (NEW.client_ip IS NULL AND OLD.client_ip IS NOT NULL);
  SET user_agent_ok = (NEW.user_agent <=> OLD.user_agent) OR (NEW.user_agent IS NULL AND OLD.user_agent IS NOT NULL);

  IF NOT client_ip_ok OR NOT user_agent_ok THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'OBS-12 VIOLATION: client_ip/user_agent may only be redacted to NULL, never modified or restored.';
  END IF;

  IF NOT (
    NEW.id = OLD.id AND NEW.uuid = OLD.uuid AND NEW.event_type = OLD.event_type
    AND NEW.contribution_id <=> OLD.contribution_id
    AND NEW.transaction_id <=> OLD.transaction_id
    AND NEW.refund_id <=> OLD.refund_id
    AND NEW.settlement_evidence_id <=> OLD.settlement_evidence_id
    AND NEW.webhook_inbox_id <=> OLD.webhook_inbox_id
    AND NEW.actor_type = OLD.actor_type
    AND NEW.actor_user_id <=> OLD.actor_user_id
    AND NEW.request_id <=> OLD.request_id
    AND NEW.session_id <=> OLD.session_id
    AND NEW.http_route <=> OLD.http_route
    AND NEW.provider_order_ref <=> OLD.provider_order_ref
    AND NEW.provider_payment_ref <=> OLD.provider_payment_ref
    AND NEW.provider_receipt_ref <=> OLD.provider_receipt_ref
    AND NEW.previous_state <=> OLD.previous_state
    AND NEW.resulting_state <=> OLD.resulting_state
    AND NEW.metadata_json <=> OLD.metadata_json
    AND NEW.created_at = OLD.created_at
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'OBS-12 VIOLATION: financial_audit_log rows are immutable except client_ip/user_agent redaction.';
  END IF;
END $$

DELIMITER ;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0099_create_financial_audit_log.sql', NOW());

COMMIT;
