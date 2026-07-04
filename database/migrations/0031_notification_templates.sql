-- ============================================================================
-- 0031_notification_templates.sql
-- Module 17 Communication Engine - template store.
--
-- One row per (type_key, channel). English is required; Hindi body_hi is
-- optional and falls back to English at dispatch time when NULL.
--
-- body_en for EMAIL channel stores an HTML fragment (not a full document).
-- CommunicationService wraps it in the standard BCC email shell at dispatch
-- time. This keeps branding in code and content editable in the admin panel.
--
-- body_en for IN_APP channel stores plain text (no HTML) - the notification
-- bell renders it as text inside the platform UI.
--
-- Variables use {{mustache_style}} tokens substituted by simple string
-- replacement in CommunicationService. No external template library.
-- The `variables` JSON array documents available tokens per template for
-- the admin panel template editor - informational only, not DB-enforced.
--
-- Templates are user-editable via the admin panel (Phase 1 admin module).
-- Rows seeded by seed_0005_notification_taxonomy.sql are initial defaults.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_templates (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  type_key    VARCHAR(100)  NOT NULL,
  channel     ENUM(
                'EMAIL',
                'IN_APP',
                'WHATSAPP',
                'SMS'
              )             NOT NULL,
  subject_en  VARCHAR(255)  NULL
              COMMENT 'Email subject line (English). NULL for non-email channels.',
  body_en     TEXT          NOT NULL
              COMMENT 'HTML fragment for EMAIL; plain text for IN_APP/WHATSAPP/SMS.',
  subject_hi  VARCHAR(255)  NULL
              COMMENT 'Email subject line (Hindi). Optional.',
  body_hi     TEXT          NULL
              COMMENT 'Hindi body. NULL falls back to English at dispatch time.',
  variables   JSON          NULL
              COMMENT 'Array of available token names, e.g. ["first_name","expiry_date"]',
  version     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tmpl_type FOREIGN KEY (type_key)
    REFERENCES notification_types(type_key),
  UNIQUE KEY uq_tmpl_type_channel (type_key, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
