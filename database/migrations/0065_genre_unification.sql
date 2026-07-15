-- 0065_genre_unification.sql
-- Genre/Category Unification — Jul 2026
-- Architectural ruling: photo_tags (category=GENRE) via photo_tag_assignments
-- is the single source of truth. photos.genre enum column and photo_albums.genre
-- string column are deprecated and removed. photo_album_genres junction table
-- is created for multi-genre album support.
--
-- NOTE: GENRE tags (27 rows) were seeded by 0062. No re-seeding here.
-- NOTE: photos.genre values are UPPERCASE (e.g. WILDLIFE); tag_keys are
--       lowercase (e.g. wildlife). Join uses LOWER() for compatibility.

-- ── 1. Data-migrate: photos.genre → photo_tag_assignments ─────────────────
-- INSERT IGNORE handles the PRIMARY KEY (photo_id, tag_id) constraint so
-- any photo already tagged via import_legacy_photo_categories.js is skipped.
-- assigned_by = 1 (super-admin / system actor).

INSERT IGNORE INTO photo_tag_assignments (photo_id, tag_id, assigned_by, assigned_at)
SELECT
  p.id,
  pt.id,
  1,
  NOW()
FROM photos p
INNER JOIN photo_tags pt
  ON LOWER(p.genre) = pt.tag_key
  AND pt.category = 'GENRE'
WHERE p.genre IS NOT NULL
  AND p.status != 'DELETED';

-- ── 2. Create photo_album_genres junction table ────────────────────────────

CREATE TABLE IF NOT EXISTS photo_album_genres (
  id        BIGINT NOT NULL AUTO_INCREMENT,
  album_id  BIGINT NOT NULL,
  tag_id    BIGINT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_album_genre (album_id, tag_id),
  CONSTRAINT fk_pag_album FOREIGN KEY (album_id) REFERENCES photo_albums (id) ON DELETE CASCADE,
  CONSTRAINT fk_pag_tag   FOREIGN KEY (tag_id)   REFERENCES photo_tags   (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. Data-migrate: photo_albums.genre → photo_album_genres ──────────────
-- album.genre values are already lowercase, matching pt.tag_key directly.

INSERT IGNORE INTO photo_album_genres (album_id, tag_id)
SELECT
  pa.id,
  pt.id
FROM photo_albums pa
INNER JOIN photo_tags pt
  ON pa.genre = pt.tag_key
  AND pt.category = 'GENRE'
WHERE pa.genre IS NOT NULL;

-- ── 4. Drop deprecated columns ─────────────────────────────────────────────

ALTER TABLE photos       DROP COLUMN genre;
ALTER TABLE photo_albums DROP COLUMN genre;
