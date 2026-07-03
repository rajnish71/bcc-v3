-- ============================================================================
-- 0018_create_user_social_and_gear.sql
-- Spec 01.3: social handles + camera gear list. Multi-row per user.
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_social_handles (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  platform        ENUM('INSTAGRAM','FLICKR','FIVE_HUNDRED_PX','YOUTUBE','WEBSITE') NOT NULL,
  handle_or_url   VARCHAR(500) NOT NULL,
  CONSTRAINT fk_user_social_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_social_platform (user_id, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_gear (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  gear_type   ENUM('BODY','LENS','ACCESSORY') NOT NULL,
  label       VARCHAR(255) NOT NULL,
  CONSTRAINT fk_user_gear_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
