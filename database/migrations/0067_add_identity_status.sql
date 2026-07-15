-- ============================================================================
-- 0067_add_identity_status.sql
-- IDENTITY-ARCH-001: Identity Completion Architecture
--
-- Adds identity lifecycle columns to users.
--
-- identity_status  — the authoritative identity completion state.
--   IDENTITY_PENDING  : user exists but has not completed identity setup
--                       (username not yet chosen by the user).
--   IDENTITY_COMPLETE : username chosen; identity is fully established.
--   Default = IDENTITY_PENDING so every new user registration automatically
--   starts in the pending state without application code having to set it.
--
-- identity_completed_at — timestamp of the moment identity was completed.
--   NULL for IDENTITY_PENDING users.
--
-- Backfill rule (from IDENTITY-ARCH-001):
--   username IS NOT NULL  =>  IDENTITY_COMPLETE
--   username IS NULL      =>  IDENTITY_PENDING  (already the default)
--
-- No heuristics. No membership checks. No profile checks.
-- identity_status is the single authoritative state from this migration onward.
-- username NULL is no longer the check — identity_status is.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE users
  ADD COLUMN identity_status ENUM('IDENTITY_PENDING','IDENTITY_COMPLETE')
    NOT NULL DEFAULT 'IDENTITY_PENDING'
    AFTER username,
  ADD COLUMN identity_completed_at DATETIME NULL
    AFTER identity_status;

-- Backfill: users who already have a username are IDENTITY_COMPLETE.
-- updated_at is used as the completion timestamp since we don't have a better
-- signal for when the username was originally set.
UPDATE users
SET
  identity_status       = 'IDENTITY_COMPLETE',
  identity_completed_at = updated_at
WHERE username IS NOT NULL;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0067_add_identity_status.sql', NOW());

COMMIT;
