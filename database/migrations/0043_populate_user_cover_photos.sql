-- ============================================================================
-- 0043_populate_user_cover_photos.sql
-- Phase D -- Batch D2: Populate user_cover_photos from legacy R2 assets
--
-- Source: bcc.bcc_photographers.cover_photo_url
-- Skip: URLs starting with 'https://images.unsplash.com' (Unsplash placeholders)
-- Include: Only /uploads/covers/* paths (confirmed R2 assets)
--
-- r2_key      = SUBSTRING(cover_photo_url, 2)  -- strips leading /
-- imagekit_url = CONCAT('https://ik.imagekit.io/duynda7oq/', r2_key)
-- is_active   = TRUE
--
-- rajnishkhare (founding member) is INCLUDED: cover photo is profile asset
-- data, not governance or membership data. Safe to migrate.
--
-- INSERT IGNORE: idempotent. Duplicate rows silently skipped.
-- Expected: 10 rows inserted (blueprint Part 2 confirmation).
-- REQUIRES: sudo mysql (cross-database JOIN)
--
-- 10 confirmed R2 cover photos:
--   rajnishkhare       uploads/covers/1781424022017-66e28f32.png
--   kshitijpatle       uploads/covers/1781515753358-ad56b6db.jpg
--   anilbhati          uploads/covers/1781583009664-255db310.jpg
--   robindutta         uploads/covers/1781509676445-ccd9bc6c.jpg
--   uttamgurjar        uploads/covers/1781494389373-3e836ed2.jpg
--   suyashpratapsingh  uploads/covers/1781772948533-497531d4.jpg
--   syedtahapasha      uploads/covers/1782405747044-abcb913f.png
--   sandeepjain        uploads/covers/1781889506904-ab9d105c.jpg
--   sanjaykumarshukla  uploads/covers/1781538812271-2a74e4dd.png
--   animeshsaxena      uploads/covers/1781187930059-eb883f91.jpg
--
-- 7 members with Unsplash URLs: not migrated (placeholder images).
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO bcc_v3.user_cover_photos (user_id, r2_key, imagekit_url, is_active)
SELECT
  v3u.id,
  SUBSTRING(p.cover_photo_url, 2),
  CONCAT('https://ik.imagekit.io/duynda7oq/', SUBSTRING(p.cover_photo_url, 2)),
  TRUE
FROM bcc.bcc_photographers p
JOIN bcc_v3.users v3u
  ON v3u.username = CASE p.slug
    WHEN 'admin'               THEN 'rajnishkhare'
    WHEN 'afzal-khan'          THEN 'afzalkhan'
    WHEN 'priya-ojha'          THEN 'priyaojha'
    WHEN 'kshitij-patle'       THEN 'kshitijpatle'
    WHEN 'meeta-athavale'      THEN 'meetaathavale'
    WHEN 'ankit-tiwari'        THEN 'ankittiwari'
    WHEN 'rahil-khan'          THEN 'rahilkhan'
    WHEN 'dr-bhati'            THEN 'anilbhati'
    WHEN 'prakash-hatvalne'    THEN 'prakashhatvalne'
    WHEN 'robin-dutta'         THEN 'robindutta'
    WHEN 'uttam-gurjar'        THEN 'uttamgurjar'
    WHEN 'suyash-pratap-singh' THEN 'suyashpratapsingh'
    WHEN 'syed-taha-pasha'     THEN 'syedtahapasha'
    WHEN 'dr-sandeep-jain'     THEN 'sandeepjain'
    WHEN 'sanjay-shukla'       THEN 'sanjaykumarshukla'
    WHEN 'akshita-jain'        THEN 'akshitajain'
    WHEN 'dr-animesh-saxena'   THEN 'animeshsaxena'
    WHEN 'ritu-ahluwalia'      THEN 'rituahluwalia'
    WHEN 'sauvik-acharyya'     THEN 'sauvikacharyya'
  END
WHERE p.cover_photo_url IS NOT NULL
  AND p.cover_photo_url != ''
  AND p.cover_photo_url NOT LIKE 'https://images.unsplash.com%'
  AND p.cover_photo_url LIKE '/uploads/covers/%';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0043_populate_user_cover_photos.sql', NOW());

COMMIT;
