-- ============================================================================
-- 0085_mem008_senior_criteria_seed.sql
-- MEM-008 Part 4: Seeds the four SENIOR_MEMBER recognition criteria into the
-- recognition_criteria table so the senior-status calculation is fully
-- database-driven and admin-configurable without a code deployment.
--
-- Four keys govern the three MEM-008 eligibility rules:
--
--   rule_age_only_min_age          = 60   (Rule 1: age alone)
--   rule_age_tenure_min_age        = 50   (Rule 2: age component)
--   rule_age_tenure_min_tenure_years = 5  (Rule 2: tenure component)
--   rule_tenure_only_min_years     = 10   (Rule 3: tenure alone)
--
-- MembershipAdminService.listSeniorStatusEligible() reads these at runtime
-- with fall-back defaults (matching these values) in case a row is ever
-- accidentally deleted.
--
-- Uses ON DUPLICATE KEY UPDATE so re-running refreshes values safely.
-- The recognition_criteria table was created in migration 0024.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT INTO recognition_criteria (recognition_code, criteria_key, criteria_value)
VALUES
  ('SENIOR_MEMBER', 'rule_age_only_min_age',            '60'),
  ('SENIOR_MEMBER', 'rule_age_tenure_min_age',           '50'),
  ('SENIOR_MEMBER', 'rule_age_tenure_min_tenure_years',  '5'),
  ('SENIOR_MEMBER', 'rule_tenure_only_min_years',        '10')
ON DUPLICATE KEY UPDATE
  criteria_value = VALUES(criteria_value);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0085_mem008_senior_criteria_seed.sql', NOW());

COMMIT;
