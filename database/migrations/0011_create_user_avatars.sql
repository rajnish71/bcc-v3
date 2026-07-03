-- ============================================================================
-- 0011_create_user_avatars.sql
-- Multi-size avatar crop (spec 01.3). One row per size variant.
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_avatars (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  size_variant    ENUM('THUMB','SMALL','MEDIUM','LARGE','ORIGINAL') NOT NULL,
  r2_key          VARCHAR(500) NOT NULL,
  imagekit_url    VARCHAR(500) NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_avatars_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_avatar_variant (user_id, size_variant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
