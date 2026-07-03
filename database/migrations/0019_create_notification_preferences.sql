-- ============================================================================
-- 0019_create_notification_preferences.sql
-- Spec 01.3 + Module 17 taxonomy. notification_type is VARCHAR not ENUM
-- since Module 17 (later in Phase 1) owns and may extend that taxonomy.
-- Mandatory non-opt-outable types enforced at application layer, not here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT NOT NULL,
  notification_type   VARCHAR(100) NOT NULL,
  channel             ENUM('IN_APP','WHATSAPP','EMAIL','SMS') NOT NULL,
  opted_in            BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_notif_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_notif_channel (user_id, notification_type, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
