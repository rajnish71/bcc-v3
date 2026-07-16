-- 0071_add_butterfly_genres.sql
-- Add Butterflies and Butterflies of Bhopal as genre tags.
-- photos.genre ENUM column was removed in 0065; all genre additions
-- from this point forward are tag-only (photo_tags table).
-- Idempotent: INSERT IGNORE is a no-op if the tag_key already exists.

INSERT IGNORE INTO photo_tags (tag_key, display_name, category, is_system) VALUES
  ('butterflies',          'Butterflies',          'GENRE', 1),
  ('butterflies-of-bhopal','Butterflies of Bhopal','GENRE', 1);
