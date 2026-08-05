-- ============================================================================
-- 0078_historical_membership_number_migration.sql
--
-- AUTHORIZED ADMINISTRATIVE MIGRATION — 2026-08-05
-- Authority: Rajnish K. Khare (BCC Super Admin)
-- Source: BCC_Permanent_Membership_Number_Allocation.xlsx (authoritative)
--
-- This migration finalises all historical membership number assignments and
-- enables permanent automatic number allocation for all future activations.
--
-- What this migration does:
--   A. Assigns permanent membership numbers to all 49 historical members
--   B. Updates join_year / join_month corrections from the workbook
--   C. Advances any non-ACTIVE historical member to ACTIVE
--   D. Logs every assignment to membership_number_log
--   E. Retires all temp identifiers for now-numbered memberships
--   F. Advances membership_number_pool.next_operational_serial to 53
--   G. Recreates immutability triggers
--
-- Allocation scheme:
--   Serials 1–7   : FOUNDING_RESERVED   (Founding Members, 2019-11)
--   Serials 8–20  : HISTORICAL_RESERVED  (Historical Block; 18/19 not allocated)
--   Serials 21–52 : HISTORICAL_MIGRATION_IMPORT (pre-V3 members; 28 not allocated)
--   Serial 53+    : OPERATIONAL_SEQUENTIAL — assigned automatically by
--                   MembershipNumberingService.assignPermanentNumber() on
--                   every APPROVED → ACTIVE transition (live from this migration)
--
-- All historical membership numbers use BCC201911XXXXX as the date component
-- regardless of the member's actual join date. MEM-007 §5 authorises the
-- 2019-11 canonical pre-incorporation date for all pre-V3 allocations.
-- The memberships.join_year / join_month columns reflect actual join dates.
--
-- Intentionally unallocated serials: 18, 19, 28 (constitutional gaps).
-- These are permanently retired per MP-003 (no reuse).
--
-- Two PENDING test memberships (not in this workbook) are deliberately left
-- untouched — they will receive serials 53 and 54 automatically when an
-- administrator approves them.
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop immutability triggers
-- (authorized one-time migration; recreated in STEP 12)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_membership_number_immutable;
DROP TRIGGER IF EXISTS trg_prevent_numbered_membership_delete;

-- ============================================================================
-- STEP 2: Disable FK checks for migration efficiency
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- STEP 3: Build the authoritative allocation manifest
-- Source: BCC_Permanent_Membership_Number_Allocation.xlsx, Master Allocation sheet
--
-- Columns: membership_id | number_serial | membership_number | join_year
--          | join_month  | assignment_type
-- ============================================================================

CREATE TEMPORARY TABLE IF NOT EXISTS _hist_alloc (
  membership_id    BIGINT NOT NULL PRIMARY KEY,
  number_serial    INT    NOT NULL UNIQUE,
  membership_number VARCHAR(20) NOT NULL,
  join_year        SMALLINT NOT NULL,
  join_month       TINYINT  NOT NULL,
  assignment_type  ENUM('FOUNDING_RESERVED','HISTORICAL_RESERVED','HISTORICAL_MIGRATION_IMPORT') NOT NULL
) ENGINE=MEMORY;

INSERT INTO _hist_alloc VALUES
-- ── Founding Members (serials 1–7) ──────────────────────────────────────────
-- Constitutional class; pre-incorporation date 2019-11 for all number fields.
  (4,  1,  'BCC20191100001', 2019, 11, 'FOUNDING_RESERVED'),   -- Rajnish Khare
  (5,  2,  'BCC20191100002', 2019, 11, 'FOUNDING_RESERVED'),   -- Anupam Khare Gupta
  (6,  3,  'BCC20191100003', 2019, 11, 'FOUNDING_RESERVED'),   -- Divya Jangalwa
  (7,  4,  'BCC20191100004', 2019, 11, 'FOUNDING_RESERVED'),   -- Mukesh Jangalwa
  (8,  5,  'BCC20191100005', 2019, 11, 'FOUNDING_RESERVED'),   -- Viral Gupta
  (9,  6,  'BCC20191100006', 2019, 11, 'FOUNDING_RESERVED'),   -- Murli Patidar
  (10, 7,  'BCC20191100007', 2019, 11, 'FOUNDING_RESERVED'),   -- Oshin Jangalwa

-- ── Historical Reserved Block (serials 8–20; serials 18/19 not allocated) ───
  (20, 8,  'BCC20191100008', 2019, 11, 'HISTORICAL_RESERVED'), -- Syed Taha Pasha
  (62, 9,  'BCC20191100009', 2019, 11, 'HISTORICAL_RESERVED'), -- Kamal Khushalani
  (56, 10, 'BCC20191100010', 2019, 11, 'HISTORICAL_RESERVED'), -- Nikkhil Raghuwanshi
  (58, 11, 'BCC20191100011', 2019, 11, 'HISTORICAL_RESERVED'), -- Nyonika Rawal
  (59, 12, 'BCC20191100012', 2019, 11, 'HISTORICAL_RESERVED'), -- Neha Abhay Zode
  (60, 13, 'BCC20191100013', 2019, 11, 'HISTORICAL_RESERVED'), -- Feher Murtaza
  (65, 14, 'BCC20191100014', 2019, 11, 'HISTORICAL_RESERVED'), -- Narendra Shrivastava
  (64, 15, 'BCC20191100015', 2019, 11, 'HISTORICAL_RESERVED'), -- Naresh Motwani
  (70, 16, 'BCC20191100016', 2019, 11, 'HISTORICAL_RESERVED'), -- Lubna Rashid
  (74, 17, 'BCC20191100017', 2019, 11, 'HISTORICAL_RESERVED'), -- Varun Saxena
  -- Serials 18 and 19: intentionally unallocated (constitutional gaps)
  (44, 20, 'BCC20191100020', 2019, 11, 'HISTORICAL_RESERVED'), -- Afzal Khan

-- ── Historical Migration Import (serials 21–52; serial 28 not allocated) ────
-- All use BCC201911 prefix per MEM-007 §5 pre-incorporation canonical date.
-- join_year/join_month in memberships reflect actual historical join dates.
  (11, 21, 'BCC20191100021', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Kshitij Patle
  (12, 22, 'BCC20191100022', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Meeta Athavale
  (21, 23, 'BCC20191100023', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Dr. Sandeep Jain
  (50, 24, 'BCC20191100024', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Yogesh More
  (61, 25, 'BCC20191100025', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Gagan Palia
  (69, 26, 'BCC20191100026', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Anukriti Parsai
  (76, 27, 'BCC20191100027', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Ratan Singh
  -- Serial 28: intentionally unallocated (constitutional gap)
  (13, 29, 'BCC20191100029', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Ankit Tiwari
  (14, 30, 'BCC20191100030', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Rahil Khan
  (15, 31, 'BCC20191100031', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Dr. Anil Bhati
  (22, 32, 'BCC20191100032', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Dr. Sanjay Kumar Shukla
  (23, 33, 'BCC20191100033', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Akshita Jain
  (63, 34, 'BCC20191100034', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Arjit Malviya
  (67, 35, 'BCC20191100035', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Dr. Mahim Koshariya
  (68, 36, 'BCC20191100036', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Rupal Sharma
  (71, 37, 'BCC20191100037', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Rishabh Dev
  (73, 38, 'BCC20191100038', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Debjeet De Sarkar
  (17, 39, 'BCC20191100039', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Robin Dutta
  (53, 40, 'BCC20191100040', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Vikas Kumar Gangpari
  (52, 41, 'BCC20191100041', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Bablu Khan
  (57, 42, 'BCC20191100042', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Meeshan Agrawal
  (72, 43, 'BCC20191100043', 2019, 11, 'HISTORICAL_MIGRATION_IMPORT'), -- Dr. Priya Ojha
  -- Later joiners: number prefix remains 201911; join_year/month = actual join date
  (25, 44, 'BCC20191100044', 2021,  1, 'HISTORICAL_MIGRATION_IMPORT'), -- Ritu Ahluwalia (2021-01)
  (16, 45, 'BCC20191100045', 2022,  1, 'HISTORICAL_MIGRATION_IMPORT'), -- Prakash Hatvalne (2022-01)
  (18, 46, 'BCC20191100046', 2022,  1, 'HISTORICAL_MIGRATION_IMPORT'), -- Uttam Gurjar (2022-01)
  (51, 47, 'BCC20191100047', 2022,  7, 'HISTORICAL_MIGRATION_IMPORT'), -- Kuldeep Lodhi (2022-07)
  (66, 48, 'BCC20191100048', 2022,  1, 'HISTORICAL_MIGRATION_IMPORT'), -- Dr. Rahul Verma (2022-01)
  (24, 49, 'BCC20191100049', 2023,  1, 'HISTORICAL_MIGRATION_IMPORT'), -- Dr. Animesh Saxena (2023-01)
  (26, 50, 'BCC20191100050', 2023,  1, 'HISTORICAL_MIGRATION_IMPORT'), -- Sauvik Acharyya (2023-01)
  (19, 51, 'BCC20191100051', 2024,  1, 'HISTORICAL_MIGRATION_IMPORT'), -- Suyash Pratap Singh (2024-01)
  (55, 52, 'BCC20191100052', 2024,  1, 'HISTORICAL_MIGRATION_IMPORT'); -- Gaurav Sharma (2024-01)

-- ============================================================================
-- STEP 4: Assign permanent numbers
-- WHERE number_serial IS NULL is the idempotency guard.
-- Founding members who already have their serial assigned are skipped.
-- The immutability trigger is dropped (STEP 1), so this is safe for all rows.
-- ============================================================================

UPDATE memberships m
  INNER JOIN _hist_alloc h ON h.membership_id = m.id
SET
  m.number_serial      = h.number_serial,
  m.membership_number  = h.membership_number,
  m.number_assigned_at = NOW(),
  m.join_year          = h.join_year,
  m.join_month         = h.join_month
WHERE m.number_serial IS NULL;

-- ============================================================================
-- STEP 5: Correct join_year / join_month for members whose numbers were
-- already set (e.g. founding members). The trigger only guards number_serial
-- and membership_number; join date fields may be updated freely.
-- ============================================================================

UPDATE memberships m
  INNER JOIN _hist_alloc h ON h.membership_id = m.id
SET
  m.join_year  = h.join_year,
  m.join_month = h.join_month
WHERE m.join_year  IS DISTINCT FROM h.join_year
   OR m.join_month IS DISTINCT FROM h.join_month;

-- ============================================================================
-- STEP 6: Advance any non-ACTIVE historical member to ACTIVE
-- Only PENDING / APPROVED / SUSPENDED rows in the workbook list are touched.
-- The two PENDING test memberships are not in _hist_alloc and are untouched.
-- ============================================================================

UPDATE memberships
SET
  lifecycle_state = 'ACTIVE',
  activated_at    = COALESCE(activated_at, NOW())
WHERE id IN (SELECT membership_id FROM _hist_alloc)
  AND lifecycle_state NOT IN ('ACTIVE', 'TERMINATED', 'REJECTED');

-- ============================================================================
-- STEP 7: Log every assignment to membership_number_log
-- INSERT IGNORE makes this idempotent: founding-member entries already present
-- (from prior migrations) are silently skipped.
-- Only logs rows where the membership was actually assigned the serial.
-- ============================================================================

INSERT IGNORE INTO membership_number_log
  (membership_id, number_serial, membership_number,
   assignment_type, assigned_by_user_id, notes)
SELECT
  h.membership_id,
  h.number_serial,
  h.membership_number,
  h.assignment_type,
  1,
  'Historical migration: BCC_Permanent_Membership_Number_Allocation.xlsx — MEM-007 §7'
FROM _hist_alloc h
  INNER JOIN memberships m ON m.id = h.membership_id
WHERE m.number_serial = h.number_serial;

-- ============================================================================
-- STEP 8: Retire all ACTIVE temp identifiers for now-numbered memberships
-- ============================================================================

UPDATE membership_temp_identifiers mti
  INNER JOIN memberships m ON m.id = mti.membership_id
SET
  mti.status     = 'RETIRED',
  mti.retired_at = NOW()
WHERE m.id IN (SELECT membership_id FROM _hist_alloc)
  AND m.membership_number IS NOT NULL
  AND mti.status = 'ACTIVE';

-- ============================================================================
-- STEP 9: Advance pool to serial 53
-- Highest allocated serial = 52.
-- Unallocated gaps (18, 19, 28) are permanently retired per MP-003.
-- The next APPROVED → ACTIVE transition (live automatic allocation) will
-- draw serial 53 from the pool.
-- ============================================================================

UPDATE membership_number_pool
SET next_operational_serial = 53
WHERE id = 1;

-- ============================================================================
-- STEP 10: Drop staging table
-- ============================================================================

DROP TEMPORARY TABLE IF EXISTS _hist_alloc;

-- ============================================================================
-- STEP 11: Re-enable FK checks
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- STEP 12: Recreate immutability triggers (identical to 0009 / 0059 / 0070)
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
-- STEP 13: Record migration
-- ============================================================================

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0078_historical_membership_number_migration.sql', NOW());
