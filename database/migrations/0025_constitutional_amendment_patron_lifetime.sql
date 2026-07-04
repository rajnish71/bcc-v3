-- ============================================================================
-- 0025_constitutional_amendment_patron_lifetime.sql
--
-- CONSTITUTIONAL AMENDMENT — Patron Member is a LIFETIME class.
--
-- Authority: governance decision confirmed by Rajnish Khare (Super Admin,
-- founding member 00001), 04 Jul 2026, resolving the open question flagged
-- since Phase 0 ("Patron renewal/lifetime policy defaulted but not
-- confirmed"). Founding Member was already lifetime; Patron now matches.
--
-- The MEM-006 protection trigger (0009) hard-blocks UPDATE on constitutional
-- class rows with no amendment escape hatch — deliberately. The only honest
-- amendment path is therefore: drop trigger -> amend -> recreate trigger
-- byte-identical, inside one migration, so the amendment exists as a
-- reviewable git artifact rather than an untracked manual DB edit. The
-- protection window is only open for the duration of this migration.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_protect_constitutional_classes_update;

UPDATE membership_classes
SET is_renewable = 0,
    is_lifetime  = 1
WHERE code = 'PATRON_MEMBER';

-- Remove the renewal config seeded by seed_0004 while Patron was still
-- (incorrectly) flagged renewable. Plain DML, not trigger-protected.
DELETE ce FROM class_entitlements ce
JOIN membership_classes mc ON mc.id = ce.membership_class_id
WHERE mc.code = 'PATRON_MEMBER'
  AND ce.entitlement_key IN ('renewal_term_months', 'grace_period_days');

-- Recreate the protection trigger EXACTLY as defined in 0009 — do not
-- modify this definition here; if the trigger itself ever needs changing,
-- that is its own migration with its own justification.
DELIMITER $$

CREATE TRIGGER trg_protect_constitutional_classes_update
BEFORE UPDATE ON membership_classes
FOR EACH ROW
BEGIN
  IF OLD.type = 'CONSTITUTIONAL' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'MEM-006 VIOLATION: Constitutional Membership Classes cannot be modified.';
  END IF;
END $$

DELIMITER ;
