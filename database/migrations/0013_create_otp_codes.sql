-- ============================================================================
-- 0013_create_otp_codes.sql
-- Phone + OTP registration/login (spec 01.2, WhatsApp OTP for India).
-- ============================================================================
CREATE TABLE IF NOT EXISTS otp_codes (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id        BIGINT NULL,
  phone          VARCHAR(20) NOT NULL,
  code_hash      VARCHAR(255) NOT NULL,
  purpose        ENUM('REGISTRATION','LOGIN','PASSWORD_RESET') NOT NULL,
  expires_at     TIMESTAMP NOT NULL,
  consumed_at    TIMESTAMP NULL,
  attempt_count  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_otp_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_otp_phone_purpose (phone, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
