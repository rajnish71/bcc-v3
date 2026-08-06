-- ============================================================================
-- 0083_mem008_seed_benefit_entitlements.sql
-- MEM-008 Part 2: Configurable benefit entitlements for all membership classes.
--
-- Constitutional rule from MEM-008:
--   "No benefit may be hard-coded. Every benefit shall be configurable."
--   "Configuration changes shall apply prospectively and shall not require
--    software deployment."
--
-- This migration seeds the canonical entitlement set. All keys use the
-- class_entitlements table (layer 1 of the MEM-006 frozen resolution formula).
-- Administrators can change values at runtime via the entitlements API;
-- no code change is required.
--
-- Key catalogue (booleans stored as 'true'/'false' strings):
--   fee_inr              - membership fee in rupees ('0' for free)
--   validity_months      - informational; runtime uses renewal_term_months
--   renewal_term_months  - controls expiry calculation (lifecycle engine)
--   grace_period_days    - controls grace window (lifecycle engine)
--   portfolio_enabled    - public photographer portfolio
--   public_gallery_enabled - photos appear in public gallery
--   pvc_card             - physical PVC membership card
--   welcome_kit          - physical welcome kit on activation
--   discount_pct         - activity discount percentage ('0' = none)
--   tour_discount_pct    - outstation tour/trip discount percentage ('0' = none)
--   priority_registration - priority slot for BCC activities
--   members_only_activities - access to members-only activities
--   members_only_resources  - access to members-only resources
--   digital_card         - digital membership card (PDF)
--   featured_in_directory - appears in the public photographer directory
--   student_activities   - eligibility for student-specific activities
--
-- Uses ON DUPLICATE KEY UPDATE so re-running overwrites stale values.
-- Idempotent and safe to rerun.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper: local variables for class IDs
-- ──────────────────────────────────────────────────────────────────────────────

SET @id_basic      = (SELECT id FROM membership_classes WHERE code = 'BASIC_MEMBER');
SET @id_legacy     = (SELECT id FROM membership_classes WHERE code = 'LEGACY_MEMBER');
SET @id_student    = (SELECT id FROM membership_classes WHERE code = 'STUDENT_MEMBER');
SET @id_individual = (SELECT id FROM membership_classes WHERE code = 'INDIVIDUAL_MEMBER');
SET @id_biennial   = (SELECT id FROM membership_classes WHERE code = 'INDIVIDUAL_BIENNIAL');
SET @id_full       = (SELECT id FROM membership_classes WHERE code = 'FULL_MEMBER');
SET @id_life       = (SELECT id FROM membership_classes WHERE code = 'LIFE_MEMBER');
SET @id_patron     = (SELECT id FROM membership_classes WHERE code = 'PATRON_MEMBER');
SET @id_founding   = (SELECT id FROM membership_classes WHERE code = 'FOUNDING_MEMBER');

-- ──────────────────────────────────────────────────────────────────────────────
-- BASIC_MEMBER (free, 12 months)
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_basic, 'fee_inr',                 '0'),
  (@id_basic, 'validity_months',         '12'),
  (@id_basic, 'digital_card',            'true'),
  (@id_basic, 'priority_registration',   'true'),
  (@id_basic, 'members_only_activities', 'true'),
  (@id_basic, 'members_only_resources',  'true'),
  (@id_basic, 'portfolio_enabled',       'false'),
  (@id_basic, 'public_gallery_enabled',  'false'),
  (@id_basic, 'pvc_card',               'false'),
  (@id_basic, 'welcome_kit',            'false'),
  (@id_basic, 'discount_pct',           '0'),
  (@id_basic, 'tour_discount_pct',      '0'),
  (@id_basic, 'featured_in_directory',  'false'),
  (@id_basic, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ──────────────────────────────────────────────────────────────────────────────
-- LEGACY_MEMBER (grandfathered, closed, assigned by admin)
-- All Basic benefits + portfolio + gallery + legacy recognition
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_legacy, 'fee_inr',                 '0'),
  (@id_legacy, 'validity_months',         '0'),
  (@id_legacy, 'digital_card',            'true'),
  (@id_legacy, 'priority_registration',   'true'),
  (@id_legacy, 'members_only_activities', 'true'),
  (@id_legacy, 'members_only_resources',  'true'),
  (@id_legacy, 'portfolio_enabled',       'true'),
  (@id_legacy, 'public_gallery_enabled',  'true'),
  (@id_legacy, 'pvc_card',               'false'),
  (@id_legacy, 'welcome_kit',            'false'),
  (@id_legacy, 'discount_pct',           '0'),
  (@id_legacy, 'tour_discount_pct',      '0'),
  (@id_legacy, 'featured_in_directory',  'true'),
  (@id_legacy, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ──────────────────────────────────────────────────────────────────────────────
-- STUDENT_MEMBER (Rs 500/year)
-- Basic benefits + student activities eligibility
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_student, 'fee_inr',                 '500'),
  (@id_student, 'validity_months',         '12'),
  (@id_student, 'digital_card',            'true'),
  (@id_student, 'priority_registration',   'true'),
  (@id_student, 'members_only_activities', 'true'),
  (@id_student, 'members_only_resources',  'true'),
  (@id_student, 'portfolio_enabled',       'false'),
  (@id_student, 'public_gallery_enabled',  'false'),
  (@id_student, 'pvc_card',               'false'),
  (@id_student, 'welcome_kit',            'false'),
  (@id_student, 'discount_pct',           '0'),
  (@id_student, 'tour_discount_pct',      '0'),
  (@id_student, 'featured_in_directory',  'false'),
  (@id_student, 'student_activities',     'true')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ──────────────────────────────────────────────────────────────────────────────
-- INDIVIDUAL_MEMBER (Rs 1,200/year) -- represents Individual Annual
-- Basic benefits + portfolio + gallery + directory + 7.5% discount
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_individual, 'fee_inr',                 '1200'),
  (@id_individual, 'validity_months',         '12'),
  (@id_individual, 'digital_card',            'true'),
  (@id_individual, 'priority_registration',   'true'),
  (@id_individual, 'members_only_activities', 'true'),
  (@id_individual, 'members_only_resources',  'true'),
  (@id_individual, 'portfolio_enabled',       'true'),
  (@id_individual, 'public_gallery_enabled',  'true'),
  (@id_individual, 'pvc_card',               'false'),
  (@id_individual, 'welcome_kit',            'false'),
  (@id_individual, 'discount_pct',           '7.5'),
  (@id_individual, 'tour_discount_pct',      '0'),
  (@id_individual, 'featured_in_directory',  'true'),
  (@id_individual, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ──────────────────────────────────────────────────────────────────────────────
-- INDIVIDUAL_BIENNIAL (Rs 3,000 / 2 years)
-- Individual Annual benefits + PVC card + welcome kit + 10% discount + 5% tour
-- renewal_term_months = 24 (overrides the 12 that 0068 would set for renewables)
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_biennial, 'fee_inr',                 '3000'),
  (@id_biennial, 'validity_months',         '24'),
  (@id_biennial, 'renewal_term_months',     '24'),
  (@id_biennial, 'grace_period_days',       '60'),
  (@id_biennial, 'digital_card',            'true'),
  (@id_biennial, 'priority_registration',   'true'),
  (@id_biennial, 'members_only_activities', 'true'),
  (@id_biennial, 'members_only_resources',  'true'),
  (@id_biennial, 'portfolio_enabled',       'true'),
  (@id_biennial, 'public_gallery_enabled',  'true'),
  (@id_biennial, 'pvc_card',               'true'),
  (@id_biennial, 'welcome_kit',            'true'),
  (@id_biennial, 'discount_pct',           '10'),
  (@id_biennial, 'tour_discount_pct',      '5'),
  (@id_biennial, 'featured_in_directory',  'true'),
  (@id_biennial, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ──────────────────────────────────────────────────────────────────────────────
-- FULL_MEMBER (Rs 2,500/year, constitutional, voting eligible)
-- Individual Annual benefits + voting rights
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_full, 'fee_inr',                 '2500'),
  (@id_full, 'validity_months',         '12'),
  (@id_full, 'digital_card',            'true'),
  (@id_full, 'priority_registration',   'true'),
  (@id_full, 'members_only_activities', 'true'),
  (@id_full, 'members_only_resources',  'true'),
  (@id_full, 'portfolio_enabled',       'true'),
  (@id_full, 'public_gallery_enabled',  'true'),
  (@id_full, 'pvc_card',               'false'),
  (@id_full, 'welcome_kit',            'false'),
  (@id_full, 'discount_pct',           '7.5'),
  (@id_full, 'tour_discount_pct',      '0'),
  (@id_full, 'featured_in_directory',  'true'),
  (@id_full, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ──────────────────────────────────────────────────────────────────────────────
-- LIFE_MEMBER (Rs 25,000 one-time, constitutional, lifetime, voting eligible)
-- Full Member benefits, lifetime (no expiry), higher discount tier
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_life, 'fee_inr',                 '25000'),
  (@id_life, 'validity_months',         '0'),
  (@id_life, 'digital_card',            'true'),
  (@id_life, 'priority_registration',   'true'),
  (@id_life, 'members_only_activities', 'true'),
  (@id_life, 'members_only_resources',  'true'),
  (@id_life, 'portfolio_enabled',       'true'),
  (@id_life, 'public_gallery_enabled',  'true'),
  (@id_life, 'pvc_card',               'true'),
  (@id_life, 'welcome_kit',            'true'),
  (@id_life, 'discount_pct',           '10'),
  (@id_life, 'tour_discount_pct',      '5'),
  (@id_life, 'featured_in_directory',  'true'),
  (@id_life, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ──────────────────────────────────────────────────────────────────────────────
-- PATRON_MEMBER (Rs 50,000 one-time, constitutional, lifetime, voting eligible)
-- Life Member benefits + patron recognition
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_patron, 'fee_inr',                 '50000'),
  (@id_patron, 'validity_months',         '0'),
  (@id_patron, 'digital_card',            'true'),
  (@id_patron, 'priority_registration',   'true'),
  (@id_patron, 'members_only_activities', 'true'),
  (@id_patron, 'members_only_resources',  'true'),
  (@id_patron, 'portfolio_enabled',       'true'),
  (@id_patron, 'public_gallery_enabled',  'true'),
  (@id_patron, 'pvc_card',               'true'),
  (@id_patron, 'welcome_kit',            'true'),
  (@id_patron, 'discount_pct',           '10'),
  (@id_patron, 'tour_discount_pct',      '5'),
  (@id_patron, 'featured_in_directory',  'true'),
  (@id_patron, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ──────────────────────────────────────────────────────────────────────────────
-- FOUNDING_MEMBER (closed, constitutional, lifetime, voting eligible)
-- All benefits, founding recognition
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO class_entitlements (membership_class_id, entitlement_key, entitlement_value)
VALUES
  (@id_founding, 'fee_inr',                 '0'),
  (@id_founding, 'validity_months',         '0'),
  (@id_founding, 'digital_card',            'true'),
  (@id_founding, 'priority_registration',   'true'),
  (@id_founding, 'members_only_activities', 'true'),
  (@id_founding, 'members_only_resources',  'true'),
  (@id_founding, 'portfolio_enabled',       'true'),
  (@id_founding, 'public_gallery_enabled',  'true'),
  (@id_founding, 'pvc_card',               'true'),
  (@id_founding, 'welcome_kit',            'true'),
  (@id_founding, 'discount_pct',           '10'),
  (@id_founding, 'tour_discount_pct',      '5'),
  (@id_founding, 'featured_in_directory',  'true'),
  (@id_founding, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0083_mem008_seed_benefit_entitlements.sql', NOW());

COMMIT;
