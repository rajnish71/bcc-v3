-- 0035_migration_track_c_legacy_members.sql
-- Migration Track C: Legacy Member Accounts, Memberships, and Portfolio Photos
--
-- 18 new users (2 Registered Users + 16 Basic Members)
-- 16 ACTIVE Basic memberships, membership_number = NULL (MEM-007 Amendment 001)
-- 16 BCCTempXXXXX temporary identifiers (BCCTemp00001..BCCTemp00016)
-- 312 portfolio photos from bcc.bcc_photographer_photos -> bcc_v3.photos
--
-- SKIPPED (already in V3 as Founding Member):
--   admin / Rajnish Khare (user_id=1)
--
-- DISCARDED (confirmed test data):
--   rahul-kahar, writer (Prakash Writer), salil-jain, guest-user (Anil Guest)
--
-- REGISTERED USERS ONLY (no membership -- retained as platform identity):
--   afzal-khan (Afzal Khan), priya-ojha (Priya Ojha)
--
-- DATA QUALITY NOTES:
--   meeta-athavale: phone '1111' -> NULL (invalid)
--   ritu-ahluwalia: phone '1111' -> NULL (invalid)
--   sanjay-shukla: phone '+9198959996930' stored as-is (13 digits, likely +919895999693 -- FLAG FOR REVIEW)
--   meeta-athavale, ritu-ahluwalia: no bcc_member_profiles row in legacy -- migrated as ACTIVE Basic
--
-- REQUIRES: sudo mysql (cross-database SELECT from bcc.bcc_photographer_photos)
-- CONSTITUTION: MEM-006 P1 (identity independent of membership)
--               MEM-007 Amendment 001 (BCCTempXXXXX for all non-founding members)
--               All legacy members migrate as Basic Members (migration policy)

SET NAMES utf8mb4;

START TRANSACTION;

-- =====================================================================
-- STEP 1: 18 new users in bcc_v3.users
-- =====================================================================

INSERT INTO bcc_v3.users
  (uuid, email, phone, password_hash, full_name, status, username,
   city, state, country, registration_method, force_password_reset, created_by,
   created_at, updated_at)
VALUES
  (UUID(), 'afzalkhan@bcc.in', '+919876594350',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Afzal Khan', 'ACTIVE', 'afzalkhan',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'priyaojha@bcc.in', '+919876591819',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Priya Ojha', 'ACTIVE', 'priyaojha',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'kshitijpatle@gmail.com', '+918819027278',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Kshitij Patle', 'ACTIVE', 'kshitijpatle',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'meetaathavale@bhopal.info', NULL,
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Meeta Athavale', 'ACTIVE', 'meetaathavale',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'ankit.tiwari86@gmail.com', '+919301944061',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Ankit Tiwari', 'ACTIVE', 'ankittiwari',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'rahilkhan@bcc.in', '+919827054005',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Rahil Khan', 'ACTIVE', 'rahilkhan',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'anilbhati@bcc.in', '+919826020137',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Dr. Anil Bhati', 'ACTIVE', 'anilbhati',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'prakashhatvalne@bcc.in', '+919876525374',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Prakash Hatvalne', 'ACTIVE', 'prakashhatvalne',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'robindutta.bhopal@gmail.com', '+919977992478',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Robin Dutta', 'ACTIVE', 'robindutta',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'uttamcreative@gmail.com', '+919009979796',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Uttam Gurjar', 'ACTIVE', 'uttamgurjar',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'suyashsingh@bcc.in', '+919806050000',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Suyash Pratap Singh', 'ACTIVE', 'suyashpratapsingh',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'syedtahapasha@bcc.in', '+919876534463',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Mr. Syed Taha Pasha', 'ACTIVE', 'syedtahapasha',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'sandeepjain@bcc.in', '+919826070812',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Dr. Sandeep Jain', 'ACTIVE', 'sandeepjain',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'sanjayshukla@bhopal.info', '+9198959996930',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Dr. Sanjay Kumar Shukla', 'ACTIVE', 'sanjaykumarshukla',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'akshitajain@bcc.in', '+919876597874',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Akshita Jain', 'ACTIVE', 'akshitajain',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'dranimeshsaxena@gmail.com', '+916262603128',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Dr. Animesh Saxena', 'ACTIVE', 'animeshsaxena',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'ritu@bhopal.info', NULL,
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Ritu Ahluwalia', 'ACTIVE', 'rituahluwalia',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW()),
  (UUID(), 'sauvikacharyya@bcc.in', '+919876542307',
   '$2b$12$0jFf.5udU4SoR.hUXL3hP.iZ8HEsGZoOXWPSUb4jj9tC3hKKI.2.y',
   'Sauvik Acharyya', 'ACTIVE', 'sauvikacharyya',
   'Bhopal', 'Madhya Pradesh', 'India', 'ADMIN_CREATED', 1, 1, NOW(), NOW());

-- =====================================================================
-- STEP 2: 16 ACTIVE Basic memberships
-- =====================================================================

INSERT INTO bcc_v3.memberships
  (uuid, owner_type, user_id, membership_class_id, lifecycle_state,
   join_year, join_month, applied_at, approved_at, activated_at,
   last_payment_status, created_at, updated_at)
SELECT UUID(), 'INDIVIDUAL', u.id, 5, 'ACTIVE', m.jy, 1, m.jd, m.jd, m.jd, 'NONE', NOW(), NOW()
FROM (
  SELECT 'kshitijpatle' AS uname, 2017 AS jy, '2017-01-01 00:00:00' AS jd UNION ALL
  SELECT 'meetaathavale', 2017, '2017-01-01 00:00:00' UNION ALL
  SELECT 'ankittiwari', 2018, '2018-01-01 00:00:00' UNION ALL
  SELECT 'rahilkhan', 2018, '2018-01-01 00:00:00' UNION ALL
  SELECT 'anilbhati', 2019, '2019-01-01 00:00:00' UNION ALL
  SELECT 'prakashhatvalne', 2019, '2019-01-01 00:00:00' UNION ALL
  SELECT 'robindutta', 2019, '2019-01-01 00:00:00' UNION ALL
  SELECT 'uttamgurjar', 2019, '2019-01-01 00:00:00' UNION ALL
  SELECT 'suyashpratapsingh', 2020, '2020-01-01 00:00:00' UNION ALL
  SELECT 'syedtahapasha', 2021, '2021-01-01 00:00:00' UNION ALL
  SELECT 'sandeepjain', 2022, '2022-01-01 00:00:00' UNION ALL
  SELECT 'sanjaykumarshukla', 2022, '2022-01-01 00:00:00' UNION ALL
  SELECT 'akshitajain', 2023, '2023-01-01 00:00:00' UNION ALL
  SELECT 'animeshsaxena', 2023, '2023-01-01 00:00:00' UNION ALL
  SELECT 'rituahluwalia', 2023, '2023-01-01 00:00:00' UNION ALL
  SELECT 'sauvikacharyya', 2023, '2023-01-01 00:00:00'
) m JOIN bcc_v3.users u ON u.username = m.uname;

-- =====================================================================
-- STEP 3: BCCTemp00001..BCCTemp00016
-- =====================================================================

INSERT INTO bcc_v3.membership_temp_identifiers (membership_id, temp_identifier, status, issued_at)
SELECT ms.id,
  CONCAT('BCCTemp', LPAD(ROW_NUMBER() OVER (ORDER BY u.id ASC), 5, '0')),
  'ACTIVE', NOW()
FROM bcc_v3.memberships ms
JOIN bcc_v3.users u ON u.id = ms.user_id
WHERE u.username IN (
  'kshitijpatle','meetaathavale','ankittiwari','rahilkhan',
  'anilbhati','prakashhatvalne','robindutta','uttamgurjar',
  'suyashpratapsingh','syedtahapasha','sandeepjain','sanjaykumarshukla',
  'akshitajain','animeshsaxena','rituahluwalia','sauvikacharyya'
) AND ms.membership_number IS NULL;

-- =====================================================================
-- STEP 4: Audit log
-- =====================================================================

INSERT INTO bcc_v3.membership_audit_log
  (membership_id, event_type, actor_type, actor_user_id, old_value, new_value, notes, created_at)
SELECT ms.id, 'MEMBERSHIP_ACTIVATED', 'ADMIN', 1, 'NONE', 'ACTIVE',
  'Migration Track C: imported from bcc.bcc_photographers', NOW()
FROM bcc_v3.memberships ms JOIN bcc_v3.users u ON u.id = ms.user_id
WHERE u.username IN (
  'kshitijpatle','meetaathavale','ankittiwari','rahilkhan',
  'anilbhati','prakashhatvalne','robindutta','uttamgurjar',
  'suyashpratapsingh','syedtahapasha','sandeepjain','sanjaykumarshukla',
  'akshitajain','animeshsaxena','rituahluwalia','sauvikacharyya'
);

-- =====================================================================
-- STEP 5: 312 portfolio photos (cross-database, requires sudo mysql)
-- =====================================================================

INSERT INTO bcc_v3.photos
  (uuid, owner_user_id, r2_key, original_filename, mime_type, file_format,
   file_size_bytes, sha256_hash, status, confirmed_at, title, caption,
   width_px, height_px, exif_camera_make, exif_camera_model, exif_lens_model,
   exif_aperture, exif_shutter_speed, exif_iso, exif_focal_length,
   gps_stripped, genre, visibility, created_at, updated_at)
SELECT UUID(), v3u.id,
  SUBSTRING(pp.image_url, 2), SUBSTRING_INDEX(pp.image_url, '/', -1),
  'image/jpeg', 'JPEG', NULL, NULL, 'ACTIVE', pp.created_at,
  pp.title, pp.description, pp.width, pp.height,
  pp.camera_make, pp.camera_model, pp.lens,
  CASE WHEN pp.aperture IS NULL THEN NULL
       ELSE CAST(REPLACE(pp.aperture, 'f/', '') AS DECIMAL(5,2)) END,
  pp.shutter_speed, pp.iso,
  CASE WHEN pp.focal_length IS NULL THEN NULL
       ELSE CAST(TRIM(REPLACE(REPLACE(pp.focal_length, 'mm', ''), ' ', '')) AS DECIMAL(7,2)) END,
  1,
  CASE (SELECT c.name FROM bcc.bcc_photo_categories pc
        JOIN bcc.bcc_categories c ON c.id = pc.category_id
        WHERE pc.photo_id = pp.id
        ORDER BY CASE c.name WHEN 'Wildlife' THEN 1 WHEN 'Macro' THEN 2
          WHEN 'Portrait' THEN 3 WHEN 'Street' THEN 4 WHEN 'Architecture' THEN 5
          WHEN 'Monuments' THEN 6 WHEN 'Landscape' THEN 7 WHEN 'Travel' THEN 8
          WHEN 'Astro' THEN 9 WHEN 'Event' THEN 10 ELSE 99 END ASC LIMIT 1)
    WHEN 'Wildlife' THEN 'WILDLIFE' WHEN 'Macro' THEN 'MACRO'
    WHEN 'Portrait' THEN 'PORTRAIT' WHEN 'Street' THEN 'STREET'
    WHEN 'Architecture' THEN 'ARCHITECTURE' WHEN 'Monuments' THEN 'ARCHITECTURE'
    WHEN 'Landscape' THEN 'LANDSCAPE' WHEN 'Travel' THEN 'TRAVEL'
    WHEN 'Astro' THEN 'NIGHT' WHEN 'Event' THEN 'DOCUMENTARY' ELSE 'OTHER' END,
  'PUBLIC', pp.created_at, pp.updated_at
FROM bcc.bcc_photographer_photos pp
JOIN bcc.bcc_photographers p ON p.id = pp.photographer_id
JOIN bcc_v3.users v3u ON v3u.username = CASE p.slug
  WHEN 'kshitij-patle' THEN 'kshitijpatle' WHEN 'ankit-tiwari' THEN 'ankittiwari'
  WHEN 'rahil-khan' THEN 'rahilkhan' WHEN 'dr-bhati' THEN 'anilbhati'
  WHEN 'prakash-hatvalne' THEN 'prakashhatvalne' WHEN 'robin-dutta' THEN 'robindutta'
  WHEN 'uttam-gurjar' THEN 'uttamgurjar' WHEN 'suyash-pratap-singh' THEN 'suyashpratapsingh'
  WHEN 'syed-taha-pasha' THEN 'syedtahapasha' WHEN 'dr-sandeep-jain' THEN 'sandeepjain'
  WHEN 'sanjay-shukla' THEN 'sanjaykumarshukla' WHEN 'akshita-jain' THEN 'akshitajain'
  WHEN 'dr-animesh-saxena' THEN 'animeshsaxena' END
WHERE p.slug IN (
  'kshitij-patle','ankit-tiwari','rahil-khan','dr-bhati',
  'prakash-hatvalne','robin-dutta','uttam-gurjar','suyash-pratap-singh',
  'syed-taha-pasha','dr-sandeep-jain','sanjay-shukla','akshita-jain','dr-animesh-saxena');

-- =====================================================================
-- STEP 6: Record migration
-- =====================================================================

INSERT INTO bcc_v3.schema_migrations (filename, applied_at)
VALUES ('0035_migration_track_c_legacy_members.sql', NOW());

COMMIT;
