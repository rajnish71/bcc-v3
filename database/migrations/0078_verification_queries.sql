-- ============================================================================
-- 0078_verification_queries.sql
-- Post-migration verification for 0078_historical_membership_number_migration
--
-- Run after applying the migration on prod.
-- All queries are read-only SELECT statements — safe to run at any time.
-- ============================================================================

-- ── 1. Total ACTIVE members ───────────────────────────────────────────────
SELECT COUNT(*) AS total_active_members
FROM memberships
WHERE lifecycle_state = 'ACTIVE'
  AND owner_type = 'INDIVIDUAL';

-- ── 2. Total historical members migrated (should be 49) ──────────────────
SELECT COUNT(*) AS historical_members_migrated
FROM memberships
WHERE lifecycle_state = 'ACTIVE'
  AND owner_type = 'INDIVIDUAL'
  AND membership_number IS NOT NULL
  AND number_serial BETWEEN 1 AND 52;

-- ── 3. Highest allocated serial ───────────────────────────────────────────
SELECT MAX(number_serial) AS highest_allocated_serial
FROM memberships;

-- ── 4. Next available serial (from pool) ─────────────────────────────────
SELECT next_operational_serial AS next_serial_to_allocate
FROM membership_number_pool
WHERE id = 1;

-- ── 5. Duplicate number_serial check (expect: 0 rows) ────────────────────
SELECT number_serial, COUNT(*) AS cnt
FROM memberships
WHERE number_serial IS NOT NULL
GROUP BY number_serial
HAVING COUNT(*) > 1;

-- ── 6. Duplicate membership_number check (expect: 0 rows) ────────────────
SELECT membership_number, COUNT(*) AS cnt
FROM memberships
WHERE membership_number IS NOT NULL
GROUP BY membership_number
HAVING COUNT(*) > 1;

-- ── 7. Missing serials in assigned range (gaps are legal: 18, 19, 28) ────
-- Shows which serials between 1 and (max_serial) are unallocated.
-- Expected gaps: 18, 19, 28 only.
SELECT n.serial AS unallocated_serial
FROM (
  SELECT a.n + b.n * 10 + 1 AS serial
  FROM
    (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
     UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
    (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
     UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
) n
WHERE n.serial BETWEEN 1 AND (SELECT MAX(number_serial) FROM memberships)
  AND NOT EXISTS (SELECT 1 FROM memberships WHERE number_serial = n.serial)
ORDER BY n.serial;

-- ── 8. ACTIVE members without permanent numbers (expect: 0 rows) ─────────
SELECT u.username, u.full_name, m.id AS membership_id, m.lifecycle_state
FROM memberships m
  INNER JOIN users u ON u.id = m.user_id
WHERE m.lifecycle_state = 'ACTIVE'
  AND m.owner_type = 'INDIVIDUAL'
  AND m.membership_number IS NULL;

-- ── 9. PENDING members (the two test cases — expect: exactly 2 rows) ──────
SELECT u.username, u.full_name, m.id AS membership_id, m.lifecycle_state,
       m.membership_number, m.number_serial
FROM memberships m
  INNER JOIN users u ON u.id = m.user_id
WHERE m.lifecycle_state = 'PENDING'
  AND m.owner_type = 'INDIVIDUAL';

-- ── 10. REJECTED members (informational) ─────────────────────────────────
SELECT u.username, u.full_name, m.id AS membership_id, m.lifecycle_state,
       m.membership_number
FROM memberships m
  INNER JOIN users u ON u.id = m.user_id
WHERE m.lifecycle_state = 'REJECTED'
  AND m.owner_type = 'INDIVIDUAL';

-- ── 11. Pool status ───────────────────────────────────────────────────────
SELECT
  next_operational_serial,
  updated_at,
  CASE WHEN next_operational_serial = 53 THEN 'OK — ready for live allocation'
       ELSE CONCAT('WARNING — expected 53, got ', next_operational_serial) END AS status
FROM membership_number_pool
WHERE id = 1;

-- ── 12. Full allocation roster (for visual audit) ─────────────────────────
SELECT
  m.id              AS membership_id,
  u.id              AS user_id,
  u.username,
  u.full_name,
  mc.name           AS membership_class,
  m.lifecycle_state,
  m.number_serial,
  m.membership_number,
  m.join_year,
  m.join_month,
  m.number_assigned_at,
  COALESCE(mnl.assignment_type, '— not logged —') AS log_assignment_type,
  mti.temp_identifier,
  mti.status        AS temp_status
FROM memberships m
  INNER JOIN users u ON u.id = m.user_id
  LEFT JOIN membership_classes mc ON mc.id = m.membership_class_id
  LEFT JOIN membership_number_log mnl ON mnl.membership_id = m.id
  LEFT JOIN membership_temp_identifiers mti ON mti.membership_id = m.id
WHERE m.owner_type = 'INDIVIDUAL'
ORDER BY COALESCE(m.number_serial, 9999), m.id;

-- ── 13. Temp identifiers still ACTIVE (expect: 0 for historical members) ──
SELECT mti.temp_identifier, mti.status, u.username, m.membership_number
FROM membership_temp_identifiers mti
  INNER JOIN memberships m ON m.id = mti.membership_id
  INNER JOIN users u ON u.id = m.user_id
WHERE mti.status = 'ACTIVE'
ORDER BY mti.issued_at;

-- ── 14. Workbook-specific spot checks ────────────────────────────────────
-- Each row should match the workbook exactly.
SELECT
  u.username,
  m.number_serial,
  m.membership_number,
  m.join_year,
  m.join_month,
  m.lifecycle_state
FROM memberships m
  INNER JOIN users u ON u.id = m.user_id
WHERE u.username IN (
  'rajnishkhare', 'oshinjangalwa',     -- founding (serials 1, 7)
  'syedtahapasha', 'afzalkhan',        -- historical reserved (8, 20)
  'kshitijpatle', 'gauravsharma',      -- operational import (21, 52)
  'rituahluwalia', 'sauvikacharyya',   -- later joiners with different join dates
  'yogiym', 'gangparivikas'            -- previously had temp identifiers
)
ORDER BY m.number_serial;
