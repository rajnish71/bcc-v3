-- ============================================================================
-- 0084_mem008_lifecycle_notifications.sql
-- MEM-008 Part 3: Adds notification types and templates required by the
-- Membership Plans, Benefits & Lifecycle Constitution.
--
-- New types:
--   MEMBERSHIP_UPGRADED            - class change to higher tier
--   MEMBERSHIP_DOWNGRADED          - class change to lower tier
--   RENEWAL_REMINDER_15            - 15-day expiry reminder (MEM-008 §Lifecycle)
--   RENEWAL_REMINDER_1             - 1-day expiry reminder  (MEM-008 §Lifecycle)
--   LEGACY_STATUS_GRANTED          - admin assigns LEGACY_MEMBER class
--   SENIOR_STATUS_ACHIEVED         - auto/manual SENIOR_MEMBER recognition
--   CONSTITUTIONAL_MEMBERSHIP_APPROVED - constitutional class activation
--
-- All inserts use INSERT IGNORE so the seed is safe to rerun.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION A: notification_types
-- ──────────────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO notification_types
  (type_key, category, module, trigger_event,
   fires_email, fires_in_app, fires_whatsapp, fires_sms, is_opt_outable, is_active)
VALUES

('MEMBERSHIP_UPGRADED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Coordinator upgrades a member to a higher membership class.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_DOWNGRADED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Coordinator downgrades a member to a lower membership class.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('RENEWAL_REMINDER_15',
 'LIFECYCLE', 'RENEWAL',
 'Renewal reminder sent 15 days before membership expiry.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

('RENEWAL_REMINDER_1',
 'LIFECYCLE', 'RENEWAL',
 'Final renewal reminder sent 1 day before membership expiry.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('LEGACY_STATUS_GRANTED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Coordinator assigns Legacy Member status to a grandfathered member.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('SENIOR_STATUS_ACHIEVED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Member qualifies for Senior Member status via age or tenure criteria.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

('CONSTITUTIONAL_MEMBERSHIP_APPROVED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Constitutional membership class (Full/Life/Patron) activated after payment confirmation.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE);


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION B: EMAIL templates
-- ──────────────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES

('MEMBERSHIP_UPGRADED', 'EMAIL',
 'Your BCC membership has been upgraded',
 '<p>Dear {{full_name}},</p>
<p>Your Bhopal Camera Club membership has been upgraded.</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Previous membership</td><td style="padding:4px 0;">{{previous_membership}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">New membership</td><td style="padding:4px 0;font-weight:bold;">{{membership_type}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Membership number</td><td style="padding:4px 0;font-family:monospace;">{{membership_number}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Valid until</td><td style="padding:4px 0;">{{valid_to}}</td></tr>
</table>
<p>Your updated benefits are now active. Visit the Member Hub to explore everything available to you.</p>
<p style="margin:24px 0;">
  <a href="{{portal_link}}" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;border-radius:0;text-decoration:none;font-weight:bold;font-size:15px;">Go to Member Hub</a>
</p>',
 '["full_name","previous_membership","membership_type","membership_number","valid_to","portal_link"]'),

('MEMBERSHIP_DOWNGRADED', 'EMAIL',
 'Update to your BCC membership',
 '<p>Dear {{full_name}},</p>
<p>Your Bhopal Camera Club membership class has been updated.</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Previous membership</td><td style="padding:4px 0;">{{previous_membership}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">New membership</td><td style="padding:4px 0;font-weight:bold;">{{membership_type}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Membership number</td><td style="padding:4px 0;font-family:monospace;">{{membership_number}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Valid until</td><td style="padding:4px 0;">{{valid_to}}</td></tr>
</table>
<p>If you have questions about this change, please contact the BCC coordinator.</p>
<p style="margin:24px 0;">
  <a href="{{portal_link}}" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;border-radius:0;text-decoration:none;font-weight:bold;font-size:15px;">View Membership</a>
</p>',
 '["full_name","previous_membership","membership_type","membership_number","valid_to","portal_link"]'),

('RENEWAL_REMINDER_15', 'EMAIL',
 'Your BCC membership expires in 15 days',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership expires in <strong>15 days</strong> on {{expiry_date}}.</p>
<p>Please renew your membership to maintain uninterrupted access to all BCC member benefits.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/hub/membership/renew" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;border-radius:0;text-decoration:none;font-weight:bold;font-size:15px;">Renew Membership</a>
</p>',
 '["full_name","membership_class","expiry_date","platform_url"]'),

('RENEWAL_REMINDER_1', 'EMAIL',
 'Final notice: Your BCC membership expires tomorrow',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership expires <strong>tomorrow</strong> on {{expiry_date}}.</p>
<p>Please renew immediately to avoid any gap in your membership status and benefits.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/hub/membership/renew" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;border-radius:0;text-decoration:none;font-weight:bold;font-size:15px;">Renew Now</a>
</p>',
 '["full_name","membership_class","expiry_date","platform_url"]'),

('LEGACY_STATUS_GRANTED', 'EMAIL',
 'Your BCC Legacy Member status has been recognised',
 '<p>Dear {{full_name}},</p>
<p>We are pleased to recognise your long association with Bhopal Camera Club. Your membership has been designated as <strong>Legacy Member</strong> status, acknowledging your contribution and early membership of the club.</p>
<p>As a Legacy Member you continue to enjoy full access to BCC member benefits including your public photographer portfolio and gallery.</p>
<p style="margin:24px 0;">
  <a href="{{portal_link}}" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;border-radius:0;text-decoration:none;font-weight:bold;font-size:15px;">View Your Profile</a>
</p>',
 '["full_name","portal_link"]'),

('SENIOR_STATUS_ACHIEVED', 'EMAIL',
 'Congratulations - BCC Senior Member status',
 '<p>Dear {{full_name}},</p>
<p>Congratulations! Based on your age or tenure with Bhopal Camera Club, you have been recognised as a <strong>Senior Member</strong>.</p>
<p>Your Senior Member badge will appear on your member profile and photographer page. This recognition reflects your dedication and longevity as a valued member of our community.</p>
<p style="margin:24px 0;">
  <a href="{{portal_link}}" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;border-radius:0;text-decoration:none;font-weight:bold;font-size:15px;">View Your Profile</a>
</p>',
 '["full_name","portal_link"]'),

('CONSTITUTIONAL_MEMBERSHIP_APPROVED', 'EMAIL',
 'Your BCC constitutional membership is now active',
 '<p>Dear {{full_name}},</p>
<p>Welcome as a <strong>{{membership_type}}</strong> of Bhopal Camera Club. Your constitutional membership is now active.</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Membership number</td><td style="padding:4px 0;font-family:monospace;font-weight:bold;">{{membership_number}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Membership valid from</td><td style="padding:4px 0;">{{valid_from}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Benefits</td><td style="padding:4px 0;">{{benefits}}</td></tr>
</table>
<p>As a constitutional member you hold voting rights and governance participation eligibility in the club.</p>
<p style="margin:24px 0;">
  <a href="{{portal_link}}" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;border-radius:0;text-decoration:none;font-weight:bold;font-size:15px;">Go to Member Hub</a>
</p>',
 '["full_name","membership_type","membership_number","valid_from","benefits","portal_link"]');


-- ──────────────────────────────────────────────────────────────────────────────
-- SECTION C: IN_APP templates
-- ──────────────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES

('MEMBERSHIP_UPGRADED', 'IN_APP',
 'Membership upgraded',
 'Your BCC membership has been upgraded from {{previous_membership}} to {{membership_type}}. New benefits are now active.',
 '["previous_membership","membership_type"]'),

('MEMBERSHIP_DOWNGRADED', 'IN_APP',
 'Membership updated',
 'Your BCC membership class has been changed from {{previous_membership}} to {{membership_type}}.',
 '["previous_membership","membership_type"]'),

('RENEWAL_REMINDER_15', 'IN_APP',
 'Renewal in 15 days',
 'Your {{membership_class}} membership expires on {{expiry_date}}. Renew soon to avoid interruption.',
 '["membership_class","expiry_date"]'),

('RENEWAL_REMINDER_1', 'IN_APP',
 'Membership expires tomorrow',
 'Your membership expires tomorrow. Renew now to maintain your member status without a gap.',
 '["expiry_date"]'),

('LEGACY_STATUS_GRANTED', 'IN_APP',
 'Legacy Member status granted',
 'Your membership has been designated as Legacy Member status in recognition of your early association with BCC.',
 NULL),

('SENIOR_STATUS_ACHIEVED', 'IN_APP',
 'Senior Member status achieved',
 'Congratulations! You have been recognised as a Senior Member of Bhopal Camera Club.',
 NULL),

('CONSTITUTIONAL_MEMBERSHIP_APPROVED', 'IN_APP',
 'Constitutional membership active',
 'Your {{membership_type}} membership with BCC is now active. Voting rights and governance participation are now enabled.',
 '["membership_type"]');

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0084_mem008_lifecycle_notifications.sql', NOW());

COMMIT;
