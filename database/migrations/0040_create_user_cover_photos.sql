-- ============================================================================
-- 0040_create_user_cover_photos.sql
-- Phase D -- Member Profile Schema (Batch D1)
--
-- Creates user_cover_photos table.
--
-- SOURCE (Phase C audit):
--   bcc.bcc_photographers.cover_photo_url
--   10 of 17 active members have real R2 assets at uploads/covers/{ts}-{hash}.{ext}
--   7 members have Unsplash placeholder URLs -- these will NOT be migrated.
--
-- DESIGN DECISIONS:
--
--   Multi-row table (not a single-column extension of users):
--     Allows upload history, future cover photo rotation, and admin uploads on
--     behalf of members without losing previous covers.
--
--   Single active cover enforced at database layer via generated column:
--     active_lock = user_id when is_active = TRUE, NULL otherwise.
--     MySQL unique index ignores multiple NULLs -- at most one active cover
--     per user_id participates in the unique check. Same pattern as
--     member_recognitions.active_lock (migration 0005).
--
--   No CDN variant sizes stored:
--     ImageKit handles all resizing via URL parameters at delivery time.
--     Only the original r2_key and one canonical imagekit_url are stored.
--     This keeps the table lean and avoids maintenance overhead.
--
--   r2_key format (confirmed in Phase C):
--     Strip leading / from cover_photo_url.
--     Result: uploads/covers/{timestamp}-{hash}.{ext}
--
--   imagekit_url format:
--     https://ik.imagekit.io/duynda7oq/{r2_key}
--
-- DATA MIGRATION:
--   Populating the 10 R2 cover photos is a separate operation (Batch D2).
--   This migration creates the table only.
--
-- CONSTITUTION:
--   No founding member data is altered. All existing user rows are untouched.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE IF NOT EXISTS user_cover_photos (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT NOT NULL,

  r2_key        VARCHAR(500) NOT NULL,
  imagekit_url  VARCHAR(500) NOT NULL,

  is_active     BOOLEAN NOT NULL DEFAULT TRUE,

  -- Enforces one active cover per user at the database layer.
  -- NULL values do not participate in the unique constraint.
  active_lock   BIGINT GENERATED ALWAYS AS (IF(is_active = TRUE, user_id, NULL)) STORED,

  uploaded_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_cover_photos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_one_active_cover (active_lock),
  INDEX idx_cover_photos_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0040_create_user_cover_photos.sql', NOW());

COMMIT;
