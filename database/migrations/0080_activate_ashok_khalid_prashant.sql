-- ============================================================================
-- 0080_activate_ashok_khalid_prashant.sql
--
-- Three historical members from the BCC_Permanent_Membership_Number_Allocation
-- workbook had user accounts but no membership records when migration 0078 ran.
-- Their reserved serials (18, 19, 28) appeared as gaps in verification Query 7
-- but are NOT constitutional gaps — they are assigned positions.
--
-- This migration:
--   1. Sets username ashokbathri for user 74 (Ashok Kumar Bathri)
--   2. Creates membership records for all three
--   3. Assigns their workbook-reserved permanent numbers directly
--   4. Sets lifecycle_state = ACTIVE
--   5. Logs to membership_number_log
--   6. Closes the three gaps — verification Query 7 should now return 0 rows
--
-- Workbook assignments:
--   Serial 18  → Ashok Kumar Bathri  (user 74)  → BCC20191100018
--   Serial 19  → Khalid Khan         (user 69)  → BCC20191100019
--   Serial 28  → Prashant Parate     (user 70)  → BCC20191100028
-- ============================================================================

-- ============================================================================
-- STEP 1: Set username for Ashok Kumar Bathri
-- ============================================================================

UPDATE users
SET username = 'ashokbathri'
WHERE id = 74
  AND username IS NULL;

-- ============================================================================
-- STEP 2: Create membership records for all three
-- Idempotent: INSERT IGNORE skips if a row already exists for that user_id.
-- membership_class_id resolved by code so no hardcoded ID.
-- ============================================================================

INSERT IGNORE INTO memberships
  (user_id, owner_type, membership_class_id, lifecycle_state, applied_at, created_at, updated_at)
SELECT
  u.id,
  'INDIVIDUAL',
  (SELECT id FROM membership_classes WHERE code = 'BASIC_MEMBER' LIMIT 1),
  'PENDING',
  NOW(),
  NOW(),
  NOW()
FROM users u
WHERE u.id IN (74, 69, 70)
  AND NOT EXISTS (
    SELECT 1 FROM memberships m WHERE m.user_id = u.id
  );

-- ============================================================================
-- STEP 3: Assign permanent numbers, activate, set join dates
-- WHERE number_serial IS NULL guards idempotency.
-- ============================================================================

-- Ashok Kumar Bathri → serial 18
UPDATE memberships
SET
  number_serial      = 18,
  membership_number  = 'BCC20191100018',
  number_assigned_at = NOW(),
  join_year          = 2019,
  join_month         = 11,
  lifecycle_state    = 'ACTIVE',
  activated_at       = NOW()
WHERE user_id = 74
  AND number_serial IS NULL;

-- Khalid Khan → serial 19
UPDATE memberships
SET
  number_serial      = 19,
  membership_number  = 'BCC20191100019',
  number_assigned_at = NOW(),
  join_year          = 2019,
  join_month         = 11,
  lifecycle_state    = 'ACTIVE',
  activated_at       = NOW()
WHERE user_id = 69
  AND number_serial IS NULL;

-- Prashant Parate → serial 28
UPDATE memberships
SET
  number_serial      = 28,
  membership_number  = 'BCC20191100028',
  number_assigned_at = NOW(),
  join_year          = 2019,
  join_month         = 11,
  lifecycle_state    = 'ACTIVE',
  activated_at       = NOW()
WHERE user_id = 70
  AND number_serial IS NULL;

-- ============================================================================
-- STEP 4: Log assignments to membership_number_log
-- Serials 18 and 19 fall in the HISTORICAL_RESERVED range (8–20).
-- Serial 28 falls in the HISTORICAL_MIGRATION_IMPORT range (21–52).
-- INSERT IGNORE: safe to re-run.
-- ============================================================================

INSERT IGNORE INTO membership_number_log
  (membership_id, number_serial, membership_number,
   assignment_type, assigned_by_user_id, notes)
SELECT
  m.id,
  m.number_serial,
  m.membership_number,
  CASE
    WHEN m.number_serial IN (18, 19) THEN 'HISTORICAL_RESERVED'
    ELSE 'HISTORICAL_MIGRATION_IMPORT'
  END,
  1,
  'Historical migration: BCC_Permanent_Membership_Number_Allocation.xlsx — MEM-007 §7 (backfill 0080)'
FROM memberships m
WHERE m.user_id IN (74, 69, 70)
  AND m.number_serial IS NOT NULL;

-- ============================================================================
-- STEP 5: Record migration
-- ============================================================================

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0080_activate_ashok_khalid_prashant.sql', NOW());
