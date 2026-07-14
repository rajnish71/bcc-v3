-- ============================================================================
-- 0060_add_kind_to_photo_albums.sql
--
-- Stage 7 · item 53 — Stories & Collections.
--
-- A member-created Container (PHOTO-ARCH-001) can be presented either as a
-- COLLECTION (a curated grouping) or a STORY (a narrative sequence). Both use
-- the same photo_albums / photo_album_items container tables and both continue
-- to reference — never own — Canonical Photos. This column only records how a
-- container is presented; it changes nothing about ownership or reuse.
--
-- Existing member albums default to COLLECTION.
-- ============================================================================

ALTER TABLE photo_albums
  ADD COLUMN kind ENUM('COLLECTION', 'STORY') NOT NULL DEFAULT 'COLLECTION' AFTER album_type;
