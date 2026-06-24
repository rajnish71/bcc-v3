-- ============================================================================
-- 0009_create_constitutional_triggers.sql
-- Database-layer enforcement of MEM-006 and MEM-007 rules that must hold
-- no matter what the application layer does or fails to do.
--
-- This goes beyond literally-quoted spec text into an explicit engineering
-- decision: MEM-006/007 repeatedly use words like "FROZEN", "AUTHORITATIVE",
-- "shall never", "cannot be modified" — language strong enough that relying
-- on application code alone to honor it seemed insufficient. These triggers
-- make the constraints physically impossible to violate via SQL, not just
-- discouraged by convention. Flag if this is more rigidity than intended.
--
-- Trigger 1 — MEM-006 Constitutional Protection Rule:
--   "Constitutional Membership Classes cannot be modified through
--    configuration... cannot be deleted by administrators."
--   -> blocks UPDATE and DELETE on any membership_classes row where
--      type = 'CONSTITUTIONAL'.
--
-- Trigger 2 — MEM-007 Immutability Rules (MP-001/MP-003):
--   "After assignment: Numbers shall not be modified... replaced...
--    reassigned... reused... reset."
--   -> blocks changing membership_number or number_serial on memberships
--      once either has been set to a non-NULL value.
-- ============================================================================

DELIMITER $$

DROP TRIGGER IF EXISTS trg_protect_constitutional_classes_update $$
CREATE TRIGGER trg_protect_constitutional_classes_update
BEFORE UPDATE ON membership_classes
FOR EACH ROW
BEGIN
  IF OLD.type = 'CONSTITUTIONAL' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MEM-006 VIOLATION: Constitutional Membership Classes cannot be modified.';
  END IF;
END $$

DROP TRIGGER IF EXISTS trg_protect_constitutional_classes_delete $$
CREATE TRIGGER trg_protect_constitutional_classes_delete
BEFORE DELETE ON membership_classes
FOR EACH ROW
BEGIN
  IF OLD.type = 'CONSTITUTIONAL' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MEM-006 VIOLATION: Constitutional Membership Classes cannot be deleted.';
  END IF;
END $$

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

DELIMITER ;
