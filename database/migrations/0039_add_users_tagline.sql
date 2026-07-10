-- ============================================================================
-- 0039_add_users_tagline.sql
-- Phase D -- Member Profile Schema (Batch D1)
--
-- Adds users.tagline column.
--
-- SOURCE (Phase C audit):
--   bcc.bcc_photographers.tagline
--   6 of 17 active members have meaningful tagline text.
--   Longest observed: 67 chars ("Landscape photography, wildlife, art, culture, and cultural heritage.")
--
-- DESIGN DECISION:
--   VARCHAR(160): matches Instagram bio character limit; all current data fits
--   well within this bound. Column is nullable -- no tagline is a valid state.
--   Position: AFTER bio (contextually adjacent in profile display and edit form).
--
-- DATA MIGRATION:
--   Populating taglines from legacy data is a separate operation (Batch D2).
--   This migration creates the column only -- no rows are changed.
--
-- CONSTITUTION:
--   No founding member data is altered. No visibility or membership fields touched.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE users
  ADD COLUMN tagline VARCHAR(160) NULL AFTER bio;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0039_add_users_tagline.sql', NOW());

COMMIT;
