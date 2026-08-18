-- ============================================================================
-- 0096_add_financial_refund_actor_type.sql
-- F-002 — automatic system-initiated refunds
--
-- Governance decision (system-actor refund identity session): financial_refunds
-- gains a domain-local explicit actor discriminator (requested_by_type)
-- alongside the existing human actor reference. This mirrors the
-- actor_type + nullable-human-ref pattern already established in
-- membership_audit_log (0007) -- applied locally to THIS table, not by
-- reusing that table (MEM-006 P3 keeps audit domains separate; see 0021's
-- own header). No SYSTEM user is created anywhere.
--
-- requested_by_type ENUM('HUMAN','SYSTEM') NOT NULL DEFAULT 'HUMAN':
--   every existing financial_refunds row was created by requestRefund()'s
--   only caller (an admin rejecting a paid membership application via
--   MembershipLifecycleService.reject()), so DEFAULT 'HUMAN' backfills every
--   pre-existing row correctly -- no separate UPDATE statement needed.
--
-- requested_by_user_id becomes nullable: a SYSTEM-initiated refund (F-002 --
-- the Financial Engine automatically refunding a settlement that completed
-- AFTER the owning membership was already REJECTED) has no human actor to
-- record. NULL is the SYSTEM representation; it is never used to mean
-- "unknown" -- requested_by_type is always present and authoritative.
--
-- chk_refund_actor enforces the pairing at the data layer, not just in
-- application code: HUMAN requires a human actor id; SYSTEM forbids one.
-- Mirrors the existing chk_membership_owner_axis CHECK-constraint
-- convention (0026) on this MySQL 8.0.16+ server.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE financial_refunds
  ADD COLUMN requested_by_type ENUM('HUMAN','SYSTEM')
    NOT NULL DEFAULT 'HUMAN'
    AFTER requested_by_user_id,
  MODIFY COLUMN requested_by_user_id BIGINT NULL;

ALTER TABLE financial_refunds
  ADD CONSTRAINT chk_refund_actor CHECK (
    (requested_by_type = 'HUMAN' AND requested_by_user_id IS NOT NULL)
    OR
    (requested_by_type = 'SYSTEM' AND requested_by_user_id IS NULL)
  );

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0096_add_financial_refund_actor_type.sql', NOW());

COMMIT;
