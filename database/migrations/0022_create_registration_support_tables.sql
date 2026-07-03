-- ============================================================================
-- 0022_create_registration_support_tables.sql
-- MODULE 01 -- RegistrationService support (spec 01.2, six registration
-- methods). Surgical ALTER on users (pattern established by 0010) plus two
-- new tables. Nothing here touches membership/recognition/RBAC-grant tables
-- -- MEM-006 P1 holds: these columns/tables describe HOW an identity was
-- created, never WHAT it is entitled to.
--
-- Three deviations from the schema as originally deployed, each because a
-- registration method in spec 01.2 cannot be implemented without it. Flagged
-- to Rajnish in the accompanying chat response, not silently assumed:
--
--   1. users.email NOT NULL -> NULL. Phone+OTP registration (spec 01.2)
--      produces a user with no email at all. The column stays UNIQUE
--      (MySQL permits multiple NULLs under a UNIQUE index).
--   2. users.phone gains a UNIQUE index. It had none -- two people could
--      register with the same phone number and both "own" it for OTP login.
--   3. users.created_by is a self-referencing FK. NULL for the four
--      self-service methods; set to the admin's id (ADMIN_CREATED) or the
--      inviter's id (INVITATION) for the other two -- audit trail only, no
--      permission implication.
-- ============================================================================

ALTER TABLE users
  MODIFY COLUMN email VARCHAR(255) NULL,
  ADD COLUMN registration_method ENUM(
    'EMAIL_PASSWORD','PHONE_OTP','SOCIAL_LOGIN','MAGIC_LINK','ADMIN_CREATED','INVITATION'
  ) NOT NULL DEFAULT 'EMAIL_PASSWORD',
  ADD COLUMN force_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN created_by BIGINT NULL,
  ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD UNIQUE KEY uq_users_phone (phone);

-- Email verification tokens (spec 01.2: "Email + password with email
-- verification"). Deliberately separate from magic_links -- a magic link is
-- a sign-in credential; this is a one-time proof-of-inbox-control that does
-- not grant a session by itself.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  token_hash    VARCHAR(255) NOT NULL,
  expires_at    TIMESTAMP NOT NULL,
  consumed_at   TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_verification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_email_verification_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invitation-based registration (spec 01.2). No role/scope hint is stored
-- here on purpose -- MEM-006 P1 means an invitation can fast-track *who*
-- gets to register, never *what* they get beyond baseline access. Any role
-- grant happens afterwards, explicitly, through RbacService.
CREATE TABLE IF NOT EXISTS invitations (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  token_hash    VARCHAR(255) NOT NULL,
  invited_by    BIGINT NOT NULL,
  expires_at    TIMESTAMP NOT NULL,
  consumed_at   TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_invitations_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_invitation_token (token_hash),
  INDEX idx_invitations_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
