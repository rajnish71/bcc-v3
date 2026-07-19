-- ============================================================================
-- 0075_editorial_hero_assignments.sql
--
-- Editorial Hero Assignments.
--
-- Allows assigning existing photographs as Hero images for various pages/locations.
--
-- Idempotency
--   CREATE TABLE IF NOT EXISTS: safe to re-run.
-- ============================================================================

SET NAMES utf8mb4;
START TRANSACTION;

CREATE TABLE IF NOT EXISTS hero_assignments (
  id               BIGINT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  photo_uuid       VARCHAR(36)      NOT NULL,
  location         VARCHAR(100)     NOT NULL,
  mode             ENUM('FIXED', 'POOL') NOT NULL DEFAULT 'FIXED',
  assigned_by      BIGINT           NOT NULL,
  assigned_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_hero_photo FOREIGN KEY (photo_uuid) REFERENCES photos(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_hero_user  FOREIGN KEY (assigned_by) REFERENCES users(id),
  
  UNIQUE KEY uq_location_photo (location, photo_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate existing spotlight configurations from gallery_spotlight into hero_assignments.
INSERT IGNORE INTO hero_assignments (photo_uuid, location, mode, assigned_by, assigned_at)
SELECT photo_uuid, 'home', 'FIXED', set_by_user_id, set_at
FROM gallery_spotlight;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0075_editorial_hero_assignments.sql', NOW());

COMMIT;
