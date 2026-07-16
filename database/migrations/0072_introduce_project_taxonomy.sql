-- ============================================================================
-- 0072_introduce_project_taxonomy.sql
--
-- Introduce PROJECT as a new photo_tags.category value.
-- Special Project tags are curated long-term initiatives (e.g. "Birds of Bhopal").
-- They are NOT genres. They behave identically to Lightroom keywords — a photo
-- may belong to zero, one, or many Projects.
--
-- Changes
--   1. Extend photo_tags.category ENUM: add PROJECT
--   2. Reclassify birds-of-bhopal + butterflies-of-bhopal: GENRE → PROJECT
--   3. Add wildlife-of-bhopal + heritage-of-bhopal as PROJECT tags
--   4. Deactivate sport (migrate assignments to sports first)
--   5. Deactivate portfolio if it has no photo_tag_assignments
--
-- Idempotency
--   INSERT IGNORE on new tags: safe to re-run, no-op if already present.
--   UPDATE WHERE tag_key = ...: safe to re-run on the same values.
--   The sport→sports assignment migration uses INSERT IGNORE, which is a no-op
--   when the (photo_id, tag_id) pair already exists.
-- ============================================================================

SET NAMES utf8mb4;
START TRANSACTION;

-- ── 1. Extend category ENUM ────────────────────────────────────────────────
-- Adding PROJECT at the end is an online metadata-only DDL in MySQL 8.
ALTER TABLE photo_tags
  MODIFY COLUMN category
    ENUM('GENRE','SUBJECT','LOCATION','EQUIPMENT','CUSTOM','PROJECT')
    NOT NULL;

-- ── 2. Reclassify existing Special Project tags ────────────────────────────
UPDATE photo_tags
  SET category = 'PROJECT'
  WHERE tag_key IN ('birds-of-bhopal', 'butterflies-of-bhopal');

-- ── 3. Add new PROJECT tags (idempotent via INSERT IGNORE) ─────────────────
INSERT IGNORE INTO photo_tags (tag_key, display_name, category, is_system) VALUES
  ('wildlife-of-bhopal', 'Wildlife of Bhopal', 'PROJECT', 1),
  ('heritage-of-bhopal', 'Heritage of Bhopal', 'PROJECT', 1);

-- ── 4. sport → sports: migrate assignments, then deactivate ───────────────
-- Copy every photo_tag_assignment for 'sport' to 'sports'.
-- INSERT IGNORE: PRIMARY KEY (photo_id, tag_id) prevents duplicate rows
-- when a photo was already tagged with both sport and sports.
INSERT IGNORE INTO photo_tag_assignments (photo_id, tag_id, assigned_by, assigned_at)
SELECT
  pta.photo_id,
  sports_tag.id,
  pta.assigned_by,
  pta.assigned_at
FROM photo_tag_assignments pta
INNER JOIN photo_tags sport_tag
  ON sport_tag.id = pta.tag_id
  AND sport_tag.tag_key = 'sport'
CROSS JOIN (
  SELECT id FROM photo_tags WHERE tag_key = 'sports' LIMIT 1
) AS sports_tag;

-- Deactivate sport now that assignments are migrated.
UPDATE photo_tags SET is_active = 0 WHERE tag_key = 'sport';

-- ── 5. Deactivate portfolio if no photo_tag_assignments reference it ───────
-- If portfolio IS referenced, the UPDATE matches zero rows (WHERE NOT EXISTS
-- fails) and the tag stays active. A report note is included below.
UPDATE photo_tags pt
  SET pt.is_active = 0
  WHERE pt.tag_key = 'portfolio'
    AND NOT EXISTS (
      SELECT 1 FROM photo_tag_assignments pta
      WHERE pta.tag_id = pt.id
    );

-- ── 6. Record migration ────────────────────────────────────────────────────
INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0072_introduce_project_taxonomy.sql', NOW());

COMMIT;
