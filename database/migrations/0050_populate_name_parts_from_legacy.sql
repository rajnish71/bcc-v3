-- ============================================================================
-- 0050_populate_name_parts_from_legacy.sql
-- Phase D -- Batch D2: Populate name_title, first_name, last_name from legacy
--
-- Source: bcc.bcc_photographers.first_name + bcc.bcc_photographers.surname
-- Target: bcc_v3.users.name_title, first_name, last_name (middle_name = NULL for all)
-- Scope:  17 migrated legacy members (founding members excluded via id guard)
--
-- name_title is derived from bcc_v3.users.full_name using CASE WHEN LIKE:
--   'Dr. %'   → 'Dr.'
--   'Mr. %'   → 'Mr.'
--   'Mrs. %'  → 'Mrs.'
--   'Ms. %'   → 'Ms.'
--   'Prof. %' → 'Prof.'
--   else      → NULL
--
-- Members who receive a name_title (confirmed from V3 full_name):
--   anilbhati          'Dr. Anil Bhati'         → Dr.
--   animeshsaxena      'Dr. Animesh Saxena'      → Dr.
--   sandeepjain        'Dr. Sandeep Jain'        → Dr.
--   sanjaykumarshukla  'Dr. Sanjay Kumar Shukla' → Dr.
--   syedtahapasha      'Mr. Syed Taha Pasha'     → Mr.
--
-- Compound first_names (legacy bcc_photographers.first_name field):
--   sanjaykumarshukla: first_name = 'Sanjay Kumar' (stored as-is)
-- Compound last_names (legacy bcc_photographers.surname field):
--   suyashpratapsingh: last_name = 'Pratap Singh' (stored as-is)
--   syedtahapasha:     last_name = 'Taha Pasha'   (stored as-is)
--
-- After populating, recomputes full_name for all updated rows.
-- The recompute is a no-op for members whose full_name was already correct.
-- Idempotent: safe to re-run.
-- REQUIRES: sudo mysql (cross-database JOIN)
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- ============================================================================
-- STEP 1: Populate name_title, first_name, last_name
-- ============================================================================

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
SET
  v3u.name_title  = CASE
    WHEN v3u.full_name LIKE 'Dr. %'   THEN 'Dr.'
    WHEN v3u.full_name LIKE 'Mr. %'   THEN 'Mr.'
    WHEN v3u.full_name LIKE 'Mrs. %'  THEN 'Mrs.'
    WHEN v3u.full_name LIKE 'Ms. %'   THEN 'Ms.'
    WHEN v3u.full_name LIKE 'Prof. %' THEN 'Prof.'
    ELSE NULL
  END,
  v3u.first_name  = p.first_name,
  v3u.middle_name = NULL,
  v3u.last_name   = p.surname
WHERE p.first_name IS NOT NULL
  AND p.first_name != ''
  AND v3u.id NOT IN (1,2,3,4,5,6,7);

-- ============================================================================
-- STEP 2: Recompute full_name from name parts for all updated rows
-- Produces the same value that already exists — this is a safety idempotency check.
-- ============================================================================

UPDATE bcc_v3.users
SET full_name = TRIM(CONCAT_WS(' ',
  NULLIF(name_title, ''),
  first_name,
  NULLIF(middle_name, ''),
  last_name
))
WHERE first_name IS NOT NULL
  AND id NOT IN (1,2,3,4,5,6,7);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0050_populate_name_parts_from_legacy.sql', NOW());

COMMIT;
