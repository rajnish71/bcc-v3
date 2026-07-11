-- ============================================================================
-- 0047_add_profile_preference_columns.sql
-- Phase D -- Schema: Profile preference columns on users table
--
-- areas_of_expertise      JSON NULL  -- array of strings (e.g. ["Long exposure", "Astro"])
-- favourite_subjects      JSON NULL  -- array of strings (e.g. ["Birds", "Festivals"])
-- preferred_camera_system VARCHAR(50) NULL
--
-- JSON columns are interim storage until Phase H (TAXONOMY_ARCHITECTURE) creates
-- proper taxonomy tables. Arrays of free-text strings for now.
--
-- preferred_camera_system valid values (application-enforced, not DB constraint):
--   Nikon / Canon / Sony / Fujifilm / OM System / Other
--
-- Credentials: bcc_v3_app
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE users
  ADD COLUMN areas_of_expertise       JSON         NULL,
  ADD COLUMN favourite_subjects       JSON         NULL,
  ADD COLUMN preferred_camera_system  VARCHAR(50)  NULL;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0047_add_profile_preference_columns.sql', NOW());

COMMIT;
