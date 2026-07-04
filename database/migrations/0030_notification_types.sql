-- ============================================================================
-- 0030_notification_types.sql
-- Module 17 Communication Engine - notification taxonomy catalogue.
--
-- type_key is the stable string identifier used in all code references
-- (e.g. 'MEMBERSHIP_ACTIVATED', 'PAYMENT_RECEIPT_CONFIRMED'). It is the
-- FK target for notification_templates and notification_log so it must
-- never be changed once in production.
--
-- is_opt_outable = FALSE enforces constitutional non-optability at dispatch
-- time via CommunicationService. Database does not enforce this directly -
-- the opt-out check in CommunicationService skips the preferences lookup
-- when the type's is_opt_outable flag is FALSE.
--
-- fires_whatsapp and fires_sms default FALSE - all SMS/WhatsApp dispatch
-- is gated behind PHONE_OTP_ENABLED=true in .env. These flags indicate
-- intent only; the runtime channel guard reads the env flag.
--
-- is_active = FALSE for Phase 2+ types registered here for completeness
-- but not yet wired to any trigger. Inactive types are rejected at dispatch
-- time by CommunicationService before any DB writes occur.
--
-- Rows are seeded by seed_0005_notification_taxonomy.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_types (
  id              INT           AUTO_INCREMENT PRIMARY KEY,
  type_key        VARCHAR(100)  NOT NULL,
  category        ENUM(
                    'TRANSACTIONAL',
                    'LIFECYCLE',
                    'ALERT',
                    'BROADCAST',
                    'DIGEST'
                  )             NOT NULL,
  module          VARCHAR(50)   NOT NULL
                  COMMENT 'Owning module: IDENTITY | MEMBERSHIP | PAYMENT | RENEWAL | EVENTS | CONTEST',
  trigger_event   VARCHAR(255)  NOT NULL
                  COMMENT 'Human-readable trigger description for admin panel display',
  fires_email     BOOLEAN       NOT NULL DEFAULT TRUE,
  fires_in_app    BOOLEAN       NOT NULL DEFAULT TRUE,
  fires_whatsapp  BOOLEAN       NOT NULL DEFAULT FALSE,
  fires_sms       BOOLEAN       NOT NULL DEFAULT FALSE,
  is_opt_outable  BOOLEAN       NOT NULL DEFAULT TRUE,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_type_key (type_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
