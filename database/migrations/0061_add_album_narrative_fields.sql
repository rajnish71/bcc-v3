-- ============================================================================
-- 0061_add_album_narrative_fields.sql
--
-- Stage 7 · Batch B1 · item 69 — richer Story/Collection metadata.
--
-- Stories and Collections (photo_albums, kind added in 0060) gain editorial
-- framing fields so a Story can carry an eyebrow/subtitle/description and both
-- kinds can record a single primary genre. See:
--   ProjectDocs/Architecture/STORY_VS_COLLECTION.md
--
-- `genre` holds a single GENRE tag_key from the photo_tags taxonomy (item 71,
-- multi-select tags model). It is the container's *primary* category; per-photo
-- categories remain in photo_tag_assignments. Nullable — no FK to keep the
-- taxonomy source-of-truth in photo_tags without a hard coupling.
-- ============================================================================

ALTER TABLE photo_albums
  ADD COLUMN eyebrow  VARCHAR(120)  NULL AFTER title,
  ADD COLUMN subtitle VARCHAR(255)  NULL AFTER eyebrow,
  ADD COLUMN genre    VARCHAR(100)  NULL AFTER description;
