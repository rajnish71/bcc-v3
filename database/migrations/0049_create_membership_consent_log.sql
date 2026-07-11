-- ============================================================================
-- 0049_create_membership_consent_log.sql
-- Phase D -- Schema: Membership consent audit log
--
-- APPEND-ONLY TABLE. No UPDATE or DELETE is ever permitted on this table.
-- The application layer MUST enforce this constraint. Every consent event
-- is written once and preserved permanently for audit/legal purposes.
-- Rows in this table are immutable records of informed consent.
--
-- consent_type:   APPLICATION (new membership application)
--                 RENEWAL     (annual membership renewal)
-- terms_version:  e.g. "1.0", "1.1" — matches published terms document version
-- ip_address:     IPv4 or IPv6 (up to 45 chars), NULL if not capturable
-- user_agent:     raw browser User-Agent string, NULL if not capturable
--
-- Credentials: bcc_v3_app
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS membership_consent_log (
  id             BIGINT           AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT           NOT NULL,
  consent_type   ENUM('APPLICATION','RENEWAL') NOT NULL,
  terms_version  VARCHAR(20)      NOT NULL,
  ip_address     VARCHAR(45)      NULL,
  user_agent     TEXT             NULL,
  consented_at   TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_consent_log_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_consent_log_user (user_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0049_create_membership_consent_log.sql', NOW());

COMMIT;
