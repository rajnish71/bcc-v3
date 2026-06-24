-- ============================================================================
-- 0001_create_users.sql
-- MEM-006 IDENTITY ARCHITECTURE
--
-- "A Registered User represents an authenticated platform identity.
--  Registration does NOT create Membership, Recognition, or Governance
--  Authority." (MEM-006, Identity Architecture)
--
-- This table is intentionally minimal. Auth strategy (Session+JWT Hybrid vs
-- JWT+Refresh) is DEFERRED per FINAL_TECHNOLOGY_STACK_FREEZE — only generic
-- columns that survive either choice are included here. Refresh-token /
-- session tables are added later once auth is decided, not before.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  uuid                CHAR(36) NOT NULL UNIQUE,

  email               VARCHAR(255) NOT NULL UNIQUE,
  phone               VARCHAR(20) NULL,

  password_hash       VARCHAR(255) NULL,        -- nullable: social/magic-link login may not set one

  full_name           VARCHAR(255) NOT NULL,

  email_verified_at   TIMESTAMP NULL,
  phone_verified_at   TIMESTAMP NULL,

  status              ENUM('ACTIVE','SUSPENDED','DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',

  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
