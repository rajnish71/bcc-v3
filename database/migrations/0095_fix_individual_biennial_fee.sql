-- ============================================================================
-- 0095_fix_individual_biennial_fee.sql
--
-- Reconciliation: migration 0083 seeded INDIVIDUAL_BIENNIAL.fee_inr = '3000'
-- (comment there said "Rs 3,000 / 2 years"). The confirmed product decision
-- for Individual Biennial is Rs 2,500 / 2 years -- everything else about that
-- migration's seed (validity_months=24, renewal_term_months=24,
-- grace_period_days=60, pvc_card=true, welcome_kit=true, discount_pct=10,
-- tour_discount_pct=5) is unchanged and correct.
--
-- fee_inr is class_entitlements-driven (MEM-008: "No benefit may be
-- hard-coded"), read at application time by
-- MembershipLifecycleService.createApplicationContribution() via
-- EntitlementService.getClassConfigValue(). Correcting the seeded value here
-- is sufficient -- no application code references '3000' or '2500' directly.
--
-- INDIVIDUAL_BIENNIAL is OPERATIONAL, not CONSTITUTIONAL, so the
-- constitutional protection trigger from migration 0009 does not block this
-- UPDATE.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

UPDATE class_entitlements ce
  JOIN membership_classes mc ON mc.id = ce.membership_class_id
  SET ce.entitlement_value = '2500'
  WHERE mc.code = 'INDIVIDUAL_BIENNIAL'
    AND mc.type = 'OPERATIONAL'
    AND ce.entitlement_key = 'fee_inr';

INSERT INTO schema_migrations (filename, applied_at)
  VALUES ('0095_fix_individual_biennial_fee.sql', NOW());

COMMIT;
