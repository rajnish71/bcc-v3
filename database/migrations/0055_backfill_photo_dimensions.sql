-- ============================================================================
-- 0055_backfill_photo_dimensions.sql
-- Backfills width_px / height_px for photos that were uploaded without
-- dimension data (pre-migration or early upload-wizard uploads).
--
-- Dimensions were read from JPEG binary headers via
-- scripts/backfill_photo_dimensions.mjs (July 2026).
--
-- 7 of Sauvik's photos (sauvikacharyya) could not be measured because their
-- R2 originals are not accessible at the stored r2_key path — only the
-- ImageKit-cached medium transform exists. Those are left at NULL; the
-- lightbox falls back to the medium URL for those photos.
-- ============================================================================

UPDATE photos SET width_px = 5831, height_px = 3887 WHERE uuid = '3912338d-878a-471e-93cb-ec74cd2d6a2b';
UPDATE photos SET width_px = 6000, height_px = 4000 WHERE uuid = '2355ac26-b5a8-44f9-886e-5763733d33fd';
UPDATE photos SET width_px = 6000, height_px = 4000 WHERE uuid = '37ea537c-9cd3-48c7-9986-8751f7859e52';
UPDATE photos SET width_px = 6000, height_px = 4000 WHERE uuid = 'd485dad5-393c-4bde-a0da-442a34c02a20';
UPDATE photos SET width_px = 6000, height_px = 4000 WHERE uuid = 'a2c83a60-e093-4242-b9f4-fb8f76c22cdb';
UPDATE photos SET width_px = 5760, height_px = 3528 WHERE uuid = 'ee93caa6-cdbf-46aa-9b72-ff9b4c054bf0';
UPDATE photos SET width_px = 5613, height_px = 3742 WHERE uuid = '6f912817-55d6-4cbc-bb92-60af09e7996d';
UPDATE photos SET width_px = 6000, height_px = 4000 WHERE uuid = '5aff85ee-af17-4b5e-99fd-531ffc886d17';
UPDATE photos SET width_px = 6000, height_px = 4000 WHERE uuid = '169ffb46-2466-4a54-88c4-147537abcf68';
UPDATE photos SET width_px = 6000, height_px = 4000 WHERE uuid = '4a77ec82-54fa-4ece-8dd5-7127dd47671b';
UPDATE photos SET width_px = 6000, height_px = 4000 WHERE uuid = 'b00ab9f6-ea3b-4beb-807f-544f4d4cabb7';
UPDATE photos SET width_px = 6000, height_px = 4000 WHERE uuid = 'b8b3319f-f3f1-43a5-8f75-ad816e6ce1a8';
UPDATE photos SET width_px = 5904, height_px = 4000 WHERE uuid = '8c47308c-1f46-42f1-9067-561a82c61002';

-- Rajnish Khare (id=1): 1 photo
UPDATE photos SET width_px = 2048, height_px = 1536 WHERE uuid = '10784b9b-fbc1-4e00-9961-308bd8eef580';

-- Register in schema_migrations
INSERT IGNORE INTO schema_migrations (filename) VALUES ('0055_backfill_photo_dimensions.sql');
