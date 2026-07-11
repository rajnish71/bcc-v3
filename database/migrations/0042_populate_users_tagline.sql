-- ============================================================================
-- 0042_populate_users_tagline.sql
-- Phase D -- Batch D2: Populate users.tagline from legacy bcc.bcc_photographers
--
-- Source: bcc.bcc_photographers.tagline
-- Filter: IS NOT NULL, != '', != 'Loading.....' (placeholder guard)
-- Skip founding members: v3u.id NOT IN (1,2,3,4,5,6,7)
-- Idempotent: UPDATE is always safe to re-run.
-- REQUIRES: sudo mysql (cross-database JOIN)
--
-- Members with real tagline data (confirmed Batch D2 audit):
--   kshitij-patle       → kshitijpatle     "Visual Storyteller"
--   ankit-tiwari        → ankittiwari       "Street & Travel Photographer"
--   rahil-khan          → rahilkhan         "Street and Travel visual artist"
--   robin-dutta         → robindutta        "Wildlife Photographer"
--   suyash-pratap-singh → suyashpratapsingh "Travel Photography"
--   syed-taha-pasha     → syedtahapasha     "Landscape photography, wildlife,
--                                             art, culture, and cultural heritage."
--
-- All other members: tagline is NULL or empty string in legacy → not updated.
-- Rajnish (slug=admin) has empty tagline → excluded by WHERE clause and id guard.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

UPDATE bcc_v3.users v3u
JOIN bcc.bcc_photographers p
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
SET v3u.tagline = p.tagline
WHERE p.tagline IS NOT NULL
  AND p.tagline != ''
  AND p.tagline != 'Loading.....'
  AND v3u.id NOT IN (1,2,3,4,5,6,7);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0042_populate_users_tagline.sql', NOW());

COMMIT;
