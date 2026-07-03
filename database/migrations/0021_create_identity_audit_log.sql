-- ============================================================================
-- 0021_create_identity_audit_log.sql
-- Deliberately separate from membership_audit_log (0007) per MEM-006 P3 —
-- routing RBAC/session events through the membership audit table would
-- create quiet schema-level coupling even with clean application code.
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity_audit_log (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id         BIGINT NULL,
  target_user_id   BIGINT NOT NULL,
  action_type      VARCHAR(100) NOT NULL,
  old_value        JSON NULL,
  new_value        JSON NULL,
  reason           VARCHAR(500) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_identity_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_identity_audit_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_identity_audit_target (target_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
