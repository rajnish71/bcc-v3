-- ============================================================================
-- 0082_mem008_new_membership_classes.sql
-- MEM-008 Part 1: Adds operational classes not present in the original 0002 seed.
--
-- LEGACY_MEMBER  - Grandfathered closed class (MEM-008 section 2).
--                  Assigned by admin only; no new applications accepted.
--                  activation_mode = MANUAL (coordinator assigns directly).
--                  is_closed = TRUE (lifecycle engine rejects applications).
--
-- INDIVIDUAL_BIENNIAL - 2-year Individual membership (MEM-008 section 5).
--                  Same privileges as INDIVIDUAL_MEMBER but 24-month term,
--                  PVC card, welcome kit, and higher discount tier.
--                  activation_mode = AUTO_AFTER_APPROVAL (same as other
--                  OPERATIONAL classes per migration 0069).
--
-- Neither row is CONSTITUTIONAL, so the constitutional-protection trigger in
-- 0009 does not apply. INSERT IGNORE so re-running is safe.
--
-- Follows the same pattern as 0002; UPDATE not used to avoid any edge-case
-- trigger interaction.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO membership_classes
  (code, name, type, voting_eligible, governance_eligible,
   is_renewable, is_lifetime, is_closed, activation_mode, sort_order)
VALUES
  ('LEGACY_MEMBER',
   'Legacy Member',
   'OPERATIONAL',
   FALSE, FALSE,
   FALSE, FALSE, TRUE,
   'MANUAL',
   55),

  ('INDIVIDUAL_BIENNIAL',
   'Individual Member (Biennial)',
   'OPERATIONAL',
   FALSE, FALSE,
   TRUE, FALSE, FALSE,
   'AUTO_AFTER_APPROVAL',
   75);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0082_mem008_new_membership_classes.sql', NOW());

COMMIT;
