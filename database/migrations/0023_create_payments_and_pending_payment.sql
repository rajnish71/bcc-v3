-- ============================================================================
-- 0023_create_payments_and_pending_payment.sql
-- Module 02.5 payment-failure handling: "Membership stays in APPROVED state.
-- pending_payment_id cleared. Member notified... to retry. No membership
-- number assigned yet -- MEM-007 number assignment only triggers on
-- successful ACTIVE transition."
--
-- SCOPE DECISION (confirmed this session): a real minimal payments table
-- now, not just a placeholder column. Razorpay-specific fields (webhook
-- signature verification state, refund workflow, settlement reconciliation)
-- are Module 11 (Financial -- Core) scope and expected to ALTER this table
-- when that module is built, not replace it. This table exists so Module
-- 02's lifecycle service has something concrete to point
-- memberships.pending_payment_id at.
--
-- amount_paise is a BIGINT storing integer paise (1 INR = 100 paise), not
-- DECIMAL rupees -- avoids float rounding on money entirely, standard
-- practice for payment amounts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                  CHAR(36) NOT NULL UNIQUE,

  membership_id         BIGINT NOT NULL,

  purpose               ENUM('MEMBERSHIP_FEE','RENEWAL_FEE') NOT NULL DEFAULT 'MEMBERSHIP_FEE',

  amount_paise          BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL DEFAULT 'INR',

  provider              ENUM('RAZORPAY','MANUAL') NOT NULL,
  provider_order_id     VARCHAR(100) NULL,
  provider_payment_id   VARCHAR(100) NULL,
  idempotency_key       VARCHAR(100) NULL,

  status                ENUM('PENDING','SUCCEEDED','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING',

  -- Set for MANUAL (coordinator-recorded cash) payments per spec 02.4
  -- ("manual (cash recorded by coordinator)"). NULL for Razorpay payments,
  -- where the payer is the member themselves via the gateway.
  recorded_by_user_id   BIGINT NULL,

  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_payment_membership   FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payment_recorded_by  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE KEY uq_payment_idempotency (idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_payments_membership ON payments (membership_id);
CREATE INDEX idx_payments_status ON payments (status);

-- ----------------------------------------------------------------------------
-- pending_payment_id links an APPROVED membership to the payment attempt
-- currently in flight. Deliberately NOT protected by the constitutional
-- trigger in 0009 -- that trigger only guards membership_number/
-- number_serial (MEM-007 MP-001), and pending_payment_id must be freely
-- settable/clearable through the whole APPROVED-state payment-retry cycle.
-- ----------------------------------------------------------------------------
ALTER TABLE memberships
  ADD COLUMN pending_payment_id BIGINT NULL AFTER last_payment_status,
  ADD CONSTRAINT fk_membership_pending_payment
    FOREIGN KEY (pending_payment_id) REFERENCES payments(id) ON DELETE SET NULL;
