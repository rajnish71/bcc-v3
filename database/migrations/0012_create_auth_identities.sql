-- ============================================================================
-- 0012_create_auth_identities.sql
-- Social login links (spec 01.2: Google, Facebook, Instagram).
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_identities (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT NOT NULL,
  provider          ENUM('GOOGLE','FACEBOOK','INSTAGRAM') NOT NULL,
  provider_user_id  VARCHAR(255) NOT NULL,
  linked_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auth_identities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_provider_identity (provider, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
