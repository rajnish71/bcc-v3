-- ============================================================================
-- 0109_add_gallery_photo_hard_delete_permission.sql
-- Super Admin Hard Delete of a Canonical Photo (PHOTO-ARCH-002 Principle 13).
--
-- Follows the exact pattern of 0101: permissions(permission_key,
-- description) + role_permissions via CROSS JOIN. Granted to Super Admin
-- ONLY -- this permission gates the irreversible
-- DELETE /api/v1/gallery/admin/photos/:id endpoint (Master Asset removed
-- from R2, all Canonical Photo records removed). Do not add other roles
-- without explicit written instruction.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO permissions (permission_key, description)
VALUES ('gallery.photo.hard_delete', 'Permanently and irreversibly delete a Canonical Photo and its Master Asset (Super Admin only)');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin'
  AND p.permission_key = 'gallery.photo.hard_delete';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0109_add_gallery_photo_hard_delete_permission.sql', NOW());

COMMIT;
