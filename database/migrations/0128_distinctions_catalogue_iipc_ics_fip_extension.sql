-- ============================================================================
-- 0128_distinctions_catalogue_iipc_ics_fip_extension.sql
-- Photographic Distinctions -- Management-approved catalogue extension for the
-- distinctions stated in Dinesh Mawar Saxena's supplied Bio-Data.
--
-- Uses the existing catalogue architecture only (no new table, no OTHER
-- institution, no legacy user_photo_titles).
--
-- Institutions added (extensible catalogue, resolved by code):
--   IIPC  India International Photographic Council
--   ICS   Image Colleague Society
--
-- Distinctions added (names and display codes follow the Bio-Data wording;
-- no expansion or meaning is invented for FIP-5* or IIPC-Platinum):
--   FIP   FFIP            Fellow
--   FIP   FIP-5*          FIP-5*
--   IIPC  AIIPC           Associate
--   IIPC  IIPC-Platinum   IIPC-Platinum
--   ICS   Hon. FICS       Honorary Fellow
--
-- AFIAP already exists under FIAP (0116) and is not touched. Year, place and
-- election-date detail from the Bio-Data is not catalogue data; it stays in
-- the member's free-text Awards & Recognition field.
--
-- New rows are NOT badge eligible (an explicit HA/admin decision, never
-- broadened by seeding). Existing rows are never modified. No member
-- declarations are created here.
--
-- Idempotency: INSERT IGNORE on uq_photo_inst_code and
-- uq_photo_dist_institution_code; institutions resolved by code, not id.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO photographic_institutions (code, name, is_active, sort_order) VALUES
  ('IIPC', 'India International Photographic Council', 1, 60),
  ('ICS',  'Image Colleague Society',                  1, 70);

INSERT IGNORE INTO photographic_distinctions
  (institution_id, code, display_code, name, badge_eligible, is_active, sort_order)
SELECT i.id, s.code, s.display_code, s.name, 0, 1, s.sort_order
FROM (  SELECT 'FIP' AS institution_code, 'FFIP' AS code, 'FFIP' AS display_code, 'Fellow' AS name, 130 AS sort_order
  UNION ALL SELECT 'FIP',  'FIP_5STAR',     'FIP-5*',        'FIP-5*',         140
  UNION ALL SELECT 'IIPC', 'AIIPC',         'AIIPC',         'Associate',      10
  UNION ALL SELECT 'IIPC', 'IIPC_PLATINUM', 'IIPC-Platinum', 'IIPC-Platinum',  20
  UNION ALL SELECT 'ICS',  'HON_FICS',      'Hon. FICS',     'Honorary Fellow', 10
) AS s
JOIN photographic_institutions i ON i.code = s.institution_code;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0128_distinctions_catalogue_iipc_ics_fip_extension.sql', NOW());

COMMIT;
