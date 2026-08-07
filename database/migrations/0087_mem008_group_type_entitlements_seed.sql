-- ============================================================================
-- 0087_mem008_group_type_entitlements_seed.sql
-- MEM-008 Part 6: Seeds group_type_entitlements for FAMILY and CORPORATE
-- membership types.
--
-- These are the Layer-1 base entitlements for GROUP-owned memberships. The
-- group_type_entitlements table mirrors class_entitlements but keys off
-- group_membership_type_id instead of membership_class_id (migration 0026,
-- Option B structural separation).
--
-- MEM-008 §6 Family Membership:
--   Fee ₹6,000 | Validity 2 Years | Max 4 family members
--   Benefits: All Biennial benefits + 4 linked accounts + 4 PVC cards + 1 kit
--
-- MEM-008 §7 Corporate Membership:
--   Fee ₹5,000/yr | Validity 1 Year | Max 5 nominated members
--   Benefits: 5 Individual Memberships, 5 portfolios, 5 digital cards,
--             Company Recognition, Priority registration
--
-- MEM-008 §8 Institutional Membership:
--   "Pricing and benefits shall be defined separately." -- NOT seeded here.
--
-- Uses ON DUPLICATE KEY UPDATE for safe re-run.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

SET @id_family      = (SELECT id FROM group_membership_types WHERE code = 'FAMILY_MEMBERSHIP');
SET @id_corporate   = (SELECT id FROM group_membership_types WHERE code = 'CORPORATE_MEMBERSHIP');

-- ── FAMILY_MEMBERSHIP ────────────────────────────────────────────────────────
-- ₹6,000 / 2-year / up to 4 members (delegates managed via group_delegates)
INSERT INTO group_type_entitlements (group_membership_type_id, entitlement_key, entitlement_value)
VALUES
  (@id_family, 'fee_inr',                 '6000'),
  (@id_family, 'validity_months',         '24'),
  (@id_family, 'renewal_term_months',     '24'),
  (@id_family, 'grace_period_days',       '60'),
  (@id_family, 'max_delegates',           '4'),
  (@id_family, 'digital_card',            'true'),
  (@id_family, 'priority_registration',   'true'),
  (@id_family, 'members_only_activities', 'true'),
  (@id_family, 'members_only_resources',  'true'),
  (@id_family, 'portfolio_enabled',       'true'),
  (@id_family, 'public_gallery_enabled',  'true'),
  (@id_family, 'featured_in_directory',   'true'),
  (@id_family, 'pvc_card',               'true'),
  (@id_family, 'welcome_kit',            'true'),
  (@id_family, 'discount_pct',           '10'),
  (@id_family, 'tour_discount_pct',      '5'),
  (@id_family, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

-- ── CORPORATE_MEMBERSHIP ─────────────────────────────────────────────────────
-- ₹5,000/yr / 1-year / up to 5 nominated members
INSERT INTO group_type_entitlements (group_membership_type_id, entitlement_key, entitlement_value)
VALUES
  (@id_corporate, 'fee_inr',                 '5000'),
  (@id_corporate, 'validity_months',         '12'),
  (@id_corporate, 'renewal_term_months',     '12'),
  (@id_corporate, 'grace_period_days',       '60'),
  (@id_corporate, 'max_delegates',           '5'),
  (@id_corporate, 'digital_card',            'true'),
  (@id_corporate, 'priority_registration',   'true'),
  (@id_corporate, 'members_only_activities', 'true'),
  (@id_corporate, 'members_only_resources',  'true'),
  (@id_corporate, 'portfolio_enabled',       'true'),
  (@id_corporate, 'public_gallery_enabled',  'true'),
  (@id_corporate, 'featured_in_directory',   'true'),
  (@id_corporate, 'pvc_card',               'false'),
  (@id_corporate, 'welcome_kit',            'false'),
  (@id_corporate, 'company_recognition',    'true'),
  (@id_corporate, 'discount_pct',           '0'),
  (@id_corporate, 'tour_discount_pct',      '0'),
  (@id_corporate, 'student_activities',     'false')
ON DUPLICATE KEY UPDATE entitlement_value = VALUES(entitlement_value);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0087_mem008_group_type_entitlements_seed.sql', NOW());

COMMIT;
