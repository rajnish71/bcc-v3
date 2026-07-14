-- ============================================================================
-- 0059_prevent_hard_delete_numbered_memberships.sql
--
-- Stage 7 · item 47 — Membership numbering preparation (MEM-007).
--
-- MEM-007 MP-003 (Non-Reuse) and MP-001 (Permanence) require that once a
-- serial has been allocated it is never released back into circulation, for
-- any lifecycle reason. Hard-deleting a memberships row that carries an
-- allocated number would orphan its serial in membership_number_log and
-- create a path to accidental reuse. Memberships are retired through
-- lifecycle_state (EXPIRED / TERMINATED / etc.), never by physical deletion.
--
-- This trigger makes that physically impossible at the DB layer, mirroring the
-- immutability protection already in 0009. It intentionally does NOT block
-- deletion of never-numbered rows (e.g. abandoned PENDING applications), which
-- carry no constitutional identifier.
--
-- No permanent numbers are assigned by this migration (item 47 constraint).
-- ============================================================================

DELIMITER $$

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
