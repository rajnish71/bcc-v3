-- ============================================================================
-- 0077_add_show_in_portfolio.sql
--
-- Adds show_in_portfolio to photos table.
--
-- Purpose:
--   Allows a photographer to mark a photo as "hidden from portfolio" while
--   keeping it fully accessible as a Canonical Photo.  Admin-curated features
--   (Hero images, Stories, Projects, Collections, Activities) still see and
--   can use the photo.  Only the photographer's public portfolio listing
--   respects this flag.
--
-- Design:
--   Default TRUE  → all existing photos remain visible (backward-compatible).
--   This flag does NOT change photo visibility (PUBLIC/MEMBERS_ONLY/PRIVATE/
--   UNLISTED) and does NOT affect Hero eligibility or any other system.
--
-- Idempotency: ALTER TABLE ... ADD COLUMN is protected by IF NOT EXISTS.
-- ============================================================================

SET NAMES utf8mb4;
START TRANSACTION;

ALTER TABLE photos
  ADD COLUMN show_in_portfolio TINYINT(1) NOT NULL DEFAULT 1
  COMMENT 'When 0, photo is excluded from the photographer portfolio listing only. Has no effect on visibility, Hero eligibility, or admin tools.'
  AFTER visibility;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0077_add_show_in_portfolio.sql', NOW());

COMMIT;
