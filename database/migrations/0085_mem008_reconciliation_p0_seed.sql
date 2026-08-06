-- ============================================================================
-- 0085_mem008_reconciliation_p0_seed.sql
-- MEM-008 Reconciliation — P0 seed data
--
-- 1. recognition_modifiers for Honorary classes (P0.1)
--    HONORARY_MEMBER, HONORARY_MENTOR, HONORARY_GRANDMASTER all inherit
--    the Legacy Member entitlement set per MEM-008.
--    Only keys that elevate (not downgrade) are included so that members
--    holding a higher operational class (Individual, Biennial, Full, etc.)
--    do not lose their existing discount or physical-item entitlements.
--    The MEM-008 constitutional rule "all benefits of that Membership
--    continue to apply" governs this interpretation.
--
-- 2. group_type_entitlements for Family and Corporate (P0.2)
--    Fully seeds the configurable benefit config for both group types.
--    Entitlements mirror the class_entitlements key catalogue so the
--    same resolution formula applies.
--
-- 3. recognition_criteria for SENIOR_MEMBER (P0.3)
--    Seeds the three constitutional rules from MEM-008 §Senior Member
--    as configurable key-value rows so no source-code change is needed
--    when governance amends a threshold.
--
-- All inserts use ON DUPLICATE KEY UPDATE / INSERT IGNORE so this
-- migration is idempotent and safe to re-apply.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- ============================================================================
-- SECTION 1: recognition_modifiers — Honorary classes inherit Legacy benefits
-- ============================================================================
-- Legacy Member distinctive entitlements (MEM-008 §2):
--   portfolio_enabled      = true   (Basic = false)
--   public_gallery_enabled = true   (Basic = false)
--   featured_in_directory  = true   (Basic = false)
--   priority_registration  = true   (confirmed across all classes)
--   members_only_activities = true  (confirmed across all classes)
--   members_only_resources  = true  (confirmed across all classes)
--   digital_card           = true   (confirmed across all classes)
--
-- Excluded from modifiers to prevent downgrade of higher-class members:
--   discount_pct           (Legacy = 0; Individual Annual = 7.5)
--   tour_discount_pct      (Legacy = 0; Biennial = 5)
--   pvc_card               (Legacy = false; Biennial+ = true)
--   welcome_kit            (Legacy = false; Biennial+ = true)
-- ============================================================================

INSERT INTO recognition_modifiers (recognition_code, entitlement_key, modifier_value)
VALUES
  -- HONORARY_MEMBER
  ('HONORARY_MEMBER', 'portfolio_enabled',       'true'),
  ('HONORARY_MEMBER', 'public_gallery_enabled',  'true'),
  ('HONORARY_MEMBER', 'featured_in_directory',   'true'),
  ('HONORARY_MEMBER', 'priority_registration',   'true'),
  ('HONORARY_MEMBER', 'members_only_activities', 'true'),
  ('HONORARY_MEMBER', 'members_only_resources',  'true'),
  ('HONORARY_MEMBER', 'digital_card',            'true'),

  -- HONORARY_MENTOR
  ('HONORARY_MENTOR', 'portfolio_enabled',       'true'),
  ('HONORARY_MENTOR', 'public_gallery_enabled',  'true'),
  ('HONORARY_MENTOR', 'featured_in_directory',   'true'),
  ('HONORARY_MENTOR', 'priority_registration',   'true'),
  ('HONORARY_MENTOR', 'members_only_activities', 'true'),
  ('HONORARY_MENTOR', 'members_only_resources',  'true'),
  ('HONORARY_MENTOR', 'digital_card',            'true'),

  -- HONORARY_GRANDMASTER
  ('HONORARY_GRANDMASTER', 'portfolio_enabled',       'true'),
  ('HONORARY_GRANDMASTER', 'public_gallery_enabled',  'true'),
  ('HONORARY_GRANDMASTER', 'featured_in_directory',   'true'),
  ('HONORARY_GRANDMASTER', 'priority_registration',   'true'),
  ('HONORARY_GRANDMASTER', 'members_only_activities', 'true'),
  ('HONORARY_GRANDMASTER', 'members_only_resources',  'true'),
  ('HONORARY_GRANDMASTER', 'digital_card',            'true')

ON DUPLICATE KEY UPDATE modifier_value = VALUES(modifier_value);

-- ============================================================================
-- SECTION 2: group_type_entitlements — Family and Corporate memberships
-- ============================================================================

SET @id_family      = (SELECT id FROM group_membership_types WHERE code = 'FAMILY_MEMBERSHIP');
SET @id_corporate   = (SELECT id FROM group_membership_types WHERE code = 'CORPORATE_MEMBERSHIP');

-- ─────────────────────────────────────────────────────────────────────────────
-- FAMILY_MEMBERSHIP (MEM-008 §6)
-- ₹6,000 / 2 years / max 4 family members
-- Biennial-level benefits for all linked accounts:
--   PVC card (four), welcome kit (one), 10% activity discount, 5% tour discount
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO group_type_entitlements (group_membership_type_id, entitlement_key, entitlement_value)
VALUES
  (@id_family, 'fee_inr',                 '6000'),
  (@id_family, 'validity_months',         '24'),
  (@id_family, 'renewal_term_months',     '24'),
  (@id_family, 'grace_period_days',       '60'),
  (@id_family, 'max_delegates',           '4'),
  (@id_family, 'portfolio_enabled',       'true'),
  (@id_family, 'public_gallery_enabled',  'true'),
  (@id_family, 'pvc_card',               'true'),
  (@id_family, 'welcome_kit',            'true'),
  (@id_family, 'discount_pct',           '10'),
  (@id_family, 'tour_discount_pct',      '5'),
  (@id_family, 'priority_registration',  'true'),
  (@id_family, 'members_only_activities','true'),
  (@id_family, 'members_only_resources', 'true'),
  (@id_family, 'digital_card',           'true'),
  (@id_family, 'featured_in_directory',  'true'),
  (@id_family, 'student_activities',     'false')

ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ─────────────────────────────────────────────────────────────────────────────
-- CORPORATE_MEMBERSHIP (MEM-008 §7)
-- ₹5,000 / 1 year / max 5 nominated members
-- Five Individual Memberships with portfolios and company recognition.
-- discount_pct matches Individual Annual (7.5%) as the per-delegate base.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO group_type_entitlements (group_membership_type_id, entitlement_key, entitlement_value)
VALUES
  (@id_corporate, 'fee_inr',                 '5000'),
  (@id_corporate, 'validity_months',         '12'),
  (@id_corporate, 'renewal_term_months',     '12'),
  (@id_corporate, 'grace_period_days',       '30'),
  (@id_corporate, 'max_delegates',           '5'),
  (@id_corporate, 'portfolio_enabled',       'true'),
  (@id_corporate, 'public_gallery_enabled',  'true'),
  (@id_corporate, 'pvc_card',               'false'),
  (@id_corporate, 'welcome_kit',            'false'),
  (@id_corporate, 'discount_pct',           '7.5'),
  (@id_corporate, 'tour_discount_pct',      '0'),
  (@id_corporate, 'priority_registration',  'true'),
  (@id_corporate, 'members_only_activities','true'),
  (@id_corporate, 'members_only_resources', 'true'),
  (@id_corporate, 'digital_card',           'true'),
  (@id_corporate, 'featured_in_directory',  'true'),
  (@id_corporate, 'student_activities',     'false')

ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ============================================================================
-- SECTION 3: recognition_criteria — Senior Member (MEM-008 §Senior Member)
--
-- Three constitutional rules (ANY ONE qualifies):
--   Rule 1: age >= 60 years
--   Rule 2: age >= 50 AND membership tenure >= 5 years
--   Rule 3: membership tenure >= 10 years (regardless of age)
--
-- Keys are admin-configurable. MembershipAdminService.listSeniorStatusEligible()
-- reads these rows instead of using hardcoded constants.
-- ============================================================================

INSERT INTO recognition_criteria (recognition_code, criteria_key, criteria_value, updated_by_user_id)
VALUES
  -- Rule 1: age-only threshold
  ('SENIOR_MEMBER', 'rule_age_only_min_age',           '60', NULL),
  -- Rule 2: compound age + tenure thresholds
  ('SENIOR_MEMBER', 'rule_age_tenure_min_age',          '50', NULL),
  ('SENIOR_MEMBER', 'rule_age_tenure_min_tenure_years', '5',  NULL),
  -- Rule 3: tenure-only threshold (any age)
  ('SENIOR_MEMBER', 'rule_tenure_only_min_years',       '10', NULL)

ON DUPLICATE KEY UPDATE criteria_value = VALUES(criteria_value);

-- ============================================================================
-- Registration
-- ============================================================================

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0085_mem008_reconciliation_p0_seed.sql', NOW());

COMMIT;
