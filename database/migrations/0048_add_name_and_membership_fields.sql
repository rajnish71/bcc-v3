-- ============================================================================
-- 0048_add_name_and_membership_fields.sql
-- Phase D -- Schema: Name breakdown columns and membership profile fields
--
-- NAME BREAKDOWN (identity fields — placed immediately after full_name):
--   name_title   VARCHAR(20)  NULL  -- stored NULL, never empty string
--   first_name   VARCHAR(100) NULL
--   middle_name  VARCHAR(100) NULL
--   last_name    VARCHAR(100) NULL
--
--   CRITICAL: full_name is NOT dropped or altered.
--   full_name remains the computed display name, authoritative for all existing
--   queries. Backend recomputes:
--     full_name = TRIM(CONCAT_WS(' ', name_title, first_name, middle_name, last_name))
--   on every Account Settings save.
--
--   Valid name_title values (application-enforced, not DB constraint):
--     Mr. / Ms. / Mrs. / Dr. / Prof. / Er. / CA / Adv.
--   NULL for no title — never store empty string.
--
-- MEMBERSHIP PROFILE FIELDS:
--   year_joined_bcc  YEAR  NULL  -- ADMIN-ONLY; min 2016; never in member-editable endpoints
--   gender           ENUM('MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY') NULL
--
-- NOTE: date_of_birth already exists on the users table (added in an earlier
-- migration). It is NOT re-added here.
--
-- Credentials: bcc_v3_app
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- Name breakdown — inserted immediately after full_name
ALTER TABLE users
  ADD COLUMN name_title   VARCHAR(20)  NULL AFTER full_name,
  ADD COLUMN first_name   VARCHAR(100) NULL AFTER name_title,
  ADD COLUMN middle_name  VARCHAR(100) NULL AFTER first_name,
  ADD COLUMN last_name    VARCHAR(100) NULL AFTER middle_name;

-- Membership profile fields — appended (no positional requirement)
ALTER TABLE users
  ADD COLUMN year_joined_bcc  YEAR                                          NULL,
  ADD COLUMN gender           ENUM('MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY') NULL;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0048_add_name_and_membership_fields.sql', NOW());

COMMIT;
