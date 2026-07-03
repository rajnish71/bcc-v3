-- ============================================================================
-- 0016_create_login_history_and_lockouts.sql
-- Spec 01.4: login history + lockout after repeated failed attempts.
-- ============================================================================
CREATE TABLE IF NOT EXISTS login_history (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT NULL,
  email_attempted  VARCHAR(255) NULL,
  ip_address       VARCHAR(45)  NULL,
  device           VARCHAR(255) NULL,
  location         VARCHAR(255) NULL,
  status           ENUM('SUCCESS','FAILED','LOCKED') NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_login_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_login_history_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_lockouts (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT NOT NULL,
  failed_attempts  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_at        TIMESTAMP NULL,
  unlocked_at      TIMESTAMP NULL,
  unlocked_by      BIGINT NULL,
  CONSTRAINT fk_account_lockouts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_account_lockouts_unlocked_by FOREIGN KEY (unlocked_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_account_lockouts_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
