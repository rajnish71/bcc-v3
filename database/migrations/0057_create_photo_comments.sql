-- Migration 0057: photo_comments
-- Per-photo comment thread. Soft-deleted via is_deleted flag.
-- Owned by the Canonical Photo (PHOTO-ARCH-001 Principle 9).

CREATE TABLE photo_comments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  photo_id   BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT          NOT NULL,
  body       TEXT            NOT NULL,
  is_deleted TINYINT(1)      NOT NULL DEFAULT 0,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_photo_comments_photo (photo_id),
  KEY idx_photo_comments_user  (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (filename) VALUES ('0057_create_photo_comments.sql');
