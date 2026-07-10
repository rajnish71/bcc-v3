-- 0038_phase_c_social_handles_migration.sql
-- Phase C -- Batch C3: Legacy social handles migration
--
-- Source:  bcc.bcc_photographers (legacy database, bhopal-prod-01)
-- Target:  bcc_v3.user_social_handles
--
-- Migrated platforms:
--   INSTAGRAM  -- from social_links->>'$.instagram'  (15 members with non-empty value)
--   WEBSITE    -- from website_url column             (1 member: syed-taha-pasha)
--
-- Discarded (per Phase_C_Reconciliation_Report.md):
--   FLICKR, YOUTUBE, FIVE_HUNDRED_PX  -- universally empty in legacy
--   X, FACEBOOK, LINKEDIN, TIKTOK     -- no V3 ENUM target
--
-- Idempotent: INSERT IGNORE on UNIQUE(user_id, platform) constraint.
-- Re-running this migration is safe -- duplicate rows are silently skipped.
--
-- Slug -> V3 username mapping matches 0035_migration_track_c_legacy_members.sql.
-- Rajnish (slug=admin) has all-empty social_links -- no row inserted.
-- meeta-athavale and ritu-ahluwalia have empty/missing instagram -- no row inserted.
-- afzal-khan has is_active=1 in legacy and a V3 account -- instagram row included.
--
-- CONSTITUTION: No founding member data is altered.
-- REQUIRES: bcc_v3_app must have SELECT on bcc.* (confirmed in Phase C inspection).

SET NAMES utf8mb4;

START TRANSACTION;

-- =====================================================================
-- STEP 1: INSTAGRAM handles
-- Source: bcc.bcc_photographers.social_links->>'$.instagram'
-- Filter: is_active=1, non-empty string
-- =====================================================================

INSERT IGNORE INTO bcc_v3.user_social_handles (user_id, platform, handle_or_url)
SELECT
  v3u.id,
  'INSTAGRAM',
  JSON_UNQUOTE(p.social_links->>'$.instagram')
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
WHERE p.is_active = 1
  AND JSON_VALID(p.social_links)
  AND JSON_UNQUOTE(p.social_links->>'$.instagram') IS NOT NULL
  AND JSON_UNQUOTE(p.social_links->>'$.instagram') != '';

-- =====================================================================
-- STEP 2: WEBSITE handle
-- Source: bcc.bcc_photographers.website_url (separate column)
-- Filter: is_active=1, non-empty string
-- Only syed-taha-pasha has a non-empty value in this column.
-- =====================================================================

INSERT IGNORE INTO bcc_v3.user_social_handles (user_id, platform, handle_or_url)
SELECT
  v3u.id,
  'WEBSITE',
  TRIM(p.website_url)
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
WHERE p.is_active = 1
  AND p.website_url IS NOT NULL
  AND TRIM(p.website_url) != '';

-- =====================================================================
-- STEP 3: Record migration
-- =====================================================================

INSERT INTO bcc_v3.schema_migrations (filename, applied_at)
VALUES ('0038_phase_c_social_handles_migration.sql', NOW());

COMMIT;
