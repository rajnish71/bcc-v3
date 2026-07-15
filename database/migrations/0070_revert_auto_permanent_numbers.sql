-- ============================================================================
-- 0070_revert_auto_permanent_numbers.sql
--
-- AUTHORIZED ADMINISTRATIVE CORRECTION — 2026-07-15
-- Authority: Rajnish K. Khare (BCC Super Admin) per task directive
--
-- Context:
--   The repair script (repair-approved-memberships.ts) was run to advance
--   APPROVED memberships to ACTIVE after migration 0069 (activation_mode).
--   Two constitutional violations resulted:
--
--   VIOLATION 1 — MEM-007 Amendment 001-B:
--     Activation issued permanent sequential membership numbers.
--     Per Amendment 001-B, all non-Founding activations must receive
--     BCCTempXXXXX identifiers only. Permanent numbers are issued manually
--     by the Super Admin via the batch spreadsheet process (Amendment 001-C).
--     Affected: afzalkhan, yogiym, kuch_naya_karne_ki_talaashmai, gangparivikas
--
--   VIOLATION 2 — Production integrity:
--     Test accounts (rkkhare1212, raghavc) created solely for pipeline testing
--     remain in the production database. These must be fully removed.
--
-- This migration:
--   A. Temporarily disables immutability triggers to perform the correction
--   B. Removes all OPERATIONAL_SEQUENTIAL number log entries (serial >= 21)
--   C. Clears number fields from affected memberships
--   D. Deletes test user accounts and ALL their dependent records
--   E. Issues BCCTempXXXXX identifiers for the 4 affected genuine members
--   F. Resets membership_number_pool.next_operational_serial to 21
--   G. Sets Bablu Khan's identity fields for administrative activation
--   H. Restores all triggers
--
-- Founding member numbers BCC20191100001–BCC20191100007 are NOT touched.
-- These were assigned via FOUNDING_RESERVED and reside at serials 1–7.
-- ============================================================================

-- ============================================================================
-- STEP 1 — Temporarily drop immutability triggers
-- (authorized one-time correction; recreated at the end of this migration)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_membership_number_immutable;
DROP TRIGGER IF EXISTS trg_prevent_numbered_membership_delete;

-- ============================================================================
-- STEP 2 — Disable FK checks for ordered cleanup
-- (re-enabled in step 9 before recreating triggers)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- STEP 3 — Remove all OPERATIONAL_SEQUENTIAL log entries (serial >= 21)
--
-- This covers:
--   • The 4 affected genuine members (afzalkhan, yogiym,
--     kuch_naya_karne_ki_talaashmai, gangparivikas)
--   • Any test users who were also activated by the repair script
--
-- FOUNDING_RESERVED entries (serials 1–7) are not touched.
-- HISTORICAL_RESERVED entries (serials 8–20) are not touched.
-- ============================================================================

DELETE FROM membership_number_log
WHERE assignment_type = 'OPERATIONAL_SEQUENTIAL'
  AND number_serial >= 21;

-- ============================================================================
-- STEP 4 — Clear permanent number fields from all memberships that were
-- given operational sequential numbers
-- ============================================================================

UPDATE memberships
SET
    membership_number   = NULL,
    number_serial       = NULL,
    number_assigned_at  = NULL,
    join_year           = NULL,
    join_month          = NULL
WHERE number_serial >= 21;

-- ============================================================================
-- STEP 5 — Hard-delete test user accounts and all dependent records
--
-- Test users: rkkhare1212, raghavc
-- These accounts were created solely to test the onboarding pipeline.
-- They are not genuine members and must not remain in production.
--
-- Membership audit log entries: membership_audit_log.membership_id has
-- ON DELETE SET NULL; we explicitly NULL-out entries where actor = test user
-- so the audit trail of OTHER memberships they may have touched is preserved.
-- Entries where membership_id links to their own memberships are deleted.
-- ============================================================================

-- 5a. Null out actor references in audit log where test users acted on
--     OTHER memberships (preserves audit trail of those memberships)
UPDATE membership_audit_log
SET actor_user_id = NULL
WHERE actor_user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'))
  AND membership_id NOT IN (
    SELECT id FROM memberships WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'))
  );

-- 5b. Delete audit log rows for their own memberships
DELETE mal
FROM membership_audit_log mal
WHERE mal.membership_id IN (
    SELECT m.id FROM memberships m
    WHERE m.user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'))
);

-- 5c. Clear temp identifiers (may exist if they were given one before numbering repair)
DELETE mti
FROM membership_temp_identifiers mti
WHERE mti.membership_id IN (
    SELECT m.id FROM memberships m
    WHERE m.user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'))
);

-- 5d. Delete membership rows (approval stages, documents, messages cascade from membership_id)
DELETE FROM memberships
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

-- 5e. Delete consent log
DELETE FROM membership_consent_log
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

-- 5f. Delete authentication records
DELETE FROM email_verification_tokens
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM invitations
WHERE invited_by IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM refresh_tokens
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM auth_identities
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM otp_codes
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM magic_links
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM password_reset_tokens
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM login_history
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM account_lockouts
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM mfa_methods
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

-- 5g. Delete identity and account records
DELETE FROM identity_audit_log
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM pending_email_changes
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM user_roles
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM notification_preferences
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

-- 5h. Delete profile records
DELETE FROM user_avatars
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM user_cover_photos
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM user_social_handles
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM user_gear
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM user_photo_titles
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM user_awards
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

-- 5i. Delete gallery records (photos, albums, reactions, comments)
--     tag assignments cascade from photo_id; album_items cascade from album_id
DELETE photo_tag_assignments
FROM photo_tag_assignments
INNER JOIN photos p ON p.id = photo_tag_assignments.photo_id
WHERE p.owner_user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE photo_album_items
FROM photo_album_items
INNER JOIN photo_albums pa ON pa.id = photo_album_items.album_id
WHERE pa.owner_user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE photo_reactions
FROM photo_reactions
WHERE photo_reactions.user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE photo_comments
FROM photo_comments
WHERE photo_comments.user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

-- Clear cover_photo_id refs before deleting albums/photos to avoid self-FK issues
UPDATE photo_albums
SET cover_photo_id = NULL
WHERE owner_user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM photos
WHERE owner_user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM photo_albums
WHERE owner_user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

-- 5j. Delete notifications (in_app_notifications cascades from notification_log)
DELETE FROM in_app_notifications
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

DELETE FROM notification_log
WHERE user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

-- 5k. Delete payments (payments.membership_id -> memberships.id).
--     memberships.pending_payment_id is nullable with ON DELETE SET NULL;
--     with FK_CHECKS=0 we don't need to clear it first, but the payment
--     rows must be deleted before memberships to avoid RESTRICT in a
--     FK-enabled environment. Safe here because FK_CHECKS=0.
DELETE p
FROM payments p
INNER JOIN memberships m ON m.id = p.membership_id
WHERE m.user_id IN (SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc'));

-- 5l. Clear users.created_by self-references (admin-created users whose
--     creator was a test account). The derived table wrapping is required
--     because MySQL prevents UPDATE and SELECT on the same table in one query.
UPDATE users
SET created_by = NULL
WHERE created_by IN (
    SELECT id FROM (
        SELECT id FROM users WHERE username IN ('rkkhare1212', 'raghavc')
    ) AS test_user_ids
);

-- 5m. Delete the user rows (final step — all FKs cleared above)
DELETE FROM users
WHERE username IN ('rkkhare1212', 'raghavc');

-- ============================================================================
-- STEP 6 — Reset membership_number_pool to serial 21
--
-- All operational sequential assignments have been reverted above.
-- The founding members (serials 1–7) were FOUNDING_RESERVED, not drawn from
-- this pool, so the operational pool start of 21 is correct.
-- Per MEM-007 Amendment 001-C, sequential auto-allocation will resume from
-- this point only AFTER the manual batch spreadsheet is closed and
-- last_allocated_serial is updated by an authorized administrative operation.
-- ============================================================================

UPDATE membership_number_pool
SET next_operational_serial = 21
WHERE id = 1;

-- ============================================================================
-- STEP 7 — Issue BCCTempXXXXX identifiers for the 4 genuine affected members
--
-- These members are now ACTIVE with no membership_number. Per MEM-007
-- Amendment 001-B, they receive temporary identifiers until the manual
-- batch assigns permanent numbers.
--
-- INSERT IGNORE is safe here: uq_one_temp_id_per_membership ensures
-- idempotency if a temp identifier was somehow already recorded.
-- ============================================================================

INSERT IGNORE INTO membership_temp_identifiers (membership_id, temp_identifier, status)
SELECT
    m.id,
    CONCAT('BCCTemp', LPAD(m.id, 5, '0')),
    'ACTIVE'
FROM memberships m
INNER JOIN users u ON u.id = m.user_id
WHERE u.username IN ('afzalkhan', 'yogiym', 'kuch_naya_karne_ki_talaashmai', 'gangparivikas')
  AND m.lifecycle_state = 'ACTIVE'
  AND m.owner_type = 'INDIVIDUAL';

-- ============================================================================
-- STEP 8 — Set Bablu Khan's identity fields
--
-- Bablu Khan is a genuine member. His identity completion is being performed
-- administratively per the task directive. The username IS NULL guard ensures
-- this is idempotent and cannot overwrite an existing username.
-- ============================================================================

UPDATE users
SET
    username                = 'bablukhan',
    identity_status         = 'IDENTITY_COMPLETE',
    identity_completed_at   = NOW()
WHERE full_name = 'Bablu Khan'
  AND username IS NULL;

-- ============================================================================
-- STEP 9 — Re-enable FK checks
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- STEP 10 — Recreate immutability triggers (identical to 0009 and 0059)
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
