-- ============================================================================
-- 0037_create_contact_messages.sql
-- Module: Contact
--
-- Creates the contact_messages table to store all contact form submissions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_messages (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(120) NOT NULL,
  email        VARCHAR(254) NOT NULL,
  phone        VARCHAR(20)  NULL,
  subject      VARCHAR(200) NOT NULL,
  message      TEXT         NOT NULL,
  ip_address   VARCHAR(45)  NULL,
  user_agent   VARCHAR(500) NULL,
  submitted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status       ENUM('NEW', 'READ', 'RESPONDED', 'CLOSED', 'SPAM') NOT NULL DEFAULT 'NEW',

  PRIMARY KEY (id),
  KEY idx_contact_messages_status (status),
  KEY idx_contact_messages_submitted (submitted_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (filename, executed_at)
  VALUES ('0037_create_contact_messages.sql', NOW());
