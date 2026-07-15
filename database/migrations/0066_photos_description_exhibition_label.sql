-- 0066_photos_description_exhibition_label.sql
-- Add description and exhibition_label columns to photos table.
-- description: full narrative text about the photo.
-- exhibition_label: short label used for exhibitions (e.g. "Monsoon Arrival, Bhopal — 2024").

ALTER TABLE photos
  ADD COLUMN description      TEXT         NULL AFTER caption,
  ADD COLUMN exhibition_label VARCHAR(255) NULL AFTER description;
