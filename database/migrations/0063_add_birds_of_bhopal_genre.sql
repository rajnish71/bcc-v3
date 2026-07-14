-- 0063_add_birds_of_bhopal_genre.sql
-- 1. Add BIRDS_OF_BHOPAL as a new genre ENUM value on the photos table.
-- 2. Seed a matching category tag for the upload studio pill UI.

ALTER TABLE photos
  MODIFY COLUMN genre ENUM(
    'WILDLIFE','BIRD','STREET','PORTRAIT','LANDSCAPE',
    'ARCHITECTURE','MACRO','NIGHT','TRAVEL','AERIAL',
    'UNDERWATER','ABSTRACT','DOCUMENTARY','SPORT',
    'BIRDS_OF_BHOPAL','OTHER'
  ) NULL;

-- Add to tag taxonomy (idempotent — INSERT IGNORE)
INSERT IGNORE INTO photo_tags (tag_key, display_name, category, is_system) VALUES
  ('birds-of-bhopal', 'Birds of Bhopal', 'GENRE', 1);
