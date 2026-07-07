-- ============================================================================
-- 0036_journal_schema.sql
-- Module: Journal
--
-- Creates the journal_posts table for BCC editorial content.
--
-- LIFECYCLE:  DRAFT → PUBLISHED → ARCHIVED
-- AUTHORING:  Content Editor, Coordinator, Platform Admin, Super Admin
--             (permissions seeded separately in seed_0010_journal_permissions.sql)
-- BODY:       Stores HTML from a rich text editor — any standard HTML subset
--             produced by Quill, TipTap, TinyMCE, etc. is acceptable.
-- HERO IMAGE: hero_image_url holds a full URL (legacy CDN path or future
--             ImageKit/R2 URL). hero_r2_key is reserved for direct R2 uploads.
-- ============================================================================

INSERT IGNORE INTO schema_migrations (filename, executed_at)
  VALUES ('0036_journal_schema.sql', NOW());

CREATE TABLE IF NOT EXISTS journal_posts (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid                 VARCHAR(36)  NOT NULL,
  slug                 VARCHAR(120) NOT NULL,

  title                VARCHAR(255) NOT NULL,
  description          TEXT         NULL     COMMENT 'SEO meta / listing-card excerpt',
  body                 LONGTEXT     NOT NULL COMMENT 'HTML from rich text editor',
  excerpt              TEXT         NULL     COMMENT 'Short excerpt; falls back to description',

  category             VARCHAR(60)  NOT NULL DEFAULT 'Guide',
  tags                 JSON         NULL,

  hero_image_url       VARCHAR(500) NULL     COMMENT 'Full URL — legacy CDN or ImageKit/R2',
  hero_r2_key          VARCHAR(500) NULL     COMMENT 'Reserved for future direct R2 uploads',

  reading_time_minutes TINYINT UNSIGNED NOT NULL DEFAULT 5,

  -- Author: FK to users; NULL = authored as "Bhopal Camera Club" (institutional)
  author_user_id       INT UNSIGNED NULL,
  author_display_name  VARCHAR(255) NOT NULL DEFAULT 'Bhopal Camera Club',

  status               ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  published_at         DATETIME NULL,

  -- SEO overrides (optional; frontend falls back to title / description)
  seo_title            VARCHAR(255) NULL,
  seo_description      TEXT         NULL,

  created_at           DATETIME NOT NULL,
  updated_at           DATETIME NOT NULL,

  PRIMARY KEY (id),
  UNIQUE  KEY uq_journal_posts_uuid (uuid),
  UNIQUE  KEY uq_journal_posts_slug (slug),
  KEY     idx_journal_posts_status_pub (status, published_at DESC),
  KEY     idx_journal_posts_author    (author_user_id),

  CONSTRAINT fk_journal_posts_author
    FOREIGN KEY (author_user_id) REFERENCES users (id)
    ON DELETE SET NULL

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
