-- ============================================================================
-- 0107_event_registration_pending_payment.sql
-- Module 04 x PAY-001 integration (EVENT-ARCH-001 §7).
--
-- Adds PENDING_PAYMENT to event_registrations.status: a Module 04
-- registration-lifecycle state meaning "registration intent recorded and a
-- seat held, awaiting PAY-001 settlement". It is NOT a financial state --
-- the Financial Contribution (financial_contributions, business_module
-- 'EVENT_REGISTRATION', business_reference_id = event_registrations.id)
-- remains the sole financial state machine. A PENDING_PAYMENT row becomes
-- REGISTERED only on the Financial Engine's CONTRIBUTION_COMPLETED event.
--
-- Additive only: existing values and the default are unchanged. No data
-- backfill (production had 0 event_registrations rows when written).
-- event_registrations.fee_paid_paise is retained untouched for
-- compatibility; it is no longer written by the application and is not a
-- source of financial truth.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE event_registrations
  MODIFY COLUMN status
    ENUM('REGISTERED','WAITLISTED','PENDING_PAYMENT','CANCELLED','ATTENDED','NO_SHOW')
    NOT NULL DEFAULT 'REGISTERED';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0107_event_registration_pending_payment.sql', NOW());

COMMIT;
