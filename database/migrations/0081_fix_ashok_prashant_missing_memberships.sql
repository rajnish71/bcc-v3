-- ============================================================================
-- 0081_fix_ashok_prashant_missing_memberships.sql
--
-- Migration 0080's INSERT IGNORE silently skipped users 74 (Ashok Bathri)
-- and 70 (Prashant Parate) because the `uuid` column is NOT NULL with no
-- default, and the INSERT did not supply it.
-- Khalid Khan (user 69) was unaffected — he already had a membership row
-- from a previous operation.
--
-- This migration completes what 0080 missed for those two users.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create membership rows with uuid for users 74 and 70
-- ============================================================================

INSERT IGNORE INTO memberships
  (uuid, user_id, owner_type, membership_class_id, lifecycle_state,
   applied_at, created_at, updated_at)
SELECT
  UUID(),
  u.id,
  'INDIVIDUAL',
  (SELECT id FROM membership_classes WHERE code = 'BASIC_MEMBER' LIMIT 1),
  'PENDING',
  NOW(),
  NOW(),
  NOW()
FROM users u
WHERE u.id IN (74, 70)
  AND NOT EXISTS (
    SELECT 1 FROM memberships m WHERE m.user_id = u.id
  );

-- ============================================================================
-- STEP 2: Assign permanent numbers and activate
-- ============================================================================

-- Ashok Kumar Bathri (user 74) → serial 18
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

-- Prashant Parate (user 70) → serial 28
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
-- STEP 3: Log assignments
-- ============================================================================

INSERT IGNORE INTO membership_number_log
  (membership_id, number_serial, membership_number,
   assignment_type, assigned_by_user_id, notes)
SELECT
  m.id,
  m.number_serial,
  m.membership_number,
  CASE
    WHEN m.number_serial = 18 THEN 'HISTORICAL_RESERVED'
    ELSE 'HISTORICAL_MIGRATION_IMPORT'
  END,
  1,
  'Historical migration: BCC_Permanent_Membership_Number_Allocation.xlsx — MEM-007 §7 (backfill 0081)'
FROM memberships m
WHERE m.user_id IN (74, 70)
  AND m.number_serial IS NOT NULL;

-- ============================================================================
-- STEP 4: Record migration
-- ============================================================================

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0081_fix_ashok_prashant_missing_memberships.sql', NOW());
