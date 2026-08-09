-- ============================================================================
-- 0093_fix_paid_operational_class_activation_mode.sql
--
-- Reconciliation: migration 0069 set activation_mode = AUTO_AFTER_APPROVAL for
-- ALL OPERATIONAL classes on the assumption that "operational" meant "free /
-- no payment gate." Migration 0083 later gave STUDENT_MEMBER, INDIVIDUAL_MEMBER
-- and INDIVIDUAL_BIENNIAL positive class_entitlements.fee_inr values (500,
-- 1200, 3000) without revisiting activation_mode. Result: an admin approval
-- alone could activate a membership with an unpaid configured fee, bypassing
-- the Financial Contribution Engine (PAY-001) entirely.
--
-- MembershipLifecycleService.approve() already implements the correct
-- PAYMENT_REQUIRED branch (creates a Financial Contribution from
-- class_entitlements.fee_inr, zero-value bypasses settlement, positive value
-- awaits settlement, MembershipFinancialListener activates on
-- CONTRIBUTION_COMPLETED). No code change is required -- this migration only
-- corrects the configuration these three rows were missing.
--
-- BASIC_MEMBER (fee_inr = 0) correctly keeps AUTO_AFTER_APPROVAL -- a free
-- class has nothing to gate on. LEGACY_MEMBER (MANUAL) and the four
-- CONSTITUTIONAL classes (PAYMENT_REQUIRED, set by the 0069 column DEFAULT)
-- are untouched by this migration.
--
-- These three rows are OPERATIONAL, not CONSTITUTIONAL, so the constitutional
-- protection trigger from migration 0009 does not block this UPDATE.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

UPDATE membership_classes
  SET activation_mode = 'PAYMENT_REQUIRED'
  WHERE code IN ('STUDENT_MEMBER', 'INDIVIDUAL_MEMBER', 'INDIVIDUAL_BIENNIAL')
    AND type = 'OPERATIONAL';

INSERT INTO schema_migrations (filename, applied_at)
  VALUES ('0093_fix_paid_operational_class_activation_mode.sql', NOW());

COMMIT;
