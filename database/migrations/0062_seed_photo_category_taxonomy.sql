-- ============================================================================
-- 0062_seed_photo_category_taxonomy.sql
--
-- Stage 7 · Batch B1 · item 71 — photo category taxonomy (multi-select tags).
--
-- Owner decision (2026-07-14): categories are modelled as multi-select GENRE
-- tags in photo_tags + photo_tag_assignments (NOT a widened photos.genre ENUM),
-- preserving the legacy many-per-photo model and matching PHOTO-ARCH-001.
--
-- Target taxonomy = 20 categories: the 12 legacy names
--   (Architecture, Astro, Black & White, Event, Landscape, Macro, Monuments,
--    Portfolio, Portrait, Street, Travel, Wildlife)
-- plus 8 new (Food, Nature, Product, Fashion, Fine Art, Sports, Aerial, Documentary).
--
-- 0034 already seeded 15 GENRE tags. This migration is ADDITIVE and idempotent:
-- INSERT IGNORE keys on tag_key UNIQUE, so re-running is a no-op and existing
-- tags (incl. bird/night/underwater/abstract/sport/other) are left untouched.
-- Slugs below are the ones NOT already present after 0034.
-- ============================================================================

INSERT IGNORE INTO photo_tags (tag_key, display_name, category, is_system) VALUES
  ('astro',           'Astro',         'GENRE', 1),
  ('black-and-white', 'Black & White', 'GENRE', 1),
  ('event',           'Event',         'GENRE', 1),
  ('monuments',       'Monuments',     'GENRE', 1),
  ('portfolio',       'Portfolio',     'GENRE', 1),
  ('food',            'Food',          'GENRE', 1),
  ('nature',          'Nature',        'GENRE', 1),
  ('product',         'Product',       'GENRE', 1),
  ('fashion',         'Fashion',       'GENRE', 1),
  ('fine-art',        'Fine Art',      'GENRE', 1),
  ('sports',          'Sports',        'GENRE', 1);
