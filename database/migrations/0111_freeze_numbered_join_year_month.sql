-- ============================================================================
-- 0111_freeze_numbered_join_year_month.sql
--
-- Membership Date / Tenure Architecture -- Batch 1 (HA decisions B1-B3,
-- 2026-10-06): protect membership-owned number date components.
--
-- memberships.join_year / join_month hold the YYYY/MM component of the
-- permanent Membership Number (format per MEM-007 §5, historical semantics;
-- operational source per HA Decision B3: memberships.applied_at for new
-- individual registrations; allocated at activation per MEM-007 §8). Once a
-- membership is numbered they are frozen together with membership_number /
-- number_serial (MEM-007 MP-001 permanence). Any future recognized historical
-- membership date (HA B2) is a separate concern and must not use these columns
-- to alter the number. Until now the
-- immutability trigger only guarded membership_number and number_serial, so
-- an ordinary write (e.g. the removed Hub profile "yearJoinedBcc" sync) could
-- silently move join_year away from the number it belongs to.
--
-- This migration ONLY redefines trg_membership_number_immutable:
--   • the existing membership_number / number_serial guards are reproduced
--     verbatim from 0079_revision_2 (the live definition), including its
--     pre-existing session maintenance gate @allow_membership_number_update;
--   • adds: when OLD.number_serial or OLD.membership_number is NOT NULL,
--     join_year and join_month may not change (NULL-safe comparison).
--
-- Unnumbered rows are unaffected, so MembershipNumberingService.
-- assignPermanentNumber() (which sets join_year / join_month in the same
-- UPDATE that first sets number_serial, guarded by number_serial IS NULL)
-- keeps working.
--
-- No data is read or changed. No Membership Number is changed. No historical
-- join_year / join_month value is changed or normalised.
-- trg_prevent_numbered_membership_delete is unaffected.
--
-- Apply with the mysql CLI (DELIMITER) as a user with TRIGGER privilege
-- (prod: sudo mysql bcc_v3 < 0111_freeze_numbered_join_year_month.sql).
-- Idempotent: DROP TRIGGER IF EXISTS / CREATE TRIGGER.
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

    IF (OLD.number_serial IS NOT NULL OR OLD.membership_number IS NOT NULL)
       AND (NOT (NEW.join_year <=> OLD.join_year) OR NOT (NEW.join_month <=> OLD.join_month)) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'MEM-007 VIOLATION: join_year / join_month are the permanent Membership Number YYYY/MM and cannot be modified once a number is assigned.';
    END IF;
  END IF;
END $$

DELIMITER ;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0111_freeze_numbered_join_year_month.sql', NOW());
