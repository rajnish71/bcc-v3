-- Migration 0074: Canonicalize all phone numbers to 10-digit Indian mobile format.
--
-- Background: phone normalization was introduced in application code (commit f91a7af)
-- but existing rows were not updated. This migration brings the database into line
-- with the canonical format: exactly 10 digits, no country-code prefix.
--
-- Covered legacy formats:
--   +91XXXXXXXXXX (13 chars) → SUBSTRING(phone, 4)
--    91XXXXXXXXXX (12 chars) → SUBSTRING(phone, 3)
--     0XXXXXXXXXX (11 chars) → SUBSTRING(phone, 2)
--    XXXXXXXXXX   (10 chars) → unchanged
--
-- Pre-check (run before applying UPDATE blocks; abort if any rows returned):
--
--   SELECT canonical, COUNT(*) AS cnt, GROUP_CONCAT(id) AS user_ids
--   FROM (
--     SELECT id,
--       CASE
--         WHEN phone LIKE '+91%' AND CHAR_LENGTH(phone) = 13 THEN SUBSTRING(phone, 4)
--         WHEN phone LIKE '91%'  AND CHAR_LENGTH(phone) = 12 THEN SUBSTRING(phone, 3)
--         WHEN phone LIKE '0%'   AND CHAR_LENGTH(phone) = 11 THEN SUBSTRING(phone, 2)
--         ELSE phone
--       END AS canonical
--     FROM users WHERE phone IS NOT NULL
--   ) t
--   GROUP BY canonical HAVING cnt > 1;
--
-- After successful migration, remove phone-lookup.util.ts per its removal instructions.

-- Step 1: Canonicalize users.phone
UPDATE users
SET phone = CASE
  WHEN phone LIKE '+91%' AND CHAR_LENGTH(phone) = 13 THEN SUBSTRING(phone, 4)
  WHEN phone LIKE '91%'  AND CHAR_LENGTH(phone) = 12 THEN SUBSTRING(phone, 3)
  WHEN phone LIKE '0%'   AND CHAR_LENGTH(phone) = 11 THEN SUBSTRING(phone, 2)
  ELSE phone
END
WHERE phone IS NOT NULL;

-- Step 2: Canonicalize otp_codes.phone (OTPs expire in 5 minutes; in practice empty)
UPDATE otp_codes
SET phone = CASE
  WHEN phone LIKE '+91%' AND CHAR_LENGTH(phone) = 13 THEN SUBSTRING(phone, 4)
  WHEN phone LIKE '91%'  AND CHAR_LENGTH(phone) = 12 THEN SUBSTRING(phone, 3)
  WHEN phone LIKE '0%'   AND CHAR_LENGTH(phone) = 11 THEN SUBSTRING(phone, 2)
  ELSE phone
END
WHERE phone IS NOT NULL;

-- Step 3: Record migration
INSERT INTO schema_migrations (filename) VALUES ('0074_canonicalize_phone_numbers.sql');
