-- 0064: Photographer gallery layout preference
-- Each user chooses how their public /photographers/{username}/ gallery is rendered.
-- Default 'justified' preserves existing behaviour for all current accounts.

ALTER TABLE users
  ADD COLUMN gallery_layout
    ENUM('justified','masonry','editorial','modular','metro','magazine')
    NOT NULL DEFAULT 'justified'
  AFTER profile_visibility;

INSERT INTO schema_migrations (filename) VALUES ('0064_photographer_gallery_layout.sql');
