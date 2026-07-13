-- Migration 0056: photo_reactions
-- Stores per-user reactions on canonical photos: LIKE, FAVOURITE, BOOKMARK.
-- One row per (photo, user, reaction_type). Toggle semantics handled in application.

CREATE TABLE photo_reactions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  photo_id      BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT          NOT NULL,
  reaction_type ENUM('LIKE','FAVOURITE','BOOKMARK') NOT NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_photo_user_reaction (photo_id, user_id, reaction_type),
  KEY idx_photo_reactions_photo (photo_id),
  KEY idx_photo_reactions_user  (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (filename) VALUES ('0056_create_photo_reactions.sql');
