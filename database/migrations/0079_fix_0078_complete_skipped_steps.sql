-- ============================================================================
-- 0079_fix_0078_complete_skipped_steps.sql
--
-- Migration 0078 aborted at line 157 (Step 5) because MySQL does not support
-- the IS DISTINCT FROM syntax used in the join_year/join_month correction.
-- All steps from Step 5 onward were skipped.
--
-- CRITICAL EFFECTS OF THE ABORT:
--   • Pool stuck at 27  — approving any PENDING member would attempt serial 27,
--     colliding with nowitsratan who already holds BCC20191100027.
--   • Immutability triggers dropped (Step 2/3) but never recreated (Step 12)
--     — membership_number is currently unprotected against UPDATE.
--   • membership_temp_identifiers still ACTIVE for all 41 historical members.
--   • membership_number_log has no entries for the 49 historical assignments.
--
-- This migration completes all skipped steps using MySQL-compatible syntax.
-- The 49 permanent numbers themselves are correct and untouched.
-- ============================================================================

-- ============================================================================
-- STEP A (= 0078 Step 9): CRITICAL — advance pool to next_operational_serial 53
-- The pool was at 27 (previous incomplete operational run). The highest
-- allocated serial after 0078 is 52. Setting to 53 prevents any collision.
-- ============================================================================

UPDATE membership_number_pool
SET next_operational_serial = 53
WHERE id = 1;

-- ============================================================================
-- STEP B (= 0078 Step 5, fixed): join_year / join_month corrections
-- Using NOT (a <=> b) — MySQL's NULL-safe IS DISTINCT FROM equivalent.
-- Step 4 of 0078 already wrote correct values for all non-founding members
-- (they had number_serial IS NULL so went through Step 4 fully).
-- This pass is idempotent for those; it only matters for founding members
-- whose join_year/join_month may differ from the 2019-11 default.
-- ============================================================================

UPDATE memberships m
  INNER JOIN (
    SELECT  4 AS mid, 2016 AS jy, 11 AS jm UNION ALL  -- rajnishkhare
    SELECT  5, 2019, 11 UNION ALL
    SELECT  6, 2019, 11 UNION ALL
    SELECT  7, 2019, 11 UNION ALL
    SELECT  8, 2019, 11 UNION ALL
    SELECT  9, 2019, 11 UNION ALL
    SELECT 10, 2019, 11 UNION ALL
    SELECT 20, 2019, 11 UNION ALL
    SELECT 62, 2019, 11 UNION ALL
    SELECT 56, 2019, 11 UNION ALL
    SELECT 58, 2019, 11 UNION ALL
    SELECT 59, 2019, 11 UNION ALL
    SELECT 60, 2019, 11 UNION ALL
    SELECT 65, 2019, 11 UNION ALL
    SELECT 64, 2019, 11 UNION ALL
    SELECT 70, 2019, 11 UNION ALL
    SELECT 74, 2019, 11 UNION ALL
    SELECT 44, 2019, 11 UNION ALL
    SELECT 11, 2019, 11 UNION ALL
    SELECT 12, 2019, 11 UNION ALL
    SELECT 21, 2019, 11 UNION ALL
    SELECT 50, 2019, 11 UNION ALL
    SELECT 61, 2019, 11 UNION ALL
    SELECT 69, 2019, 11 UNION ALL
    SELECT 76, 2019, 11 UNION ALL
    SELECT 13, 2019, 11 UNION ALL
    SELECT 14, 2019, 11 UNION ALL
    SELECT 15, 2019, 11 UNION ALL
    SELECT 22, 2019, 11 UNION ALL
    SELECT 23, 2019, 11 UNION ALL
    SELECT 63, 2019, 11 UNION ALL
    SELECT 67, 2019, 11 UNION ALL
    SELECT 68, 2019, 11 UNION ALL
    SELECT 71, 2019, 11 UNION ALL
    SELECT 73, 2019, 11 UNION ALL
    SELECT 17, 2019, 11 UNION ALL
    SELECT 53, 2019, 11 UNION ALL
    SELECT 52, 2019, 11 UNION ALL
    SELECT 57, 2019, 11 UNION ALL
    SELECT 72, 2019, 11 UNION ALL
    SELECT 25, 2021,  1 UNION ALL  -- rituahluwalia
    SELECT 16, 2022,  1 UNION ALL  -- prakashhatvalne
    SELECT 18, 2022,  1 UNION ALL  -- uttamgurjar
    SELECT 51, 2022,  7 UNION ALL  -- kuch_naya_karne_ki_talaashmai
    SELECT 66, 2022,  1 UNION ALL  -- rahulverma
    SELECT 24, 2023,  1 UNION ALL  -- animeshsaxena
    SELECT 26, 2023,  1 UNION ALL  -- sauvikacharyya
    SELECT 19, 2024,  1 UNION ALL  -- suyashpratapsingh
    SELECT 55, 2024,  1            -- gauravsharma
  ) AS h(mid, jy, jm) ON h.mid = m.id
SET
  m.join_year  = h.jy,
  m.join_month = h.jm
WHERE NOT (m.join_year <=> h.jy AND m.join_month <=> h.jm);

-- ============================================================================
-- STEP C (= 0078 Step 7): Insert membership_number_log for all 49 assignments
-- INSERT IGNORE: founding members whose log rows pre-date this migration
-- are silently skipped. Only assignments confirmed in the memberships table
-- are logged (inner join guards against phantom inserts).
-- ============================================================================

INSERT IGNORE INTO membership_number_log
  (membership_id, number_serial, membership_number,
   assignment_type, assigned_by_user_id, notes)
SELECT
  m.id,
  m.number_serial,
  m.membership_number,
  CASE
    WHEN m.number_serial BETWEEN 1 AND 7  THEN 'FOUNDING_RESERVED'
    WHEN m.number_serial BETWEEN 8 AND 17 THEN 'HISTORICAL_RESERVED'
    WHEN m.number_serial = 20             THEN 'HISTORICAL_RESERVED'
    ELSE 'HISTORICAL_MIGRATION_IMPORT'
  END AS assignment_type,
  1,   -- assigned_by_user_id: Rajnish Khare (Super Admin)
  'Historical migration: BCC_Permanent_Membership_Number_Allocation.xlsx — MEM-007 §7'
FROM memberships m
WHERE m.number_serial BETWEEN 1 AND 52
  AND m.membership_number IS NOT NULL
  AND m.owner_type = 'INDIVIDUAL';

-- ============================================================================
-- STEP D (= 0078 Step 8): Retire ACTIVE temp identifiers for all members
-- who now hold a permanent number. Any member with membership_number IS NOT
-- NULL no longer needs a temp identifier.
-- ============================================================================

UPDATE membership_temp_identifiers mti
  INNER JOIN memberships m ON m.id = mti.membership_id
SET
  mti.status     = 'RETIRED',
  mti.retired_at = NOW()
WHERE m.membership_number IS NOT NULL
  AND m.number_serial     IS NOT NULL
  AND mti.status = 'ACTIVE';

-- ============================================================================
-- STEP E (= 0078 Step 12, CRITICAL): Recreate immutability triggers
-- These were dropped in Steps 2/3 of 0078 and never recreated.
-- membership_number has been unprotected since 0078 ran.
-- ============================================================================

DELIMITER $$

DROP TRIGGER IF EXISTS trg_membership_number_immutable $$
CREATE TRIGGER trg_membership_number_immutable
BEFORE UPDATE ON memberships
FOR EACH ROW
BEGIN
  IF OLD.membership_number IS NOT NULL
     AND (NEW.membership_number IS NULL OR NEW.membership_number <> OLD.membership_number) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MEM-007 VIOLATION: membership_number is permanent (MP-001) and cannot be modified once assigned.';
  END IF;

  IF OLD.number_serial IS NOT NULL
     AND (NEW.number_serial IS NULL OR NEW.number_serial <> OLD.number_serial) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MEM-007 VIOLATION: number_serial is permanent (MP-001) and cannot be modified once assigned.';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_prevent_numbered_membership_delete $$
CREATE TRIGGER trg_prevent_numbered_membership_delete
BEFORE DELETE ON memberships
FOR EACH ROW
BEGIN
  IF OLD.number_serial IS NOT NULL OR OLD.membership_number IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MEM-007 VIOLATION: a membership with an allocated number cannot be hard-deleted (MP-003 non-reuse). Retire it via lifecycle_state instead.';
  END IF;
END $$

DELIMITER ;

-- ============================================================================
-- STEP F: Record this corrective migration
-- ============================================================================

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0079_fix_0078_complete_skipped_steps.sql', NOW());
