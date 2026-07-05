-- ============================================================================
-- 0034_gallery_schema.sql
-- Module 05 -- Photography Gallery & Digital Archive (Phase 2a)
-- Spec: BCC Unified Platform v3.0 sections 05.1 - 05.4
-- Dependency: users (0001), events (0033)
-- ============================================================================
-- Tables:
--   photos               -- photo records (presign -> confirm -> ACTIVE)
--   photo_albums         -- member-created and auto albums
--   photo_album_items    -- photos in albums (junction)
--   photo_tags           -- tag taxonomy (genre, subject, location, custom)
--   photo_tag_assignments -- many-to-many: photo <-> tag
--
-- Upload flow (browser -> R2 directly, never streams through this server):
--   1. POST /api/v1/gallery/photos/presign
--        Backend validates, creates photo row (PROCESSING), returns R2
--        presigned PUT URL and the photo UUID.
--   2. Client PUTs file directly to R2.
--   3. POST /api/v1/gallery/photos/:uuid/confirm
--        Backend HEADs R2 to verify object landed, stores optional
--        client-provided EXIF, sets status ACTIVE.
--
-- Visibility model (MEM-006 aligned, spec 05.3):
--   PUBLIC        -- visible to any visitor (unauthenticated included)
--   MEMBERS_ONLY  -- requires ACTIVE membership (any class)
--   PRIVATE       -- owner only
--   UNLISTED      -- accessible via direct UUID link, excluded from listings
--
-- Upload entitlement: ACTIVE membership required (any class). Registered
-- Users who are not members cannot upload.
--
-- EXIF: stored as nullable columns; provided by client on /confirm call.
--   Server-side EXIF extraction via R2 range read is deferred to Phase 4
--   (when the AI module runs batch EXIF backfill). Client is responsible
--   for extracting EXIF before upload using a browser EXIF library.
-- ============================================================================

CREATE TABLE photos (
  id                  BIGINT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid                CHAR(36)         NOT NULL UNIQUE,
  owner_user_id       BIGINT           NOT NULL,

  -- Storage (R2 key is the canonical identifier; ImageKit URLs are derived)
  r2_key              VARCHAR(500)     NOT NULL UNIQUE,
  original_filename   VARCHAR(255)     NOT NULL,
  mime_type           VARCHAR(100)     NOT NULL,
  -- File format normalised from mime_type at presign time
  file_format         ENUM(
                        'JPEG','PNG','TIFF','HEIC','WEBP',
                        'NEF','CR2','CR3','ARW','ORF','DNG','OTHER'
                      ) NOT NULL,
  -- Populated by backend from R2 HEAD on /confirm; cross-checked against
  -- client-declared size at presign.
  file_size_bytes     BIGINT UNSIGNED,
  -- SHA-256 of raw file bytes, provided by client on /confirm (optional).
  -- Used for exact-duplicate detection. Perceptual hash deferred Phase 4.
  sha256_hash         CHAR(64),

  -- Upload lifecycle
  -- PROCESSING: presigned URL issued, upload not yet confirmed
  -- ACTIVE:     /confirm verified object in R2
  -- DELETED:    soft-deleted (deleted_at set, r2_key retained for audit)
  status              ENUM('PROCESSING','ACTIVE','DELETED') NOT NULL DEFAULT 'PROCESSING',
  confirmed_at        DATETIME,
  deleted_at          DATETIME,

  -- Content metadata (owner can set/update post-confirm)
  title               VARCHAR(255),
  caption             TEXT,

  -- Image dimensions (from client EXIF on /confirm)
  width_px            INT UNSIGNED,
  height_px           INT UNSIGNED,

  -- EXIF (all nullable; client-provided on /confirm)
  exif_camera_make    VARCHAR(100),
  exif_camera_model   VARCHAR(100),
  exif_lens_model     VARCHAR(100),
  exif_focal_length   DECIMAL(7,2),     -- mm
  exif_aperture       DECIMAL(5,2),     -- f-number (e.g. 2.8)
  exif_shutter_speed  VARCHAR(30),      -- e.g. "1/200" or "2"
  exif_iso            INT UNSIGNED,
  exif_taken_at       DATETIME,         -- from EXIF DateTimeOriginal
  exif_gps_lat        DECIMAL(9,6),
  exif_gps_lng        DECIMAL(9,6),
  gps_stripped        TINYINT(1)        NOT NULL DEFAULT 0,

  -- Genre (fixed taxonomy from spec 05.2)
  genre               ENUM(
                        'WILDLIFE','BIRD','STREET','PORTRAIT','LANDSCAPE',
                        'ARCHITECTURE','MACRO','NIGHT','TRAVEL','AERIAL',
                        'UNDERWATER','ABSTRACT','DOCUMENTARY','SPORT','OTHER'
                      ),

  -- Visibility
  visibility          ENUM('PUBLIC','MEMBERS_ONLY','PRIVATE','UNLISTED')
                      NOT NULL DEFAULT 'MEMBERS_ONLY',

  -- Optional source linkage (post-event gallery upload)
  source_event_id     BIGINT,

  -- Timestamps
  created_at          DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_photos_owner           (owner_user_id),
  INDEX idx_photos_status_vis      (status, visibility),
  INDEX idx_photos_genre           (genre),
  INDEX idx_photos_source_event    (source_event_id),
  INDEX idx_photos_taken_at        (exif_taken_at),
  INDEX idx_photos_sha256          (sha256_hash),

  CONSTRAINT fk_photos_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_photos_event FOREIGN KEY (source_event_id) REFERENCES events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Albums
-- MEMBER_CREATED: owned by a member, title/desc editable.
-- AUTO_EVENT: system-created when an event is linked; source_ref_id = event_id.
-- AUTO_CONTEST: system-created; source_ref_id = contest_id (Phase 2b).
-- ============================================================================

CREATE TABLE photo_albums (
  id              BIGINT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36)        NOT NULL UNIQUE,
  owner_user_id   BIGINT          NOT NULL,
  title           VARCHAR(255)    NOT NULL,
  description     TEXT,
  cover_photo_id  BIGINT,
  album_type      ENUM('MEMBER_CREATED','AUTO_EVENT','AUTO_CONTEST')
                  NOT NULL DEFAULT 'MEMBER_CREATED',
  source_ref_id   BIGINT,         -- event_id or contest_id for AUTO albums
  visibility      ENUM('PUBLIC','MEMBERS_ONLY','PRIVATE')
                  NOT NULL DEFAULT 'MEMBERS_ONLY',
  sort_order      INT             NOT NULL DEFAULT 0,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_albums_owner (owner_user_id),

  CONSTRAINT fk_albums_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_albums_cover FOREIGN KEY (cover_photo_id) REFERENCES photos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Album items (junction: album <-> photo)
-- sort_order allows manual reordering within an album.
-- ON DELETE CASCADE on album_id: deleting an album removes its item rows
-- (photos themselves are not deleted).
-- ============================================================================

CREATE TABLE photo_album_items (
  id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  album_id    BIGINT      NOT NULL,
  photo_id    BIGINT      NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  added_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_album_photo     (album_id, photo_id),
  INDEX      idx_items_photo    (photo_id),

  CONSTRAINT fk_items_album FOREIGN KEY (album_id)
    REFERENCES photo_albums(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_photo FOREIGN KEY (photo_id)
    REFERENCES photos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tag taxonomy
-- is_system = 1: seeded by admin migration, cannot be deleted via API.
-- is_system = 0: user-created custom tags.
-- ============================================================================

CREATE TABLE photo_tags (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tag_key      VARCHAR(100) NOT NULL UNIQUE,   -- URL-safe slug, lowercase
  display_name VARCHAR(100) NOT NULL,
  category     ENUM('GENRE','SUBJECT','LOCATION','EQUIPMENT','CUSTOM')
               NOT NULL,
  is_system    TINYINT(1)   NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tag assignments (many-to-many photo <-> tag)
-- ON DELETE CASCADE on photo_id: deleting a photo removes tag assignment rows.
-- ============================================================================

CREATE TABLE photo_tag_assignments (
  photo_id    BIGINT      NOT NULL,
  tag_id      BIGINT      NOT NULL,
  assigned_by BIGINT      NOT NULL,
  assigned_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (photo_id, tag_id),
  INDEX idx_pta_tag  (tag_id),

  CONSTRAINT fk_pta_photo FOREIGN KEY (photo_id)
    REFERENCES photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pta_tag   FOREIGN KEY (tag_id)   REFERENCES photo_tags(id),
  CONSTRAINT fk_pta_user  FOREIGN KEY (assigned_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Seed: system genre tags (spec 05.2 genre taxonomy)
-- These mirror the genre ENUM on the photos table; stored as tags too so
-- they can be returned from the /gallery/tags endpoint for UI filter chips.
-- ============================================================================

INSERT INTO photo_tags (tag_key, display_name, category, is_system) VALUES
  ('wildlife',     'Wildlife',     'GENRE', 1),
  ('bird',         'Bird',         'GENRE', 1),
  ('street',       'Street',       'GENRE', 1),
  ('portrait',     'Portrait',     'GENRE', 1),
  ('landscape',    'Landscape',    'GENRE', 1),
  ('architecture', 'Architecture', 'GENRE', 1),
  ('macro',        'Macro',        'GENRE', 1),
  ('night',        'Night',        'GENRE', 1),
  ('travel',       'Travel',       'GENRE', 1),
  ('aerial',       'Aerial',       'GENRE', 1),
  ('underwater',   'Underwater',   'GENRE', 1),
  ('abstract',     'Abstract',     'GENRE', 1),
  ('documentary',  'Documentary',  'GENRE', 1),
  ('sport',        'Sport',        'GENRE', 1),
  ('other',        'Other',        'GENRE', 1);
