-- ============================================================================
-- 0108_event_slot_payment_required_notification.sql
-- Module 04 x PAY-001 -- notification for a PAID Activity waitlist promotion.
--
-- EVENT_SLOT_AVAILABLE (seed_0008) tells a promoted waitlister that their
-- registration "has been confirmed". That is true for a FREE Activity, but a
-- promoted FLAT registration is only PENDING_PAYMENT until PAY-001 settlement
-- completes. This adds a distinct type whose only meaning is: a place is
-- available and held; complete payment to confirm participation.
-- Confirmation itself is still sent only by EVENT_REGISTRATION_CONFIRMED,
-- after CONTRIBUTION_COMPLETED.
--
-- Same shape as the seed_0008 EVENT_* rows (category ALERT, module EVENTS,
-- EMAIL + IN_APP, not opt-outable like EVENT_SLOT_AVAILABLE). Data only:
-- no schema change and no change to any existing notification row.
-- Hindi intentionally NULL (falls back to English). ASCII only.
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

INSERT INTO notification_types
  (type_key, category, module, trigger_event,
   fires_email, fires_in_app, fires_whatsapp, fires_sms, is_opt_outable, is_active)
VALUES
  ('EVENT_SLOT_PAYMENT_REQUIRED',
   'ALERT', 'EVENTS',
   'A waitlisted registrant of a paid Activity is offered a place; payment is required to confirm it.',
   TRUE, TRUE, FALSE, FALSE, FALSE, TRUE);

INSERT INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES
('EVENT_SLOT_PAYMENT_REQUIRED', 'EMAIL',
 'A place is available for {{event_title}} - complete your payment',
 '<p>Hi {{first_name}},</p>
<p>A place has become available for <strong>{{event_title}}</strong> ({{event_date}}) and it is being held for you.</p>
<p>To take up this place, please complete the participation fee of <strong>{{fee_amount}}</strong>. Your participation is confirmed only once payment has been received.</p>
<p style="margin:24px 0;">
  <a href="{{event_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Complete Payment</a>
</p>',
 '["first_name","event_title","event_date","fee_amount","event_url"]'),

('EVENT_SLOT_PAYMENT_REQUIRED', 'IN_APP',
 'Place available - payment required',
 'A place is available for {{event_title}} ({{event_date}}). Complete the {{fee_amount}} payment to confirm your participation.',
 '["event_title","event_date","fee_amount"]');

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0108_event_slot_payment_required_notification.sql', NOW());

COMMIT;
