-- ============================================================================
-- 0080_legacy_member_upgrade.sql
--
-- LEGACY MEMBER OPERATIONAL CATEGORY UPGRADE MIGRATION (OFFICIAL REVISION)
-- Authority: MEM-006, MEM-007, MEM-008, and Authoritative Excel Register
--
-- What this migration does:
--   1. Defines temporary procedure _validate_0080_legacy_upgrade() to programmatically
--      enforce three validation gates:
--        a) Target user verification (all 37 usernames exist in users table).
--        b) Operational membership class upgrade verification (all 37 memberships set to LEGACY_MEMBER).
--        c) Audit log entry verification (all 37 audit records logged in membership_audit_log).
--   2. Executes data updates inside a single transaction (START TRANSACTION ... COMMIT).
--   3. Inserts audit entries idempotently (WHERE NOT EXISTS) into membership_audit_log.
--   4. Upgrades memberships.membership_class_id to LEGACY_MEMBER for the 37 approved usernames.
--   5. Invokes _validate_0080_legacy_upgrade() inside transaction before COMMIT.
--   6. Cleans up temporary staging tables and procedures.
--
-- DO NOT MODIFY:
--   - membership_number, number_serial, membership_id, user_id, join_year, join_month,
--     dates, recognition classes, constitutional memberships, permanent numbering.
-- ============================================================================

-- ============================================================================
-- STEP 1: Create temporary automated validation procedure
-- Raises SIGNAL SQLSTATE '45000' if user count, upgrade count, or audit count != 37
-- ============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS _validate_0080_legacy_upgrade $$
CREATE PROCEDURE _validate_0080_legacy_upgrade()
BEGIN
  DECLARE legacy_class_id INT;
  DECLARE target_user_count INT DEFAULT 0;
  DECLARE upgraded_count INT DEFAULT 0;
  DECLARE audit_count INT DEFAULT 0;

  SELECT id INTO legacy_class_id
  FROM membership_classes
  WHERE code = 'LEGACY_MEMBER';

  IF legacy_class_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MIGRATION 0080 ERROR: LEGACY_MEMBER class does not exist in membership_classes!';
  END IF;

  -- Gate 1: Verify all 37 target usernames exist in users table
  SELECT COUNT(DISTINCT u.username) INTO target_user_count
  FROM users u
  INNER JOIN _legacy_target_usernames t ON u.username = t.username;

  IF target_user_count <> 37 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MIGRATION 0080 VALIDATION FAILED: Target usernames missing from users table!';
  END IF;

  -- Gate 2: Verify all 37 target memberships now have LEGACY_MEMBER class
  SELECT COUNT(DISTINCT m.id) INTO upgraded_count
  FROM memberships m
  INNER JOIN users u ON m.user_id = u.id
  INNER JOIN _legacy_target_usernames t ON u.username = t.username
  WHERE m.membership_class_id = legacy_class_id;

  IF upgraded_count <> 37 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MIGRATION 0080 VALIDATION FAILED: Upgraded membership count does not equal 37!';
  END IF;

  -- Gate 3: Verify all 37 audit records exist in membership_audit_log
  SELECT COUNT(DISTINCT al.membership_id) INTO audit_count
  FROM membership_audit_log al
  INNER JOIN memberships m ON al.membership_id = m.id
  INNER JOIN users u ON m.user_id = u.id
  INNER JOIN _legacy_target_usernames t ON u.username = t.username
  WHERE al.event_type = 'LEGACY_STATUS_GRANTED';

  IF audit_count <> 37 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MIGRATION 0080 VALIDATION FAILED: Audit log entry count does not equal 37!';
  END IF;
END $$

DELIMITER ;

-- ============================================================================
-- STEP 2: TRANSACTIONAL DATA UPGRADE & ENFORCED VALIDATION
-- ============================================================================

START TRANSACTION;

-- Create temporary staging table with approved 37 usernames
CREATE TEMPORARY TABLE IF NOT EXISTS _legacy_target_usernames (
  username VARCHAR(100) NOT NULL PRIMARY KEY
) ENGINE=MEMORY;

INSERT INTO _legacy_target_usernames (username) VALUES
  ('syedtahapasha'),
  ('happylotus'),
  ('nikkhilraghuwanshi'),
  ('nyonika'),
  ('nehaabhayzode'),
  ('feher'),
  ('narendra'),
  ('p900'),
  ('lubnarashid'),
  ('varun'),
  ('ashokbathri'),
  ('khalidkhan832'),
  ('afzalkhan'),
  ('kshitijpatle'),
  ('meetaathavale'),
  ('sandeepjain'),
  ('yogiym'),
  ('gag21'),
  ('anukritism'),
  ('nowitsratan'),
  ('ppparate'),
  ('ankittiwari'),
  ('rahilkhan'),
  ('anilbhati'),
  ('sanjaykumarshukla'),
  ('akshitajain'),
  ('arjitmalviya'),
  ('mahimk2000'),
  ('ruel11'),
  ('rishab_dev'),
  ('mitulda'),
  ('robindutta'),
  ('gangparivikas'),
  ('imbablukhan'),
  ('meeshan'),
  ('escape_withpriya'),
  ('rahulverma');

-- Log audit trail idempotently for all 37 memberships being upgraded
INSERT INTO membership_audit_log (membership_id, event_type, actor_type, old_value, new_value, notes)
SELECT
  m.id,
  'LEGACY_STATUS_GRANTED',
  'ADMIN',
  mc_old.code,
  'LEGACY_MEMBER',
  'Operational Membership upgraded to Legacy Member (MEM-008 grandfathered class) per Migration 0080'
FROM memberships m
INNER JOIN users u ON m.user_id = u.id
INNER JOIN _legacy_target_usernames t ON u.username = t.username
INNER JOIN membership_classes mc_old ON m.membership_class_id = mc_old.id
WHERE NOT EXISTS (
  SELECT 1 FROM membership_audit_log al
  WHERE al.membership_id = m.id
    AND al.event_type = 'LEGACY_STATUS_GRANTED'
);

-- Update operational membership category (membership_class_id) to LEGACY_MEMBER
UPDATE memberships m
INNER JOIN users u ON m.user_id = u.id
INNER JOIN _legacy_target_usernames t ON u.username = t.username
SET m.membership_class_id = (SELECT id FROM membership_classes WHERE code = 'LEGACY_MEMBER')
WHERE m.membership_class_id <> (SELECT id FROM membership_classes WHERE code = 'LEGACY_MEMBER');

-- ENFORCED VALIDATION CHECK: Call procedure inside transaction before COMMIT.
-- Verifies: 1) 37 users exist, 2) 37 memberships upgraded, 3) 37 audit logs created.
-- If any gate fails, procedure raises SIGNAL SQLSTATE '45000', aborting execution.
CALL _validate_0080_legacy_upgrade();

-- Clean up temporary staging table
DROP TEMPORARY TABLE IF EXISTS _legacy_target_usernames;

COMMIT;

-- Clean up validation helper procedure after commit
DROP PROCEDURE IF EXISTS _validate_0080_legacy_upgrade;
