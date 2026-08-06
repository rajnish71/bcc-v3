-- ============================================================================
-- 0079_revision_2_permanent_membership_number_reconciliation.sql
--
-- REVISION 2 PERMANENT MEMBERSHIP NUMBER ALLOCATION MIGRATION (PRODUCTION HARDENED)
-- Authority: Authoritative Excel Register (BCC_Permanent_Membership_Number_Allocation.xlsx)
--
-- What this migration does:
--   1. Updates trg_membership_number_immutable (DDL: DROP TRIGGER IF EXISTS / CREATE TRIGGER)
--      upfront to introduce session-level maintenance override (@allow_membership_number_update).
--   2. Defines temporary procedure _validate_rev2_reconciliation() enforcing 4 automated validation gates:
--        Gate 1: Prefix alignment (membership_number prefix matches join_year and join_month).
--        Gate 2: Sequence serial uniqueness (number_serial has 0 duplicates).
--        Gate 3: Permanent number uniqueness (membership_number has 0 duplicates).
--        Gate 4: Sequence suffix alignment (RIGHT(membership_number, 5) matches number_serial).
--   3. Executes data updates inside a single transaction (START TRANSACTION ... COMMIT).
--   4. Uses a TWO-PHASE UPDATE (temporary negative serials/prefixes) to eliminate transient
--      uniqueness collisions on memberships.number_serial (UNIQUE) and membership_number (UNIQUE).
--   5. Re-assigns sequence 00044 to Dr. Rahul Verma (Dec 2019 member) and shifts downstream
--      members (Ritu 00045, Prakash 00046, Uttam 00047, Kuldeep 00048).
--   6. Synchronously updates memberships and membership_number_log tables (1-to-1 sync).
--   7. Invokes _validate_rev2_reconciliation() inside transaction before COMMIT.
--   8. Cleans up temporary staging tables and helper procedures.
-- ============================================================================

-- ============================================================================
-- STEP 1: Update immutability trigger definition (DDL upfront before transaction)
-- Adds session-level override gate (@allow_membership_number_update = TRUE)
-- ============================================================================

DELIMITER $$

DROP TRIGGER IF EXISTS trg_membership_number_immutable $$
CREATE TRIGGER trg_membership_number_immutable
BEFORE UPDATE ON memberships
FOR EACH ROW
BEGIN
  -- Maintenance bypass gate: active ONLY when explicit session variable is set
  IF @allow_membership_number_update IS NOT TRUE THEN
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
  END IF;
END $$

-- ============================================================================
-- STEP 2: Create temporary automated validation procedure (4 Enforced Gates)
-- Raises SIGNAL SQLSTATE '45000' if any prefix, serial, format, or suffix mismatch exists
-- ============================================================================

DROP PROCEDURE IF EXISTS _validate_rev2_reconciliation $$
CREATE PROCEDURE _validate_rev2_reconciliation()
BEGIN
  DECLARE mismatch_count INT DEFAULT 0;
  DECLARE dup_serial_count INT DEFAULT 0;
  DECLARE dup_number_count INT DEFAULT 0;
  DECLARE serial_suffix_mismatch_count INT DEFAULT 0;

  -- Gate 1: Check prefix alignment against join_year and join_month
  SELECT COUNT(*) INTO mismatch_count
  FROM memberships
  WHERE membership_number IS NOT NULL
    AND LEFT(SUBSTRING(membership_number, 4), 6)
        <> CONCAT(
              join_year,
              LPAD(join_month, 2, '0')
           );

  IF mismatch_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'REVISION 2 VALIDATION FAILED: Membership number prefix mismatches join year/month!';
  END IF;

  -- Gate 2: Check sequence serial uniqueness
  SELECT COUNT(*) - COUNT(DISTINCT number_serial) INTO dup_serial_count
  FROM memberships
  WHERE number_serial IS NOT NULL;

  IF dup_serial_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'REVISION 2 VALIDATION FAILED: Duplicate number_serial detected!';
  END IF;

  -- Gate 3: Check permanent membership number uniqueness
  SELECT COUNT(*) - COUNT(DISTINCT membership_number) INTO dup_number_count
  FROM memberships
  WHERE membership_number IS NOT NULL;

  IF dup_number_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'REVISION 2 VALIDATION FAILED: Duplicate membership_number detected!';
  END IF;

  -- Gate 4: Check sequence suffix alignment (RIGHT(membership_number, 5) == number_serial)
  SELECT COUNT(*) INTO serial_suffix_mismatch_count
  FROM memberships
  WHERE membership_number IS NOT NULL
    AND number_serial IS NOT NULL
    AND CAST(RIGHT(membership_number, 5) AS UNSIGNED) <> number_serial;

  IF serial_suffix_mismatch_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'REVISION 2 VALIDATION FAILED: membership_number suffix does not match number_serial!';
  END IF;
END $$

DELIMITER ;

-- ============================================================================
-- STEP 3: TRANSACTIONAL DATA RECONCILIATION & ENFORCED VALIDATION
-- ============================================================================

START TRANSACTION;

-- Enable session-level override for authorized administrative maintenance
SET @allow_membership_number_update = TRUE;

-- Create temporary staging table with finalized Revision 2 allocations (9 records)
CREATE TEMPORARY TABLE IF NOT EXISTS _rev2_updates (
  membership_id      BIGINT NOT NULL PRIMARY KEY,
  user_id            BIGINT NOT NULL,
  username           VARCHAR(100) NOT NULL,
  existing_perm_num  VARCHAR(20) NOT NULL,
  correct_perm_num   VARCHAR(20) NOT NULL,
  correct_serial     INT NOT NULL,
  join_year          SMALLINT NOT NULL,
  join_month         TINYINT NOT NULL
) ENGINE=MEMORY;

INSERT INTO _rev2_updates (membership_id, user_id, username, existing_perm_num, correct_perm_num, correct_serial, join_year, join_month) VALUES
  (66, 61, 'rahulverma',                   'BCC20191100048', 'BCC20191200044', 44, 2019, 12),
  (25, 30, 'rituahluwalia',                 'BCC20191100044', 'BCC20210100045', 45, 2021, 1),
  (16, 21, 'prakashhatvalne',               'BCC20191100045', 'BCC20220100046', 46, 2022, 1),
  (18, 23, 'uttamgurjar',                   'BCC20191100046', 'BCC20220100047', 47, 2022, 1),
  (51, 42, 'kuch_naya_karne_ki_talaashmai', 'BCC20191100047', 'BCC20220700048', 48, 2022, 7),
  (24, 29, 'animeshsaxena',                 'BCC20191100049', 'BCC20230100049', 49, 2023, 1),
  (26, 31, 'sauvikacharyya',                'BCC20191100050', 'BCC20230100050', 50, 2023, 1),
  (19, 24, 'suyashpratapsingh',             'BCC20191100051', 'BCC20240100051', 51, 2024, 1),
  (55, 48, 'gauravsharma',                  'BCC20191100052', 'BCC20240100052', 52, 2024, 1);

-- ----------------------------------------------------------------------------
-- PHASE 1: Move target updating rows to temporary negative serials and numbers.
-- Eliminates row-by-row transient uniqueness collisions on UNIQUE constraints
-- memberships.number_serial, memberships.membership_number,
-- membership_number_log.number_serial, and membership_number_log.membership_number.
-- ----------------------------------------------------------------------------

UPDATE memberships m
  INNER JOIN _rev2_updates u ON m.id = u.membership_id
SET
  m.number_serial     = -1 * u.membership_id,
  m.membership_number = CONCAT('REV2_TEMP_', u.membership_id);

UPDATE membership_number_log l
  INNER JOIN _rev2_updates u ON l.membership_id = u.membership_id
SET
  l.number_serial     = -1 * u.membership_id,
  l.membership_number = CONCAT('REV2_TEMP_', u.membership_id);

-- ----------------------------------------------------------------------------
-- PHASE 2: Apply final corrected serials, permanent numbers, and joining dates.
-- Target serials (44-52) and numbers are now 100% vacant; zero collision risk.
-- ----------------------------------------------------------------------------

UPDATE memberships m
  INNER JOIN _rev2_updates u ON m.id = u.membership_id
SET
  m.number_serial     = u.correct_serial,
  m.membership_number = u.correct_perm_num,
  m.join_year         = u.join_year,
  m.join_month        = u.join_month;

UPDATE membership_number_log l
  INNER JOIN _rev2_updates u ON l.membership_id = u.membership_id
SET
  l.number_serial     = u.correct_serial,
  l.membership_number = u.correct_perm_num,
  l.notes             = CONCAT(COALESCE(l.notes, ''), ' | Rev 2 Final Baseline: Serial ', u.correct_serial, ', Prefix updated to reflect actual join date ', u.join_year, '-', LPAD(u.join_month, 2, '0'));

-- Clean up staging table
DROP TEMPORARY TABLE IF EXISTS _rev2_updates;

-- Reset session override flag immediately after data updates
SET @allow_membership_number_update = NULL;

-- ENFORCED VALIDATION CHECK: Call procedure inside transaction before COMMIT.
-- Verifies Gate 1 (prefix), Gate 2 (serial uniqueness), Gate 3 (number uniqueness), Gate 4 (sequence suffix match).
-- If any gate fails, procedure raises SIGNAL SQLSTATE '45000', aborting execution.
CALL _validate_rev2_reconciliation();

COMMIT;

-- Clean up validation helper procedure after commit
DROP PROCEDURE IF EXISTS _validate_rev2_reconciliation;
