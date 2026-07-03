-- ============================================================================
-- 0015_create_refresh_tokens.sql
-- AUTH STRATEGY: JWT (short-lived access token, stateless) + rotating
-- refresh tokens (this table). Resolves the DEFERRED item in
-- TECH-STACK-FREEZE.md — confirmed by project owner, Option C.
-- Each row = one device/session; doubles as the "view/revoke sessions by
-- device" record required by spec 01.4.
-- ============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id                     BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id                BIGINT NOT NULL,
  token_hash             VARCHAR(255) NOT NULL,
  device_label           VARCHAR(255) NULL,
  ip_address             VARCHAR(45)  NULL,
  user_agent             VARCHAR(500) NULL,
  issued_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at           TIMESTAMP NULL,
  expires_at             TIMESTAMP NOT NULL,
  revoked_at             TIMESTAMP NULL,
  replaced_by_token_id   BIGINT NULL,
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_refresh_tokens_replaced_by FOREIGN KEY (replaced_by_token_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  INDEX idx_refresh_tokens_user_active (user_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
