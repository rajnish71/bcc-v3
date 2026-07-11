-- ============================================================================
-- 0046_extend_social_handles_platform_enum.sql
-- Phase D -- Schema: Extend user_social_handles.platform ENUM
--
-- Adds: FACEBOOK, X_TWITTER, TIKTOK, LINKEDIN to the platform ENUM.
-- These were present in the legacy bcc_photographers.social_links JSON but
-- had no V3 ENUM target during the Phase C migration (0038). Adding them now
-- enables member-editable social handles on the Hub profile editor.
--
-- No data changes. Existing 16 rows are unaffected (INSTAGRAM + WEBSITE).
-- Credentials: bcc_v3_app
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE user_social_handles
  MODIFY COLUMN platform
  ENUM(
    'INSTAGRAM',
    'FLICKR',
    'YOUTUBE',
    'FIVE_HUNDRED_PX',
    'WEBSITE',
    'FACEBOOK',
    'X_TWITTER',
    'TIKTOK',
    'LINKEDIN'
  ) NOT NULL;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0046_extend_social_handles_platform_enum.sql', NOW());

COMMIT;
