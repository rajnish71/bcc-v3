-- ============================================================================
-- 0071_add_butterfly_genres.sql
--
-- Add Butterflies and Butterflies of Bhopal as genre tags.
-- photos.genre ENUM column was removed in 0065; all genre additions
-- from this point forward are tag-only (photo_tags table).
--
-- Idempotency
--   INSERT IGNORE: safe to re-run, no-op if the tag_key already exists.
-- ============================================================================

SET NAMES utf8mb4;
START TRANSACTION;

INSERT IGNORE INTO photo_tags (tag_key, display_name, category, is_system) VALUES
  ('butterflies',           'Butterflies',           'GENRE', 1),
  ('butterflies-of-bhopal', 'Butterflies of Bhopal', 'GENRE', 1);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0071_add_butterfly_genres.sql', NOW());

COMMIT;
