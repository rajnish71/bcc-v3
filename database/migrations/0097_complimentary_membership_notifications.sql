-- ============================================================================
-- 0097_complimentary_membership_notifications.sql
-- Adds notification types + email templates for the exceptional
-- administrative complimentary-membership courtesy grant (case-specific,
-- not a general waiver/discount mechanism -- see
-- MembershipAdminService.grantComplimentaryMembership()).
--
-- New types:
--   MEMBERSHIP_COMPLIMENTARY_ACTIVATED  - complimentary period activation,
--                                          clearly distinguished from the
--                                          standard MEMBERSHIP_ACTIVATED copy
--   MEMBERSHIP_COMPLIMENTARY_ENDING     - courtesy period ending soon, payment
--                                          will be required to continue
--
-- All inserts use INSERT IGNORE so the seed is safe to rerun.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT IGNORE INTO notification_types
  (type_key, category, module, trigger_event,
   fires_email, fires_in_app, fires_whatsapp, fires_sms, is_opt_outable, is_active)
VALUES

('MEMBERSHIP_COMPLIMENTARY_ACTIVATED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Administrator grants a time-boxed complimentary (courtesy) membership period.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_COMPLIMENTARY_ENDING',
 'LIFECYCLE', 'RENEWAL',
 'A complimentary/courtesy membership period is ending; standard payment is now required to continue.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE);

INSERT IGNORE INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES

('MEMBERSHIP_COMPLIMENTARY_ACTIVATED', 'EMAIL',
 'Your complimentary BCC membership is now active',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership with Bhopal Camera Club is now active as a <strong>Complimentary Membership &mdash; 2 months</strong>.</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Membership number</td><td style="padding:4px 0;font-family:monospace;font-weight:bold;">{{membership_number}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Complimentary period valid until</td><td style="padding:4px 0;">{{complimentary_until}}</td></tr>
</table>
<p>This is a temporary administrative courtesy, distinct from the standard {{membership_class}} plan. After {{complimentary_until}}, continuing your membership will require the standard {{membership_class}} contribution of {{renewal_fee}} per year.</p>
<p style="margin:24px 0;">
  <a href="{{portal_link}}" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;border-radius:0;text-decoration:none;font-weight:bold;font-size:15px;">Go to Member Hub</a>
</p>',
 '["full_name","membership_class","membership_number","complimentary_until","renewal_fee","portal_link"]'),

('MEMBERSHIP_COMPLIMENTARY_ENDING', 'EMAIL',
 'Your complimentary BCC membership period is ending',
 '<p>Dear {{full_name}},</p>
<p>Your complimentary <strong>{{membership_class}}</strong> membership period ends on <strong>{{expiry_date}}</strong>.</p>
<p>To continue your membership without interruption, please complete the standard {{membership_class}} payment of {{renewal_fee}} from the Member Hub.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/hub/membership/renew" style="display:inline-block;background:#C9A961;color:#141210;padding:12px 28px;border-radius:0;text-decoration:none;font-weight:bold;font-size:15px;">Continue Membership</a>
</p>',
 '["full_name","membership_class","expiry_date","renewal_fee","platform_url"]');

COMMIT;
