-- ============================================================================
-- 0017_create_mfa_methods.sql
-- Spec 01.4: MFA — TOTP, SMS, email. Biometric (Capacitor) is a device-local
-- unlock in front of a refresh token, not a server-side method here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS mfa_methods (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT NOT NULL,
  method            ENUM('TOTP','SMS','EMAIL') NOT NULL,
  secret_encrypted  VARCHAR(500) NULL,
  enabled_at        TIMESTAMP NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mfa_methods_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_mfa_method (user_id, method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
