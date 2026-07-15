-- ============================================================================
-- 0069_add_activation_mode_to_membership_classes.sql
--
-- Adds activation_mode to membership_classes to drive post-approval lifecycle
-- behaviour. The lifecycle engine reads this column; no approval-path code
-- needs to know whether payment exists.
--
--   AUTO_AFTER_APPROVAL
--     The coordinator's final approval is the last gate. activate() fires
--     immediately inside approve(). No invoice or payment step is issued.
--     Current OPERATIONAL classes: Basic, Student, Individual.
--
--   PAYMENT_REQUIRED
--     Approval moves the membership to APPROVED (waiting state). An invoice
--     is issued; the payment webhook triggers activate(). Current
--     CONSTITUTIONAL classes: Full, Life, Patron, Founding.
--
--   MANUAL
--     Approval moves the membership to APPROVED. An administrator explicitly
--     calls the activate endpoint. Reserved for future governance-controlled
--     classes that are neither payment-gated nor fee-free.
--
-- Why DEFAULT 'PAYMENT_REQUIRED' then UPDATE OPERATIONAL?
--   The constitutional protection trigger in 0009 blocks UPDATE on rows
--   where OLD.type = 'CONSTITUTIONAL'. Defaulting to 'PAYMENT_REQUIRED'
--   means all four constitutional classes get the correct value from the DDL
--   column default, without any UPDATE touching them. The subsequent UPDATE
--   targets only OPERATIONAL rows, which the trigger does not protect.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE membership_classes
  ADD COLUMN activation_mode
    ENUM('AUTO_AFTER_APPROVAL', 'PAYMENT_REQUIRED', 'MANUAL')
    NOT NULL
    DEFAULT 'PAYMENT_REQUIRED'
  AFTER is_closed;

-- OPERATIONAL classes (Basic, Student, Individual) activate immediately
-- on coordinator approval. These rows are not protected by the trigger.
UPDATE membership_classes
  SET activation_mode = 'AUTO_AFTER_APPROVAL'
  WHERE type = 'OPERATIONAL';

-- The MEMBERSHIP_ACTIVATED notification description was written when payment
-- was the only activation trigger. Now that AUTO_AFTER_APPROVAL also fires
-- activate(), the description must reflect both paths.
UPDATE notification_types
  SET description = 'Membership transitions to ACTIVE state (coordinator auto-approval or payment confirmation).'
  WHERE type_key = 'MEMBERSHIP_ACTIVATED';

INSERT INTO schema_migrations (filename, applied_at)
  VALUES ('0069_add_activation_mode_to_membership_classes.sql', NOW());

COMMIT;
