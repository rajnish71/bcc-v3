-- ============================================================================
-- 0086_mem008_recognition_modifiers_seed.sql
-- MEM-008 Part 5: Seeds recognition_modifiers for Honorary recognition codes.
--
-- MEM-008 §Recognition Classes states:
--   "Honorary Member: Legacy Member Benefits + Honorary Recognition"
--   "Honorary Mentor: Legacy Member Benefits + Honorary Mentor Recognition"
--   "Honorary Grandmaster: Legacy Member Benefits + Honorary Grandmaster Recognition"
--
-- The MEM-006 three-layer entitlement formula:
--   Resolved = Base(Class) + Modifiers(Recognition) + Individual Overrides
--
-- Layer 2 (recognition_modifiers) adds or overrides entitlement keys for any
-- member holding an active recognition. Without these rows, a BASIC_MEMBER
-- who receives HONORARY_MEMBER would NOT gain portfolio/gallery access --
-- the formula resolves only from their base class.
--
-- Modifiers for SENIOR_MEMBER and HONORARY_SENIOR_MEMBER are intentionally
-- NOT seeded here: MEM-008 defines only "Senior Member Badge + Recognition"
-- for those statuses -- no additional access entitlements are specified.
--
-- Uses ON DUPLICATE KEY UPDATE for safe re-run.
-- The recognition_modifiers table was created in migration 0006.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- ── HONORARY_MEMBER ───────────────────────────────────────────────────────────
-- Grants Legacy Member access on top of whatever base class the member holds.
INSERT INTO recognition_modifiers (recognition_code, entitlement_key, modifier_value)
VALUES
  ('HONORARY_MEMBER', 'portfolio_enabled',      'true'),
  ('HONORARY_MEMBER', 'public_gallery_enabled', 'true'),
  ('HONORARY_MEMBER', 'featured_in_directory',  'true'),
  ('HONORARY_MEMBER', 'priority_registration',  'true'),
  ('HONORARY_MEMBER', 'members_only_activities','true'),
  ('HONORARY_MEMBER', 'members_only_resources', 'true'),
  ('HONORARY_MEMBER', 'digital_card',           'true')
ON DUPLICATE KEY UPDATE modifier_value = VALUES(modifier_value);

-- ── HONORARY_MENTOR ───────────────────────────────────────────────────────────
-- Same access entitlements as Honorary Member (Legacy-equivalent per MEM-008).
INSERT INTO recognition_modifiers (recognition_code, entitlement_key, modifier_value)
VALUES
  ('HONORARY_MENTOR', 'portfolio_enabled',      'true'),
  ('HONORARY_MENTOR', 'public_gallery_enabled', 'true'),
  ('HONORARY_MENTOR', 'featured_in_directory',  'true'),
  ('HONORARY_MENTOR', 'priority_registration',  'true'),
  ('HONORARY_MENTOR', 'members_only_activities','true'),
  ('HONORARY_MENTOR', 'members_only_resources', 'true'),
  ('HONORARY_MENTOR', 'digital_card',           'true')
ON DUPLICATE KEY UPDATE modifier_value = VALUES(modifier_value);

-- ── HONORARY_GRANDMASTER ──────────────────────────────────────────────────────
-- Highest honorary recognition; same access as Honorary Member/Mentor.
INSERT INTO recognition_modifiers (recognition_code, entitlement_key, modifier_value)
VALUES
  ('HONORARY_GRANDMASTER', 'portfolio_enabled',      'true'),
  ('HONORARY_GRANDMASTER', 'public_gallery_enabled', 'true'),
  ('HONORARY_GRANDMASTER', 'featured_in_directory',  'true'),
  ('HONORARY_GRANDMASTER', 'priority_registration',  'true'),
  ('HONORARY_GRANDMASTER', 'members_only_activities','true'),
  ('HONORARY_GRANDMASTER', 'members_only_resources', 'true'),
  ('HONORARY_GRANDMASTER', 'digital_card',           'true')
ON DUPLICATE KEY UPDATE modifier_value = VALUES(modifier_value);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0086_mem008_recognition_modifiers_seed.sql', NOW());

COMMIT;
