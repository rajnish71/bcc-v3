-- 0058_add_photo_view_count.sql
-- Adds view_count column to photos table for the Views counter
-- on the Canonical Photo Page (V6 21).
-- Incremented server-side on each page load via POST /api/v1/gallery/photos/:uuid/view.
-- Starting at 0 for all existing photos.

ALTER TABLE photos
  ADD COLUMN view_count INT UNSIGNED NOT NULL DEFAULT 0;
