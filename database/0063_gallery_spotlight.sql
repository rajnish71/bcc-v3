-- Migration 0063: gallery_spotlight — admin-curated homepage hero
--
-- Single-row configuration table (id=1 is the only row).
-- Admin sets the spotlight photo via PUT /api/v1/gallery/spotlight.
-- Homepage falls back to feed?limit=1 when no row exists.

CREATE TABLE IF NOT EXISTS gallery_spotlight (
  id               TINYINT UNSIGNED NOT NULL DEFAULT 1,
  photo_uuid       VARCHAR(36)      NOT NULL,
  title_override   VARCHAR(255)     NULL COMMENT 'Optional display title; NULL = use photo.title',
  credit_override  VARCHAR(255)     NULL COMMENT 'Optional credit line; NULL = auto from photographer',
  set_by_user_id   BIGINT           NOT NULL,
  set_at           DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_spotlight_photo FOREIGN KEY (photo_uuid)       REFERENCES photos(uuid) ON DELETE CASCADE,
  CONSTRAINT fk_spotlight_user  FOREIGN KEY (set_by_user_id)  REFERENCES users(id)
);

-- RBAC: new permission for setting the spotlight
INSERT IGNORE INTO permissions (permission_key, description)
VALUES ('gallery.spotlight.set', 'Set the homepage spotlight photo from the admin panel');

-- Assign gallery.spotlight.set to the admin role
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
  AND p.permission_key = 'gallery.spotlight.set';
