-- ============================================================================
-- 0053_create_pending_email_changes.sql
-- V6 20 Account Settings: email change verification flow.
--
-- pending_email_changes: one row per user with an in-flight email change.
--   - upsert pattern: only one pending change per user at a time.
--   - token_hash stored (raw token sent in email link, never persisted).
--   - 24h expiry enforced in application logic.
--
-- Also seeds the ACCOUNT_EMAIL_CHANGE_VERIFY notification type and template.
--
-- Credentials: bcc_v3_app
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

CREATE TABLE pending_email_changes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT          NOT NULL,
  new_email   VARCHAR(255)    NOT NULL,
  token_hash  VARCHAR(64)     NOT NULL,
  expires_at  TIMESTAMP       NOT NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pending_email_changes_user (user_id),
  INDEX idx_pending_email_changes_token (token_hash),
  CONSTRAINT fk_pec_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notification type for email change verification
INSERT INTO notification_types
  (type_key, category, module, trigger_event, fires_email, fires_in_app, fires_whatsapp, fires_sms, is_opt_outable, is_active)
VALUES
  ('ACCOUNT_EMAIL_CHANGE_VERIFY', 'TRANSACTIONAL', 'identity', 'account_email_change_initiate', 1, 0, 0, 0, 0, 1);

-- Email template for email change verification
INSERT INTO notification_templates
  (type_key, channel, subject_en, body_en, subject_hi, body_hi, variables)
VALUES (
  'ACCOUNT_EMAIL_CHANGE_VERIFY',
  'EMAIL',
  'Verify your new email address — Bhopal Camera Club',
  '<p>Hello {{first_name}},</p>
<p>You requested to change your email address on the Bhopal Camera Club platform.</p>
<p>Click the button below to confirm your new email address <strong>{{new_email}}</strong>.</p>
<p style="margin: 24px 0;">
  <a href="{{verify_url}}" style="background: linear-gradient(135deg,#C9A961,#A8843C); color:#fff; padding: 12px 28px; text-decoration:none; font-weight:600; border-radius:2px;">
    Verify New Email
  </a>
</p>
<p>This link expires in 24 hours. If you did not request this change, you can safely ignore this email — your current email address remains active.</p>',
  NULL,
  NULL,
  '["first_name","new_email","verify_url"]'
);

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0053_create_pending_email_changes.sql', NOW());

COMMIT;
