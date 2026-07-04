-- ============================================================================
-- 0032_notification_log_and_inbox.sql
-- Module 17 Communication Engine - delivery tracking + in-platform inbox.
--
-- notification_log
-- ----------------
-- One row per dispatch attempt per channel. Written by CommunicationService
-- before the actual send so a QUEUED record always exists even if the send
-- throws. Status is updated to SENT/FAILED after the provider responds.
--
-- SKIPPED is used when:
--   - Channel is feature-flagged off (e.g. PHONE_OTP_ENABLED=false for SMS/WA)
--   - User has opted out and the type is opt-outable
--   Recording SKIPPED rows gives the admin panel full visibility into what
--   was suppressed and why, without cluttering FAILED counts.
--
-- No retry daemon (RAM constraint). Failed sends are retried on the next
-- applicable trigger or via manual admin resend. retry_count is incremented
-- on each manual resend attempt.
--
-- variables_snapshot captures the variables dict at dispatch time so admin
-- can inspect exactly what was rendered, and resend without re-resolving them.
--
-- in_app_notifications
-- ---------------------
-- Powers the notification bell. Written atomically with the notification_log
-- IN_APP row by CommunicationService.dispatchInApp(). The log_id FK links
-- them so the admin panel can correlate inbox items with delivery records.
--
-- Retention: 90 days. expires_at is set to created_at + INTERVAL 90 DAY
-- at insert time by the application layer. A periodic cleanup job (no daemon
-- - runs on a scheduled admin trigger or cron if added later) deletes rows
-- WHERE expires_at < NOW().
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_log (
  id                  BIGINT        AUTO_INCREMENT PRIMARY KEY,
  type_key            VARCHAR(100)  NOT NULL,
  user_id             BIGINT        NOT NULL,
  channel             ENUM(
                        'IN_APP',
                        'EMAIL',
                        'WHATSAPP',
                        'SMS'
                      )             NOT NULL,
  status              ENUM(
                        'QUEUED',
                        'SENT',
                        'FAILED',
                        'BOUNCED',
                        'SKIPPED'
                      )             NOT NULL DEFAULT 'QUEUED',
  provider_message_id VARCHAR(255)  NULL
                      COMMENT 'Resend email ID, MSG91 ref, etc.',
  variables_snapshot  JSON          NULL
                      COMMENT 'Snapshot of variable dict at dispatch time - for audit and resend.',
  skip_reason         VARCHAR(100)  NULL
                      COMMENT 'Populated when status=SKIPPED: OPT_OUT | CHANNEL_DISABLED',
  sent_at             DATETIME      NULL,
  failed_at           DATETIME      NULL,
  retry_count         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error_detail        TEXT          NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_log_user    (user_id),
  INDEX idx_log_type    (type_key),
  INDEX idx_log_status  (status),
  INDEX idx_log_created (created_at),
  CONSTRAINT fk_log_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS in_app_notifications (
  id          BIGINT        AUTO_INCREMENT PRIMARY KEY,
  log_id      BIGINT        NOT NULL
              COMMENT 'FK to notification_log IN_APP row.',
  user_id     BIGINT        NOT NULL,
  title       VARCHAR(255)  NOT NULL,
  body        TEXT          NOT NULL,
  action_url  VARCHAR(500)  NULL
              COMMENT 'Optional deep-link, e.g. /member/card or /membership/apply.',
  is_read     BOOLEAN       NOT NULL DEFAULT FALSE,
  read_at     DATETIME      NULL,
  expires_at  DATETIME      NOT NULL
              COMMENT 'Set to created_at + INTERVAL 90 DAY by application layer.',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inbox_user_unread (user_id, is_read),
  INDEX idx_inbox_expires     (expires_at),
  CONSTRAINT fk_inbox_log  FOREIGN KEY (log_id)
    REFERENCES notification_log(id) ON DELETE CASCADE,
  CONSTRAINT fk_inbox_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
