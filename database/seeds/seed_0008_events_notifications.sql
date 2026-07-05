-- ============================================================================
-- seed_0008_events_notifications.sql
-- Module 04 Events -- notification types and templates.
--
-- Section A: 6 notification_types for event lifecycle
-- Section B: EMAIL templates (HTML fragment)
-- Section C: IN_APP templates (plain text)
--
-- Hindi (body_hi) intentionally NULL -- editable via admin panel.
-- Variables use {{mustache}} syntax consumed by CommunicationService.
-- Double-quoted HTML attributes only. No non-ASCII characters.
-- ============================================================================

-- ============================================================================
-- SECTION A: notification_types
-- ============================================================================

INSERT INTO notification_types
  (type_key, category, module, trigger_event,
   fires_email, fires_in_app, fires_whatsapp, fires_sms, is_opt_outable, is_active)
VALUES

('EVENT_REGISTRATION_CONFIRMED',
 'TRANSACTIONAL', 'EVENTS',
 'Member or guest successfully registers for an event.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

('EVENT_REGISTRATION_WAITLISTED',
 'TRANSACTIONAL', 'EVENTS',
 'Registration placed on waitlist because event capacity is full.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('EVENT_SLOT_AVAILABLE',
 'ALERT', 'EVENTS',
 'A waitlisted registrant is promoted to confirmed when a slot opens.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

-- Seeded now; actual scheduled dispatch deferred (no cron infra yet).
-- CommunicationService.dispatch() can be called manually or by a future scheduler.
('EVENT_REMINDER_24H',
 'ALERT', 'EVENTS',
 '24-hour reminder sent to confirmed registrants before the event starts.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

('EVENT_CANCELLED',
 'ALERT', 'EVENTS',
 'Event cancelled by coordinator; all confirmed and waitlisted registrants notified.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('EVENT_REGISTRATION_CANCELLED_SELF',
 'TRANSACTIONAL', 'EVENTS',
 'Member cancels their own event registration.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE);

-- ============================================================================
-- SECTION B: EMAIL templates
-- ============================================================================

INSERT INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES

('EVENT_REGISTRATION_CONFIRMED', 'EMAIL',
 'You are registered for {{event_title}} - Bhopal Camera Club',
 '<p>Hi {{first_name}},</p>
<p>Your registration for <strong>{{event_title}}</strong> is confirmed.</p>
<table style="margin:16px 0;border-collapse:collapse;width:100%;max-width:480px;">
  <tr><td style="padding:6px 12px 6px 0;color:#666;font-size:13px;white-space:nowrap;">Date &amp; Time</td><td style="padding:6px 0;font-size:13px;"><strong>{{event_date}}</strong></td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;font-size:13px;white-space:nowrap;">Venue</td><td style="padding:6px 0;font-size:13px;"><strong>{{event_location}}</strong></td></tr>
</table>
<p style="font-size:13px;color:#555;">{{what_to_bring}}</p>
<p style="margin:24px 0;">
  <a href="{{event_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">View Event Details</a>
</p>
<p style="color:#888;font-size:12px;">To cancel your registration, visit the event page on the BCC platform.</p>',
 '["first_name","event_title","event_date","event_location","what_to_bring","event_url"]'),

('EVENT_REGISTRATION_WAITLISTED', 'EMAIL',
 'You are on the waitlist for {{event_title}} - Bhopal Camera Club',
 '<p>Hi {{first_name}},</p>
<p>You have been added to the waitlist for <strong>{{event_title}}</strong> ({{event_date}}).</p>
<p>The event is currently at full capacity. You are <strong>position {{waitlist_position}}</strong> on the waitlist. We will notify you immediately if a slot becomes available.</p>
<p style="margin:24px 0;">
  <a href="{{event_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">View Event</a>
</p>',
 '["first_name","event_title","event_date","waitlist_position","event_url"]'),

('EVENT_SLOT_AVAILABLE', 'EMAIL',
 'A spot has opened for {{event_title}} - Bhopal Camera Club',
 '<p>Hi {{first_name}},</p>
<p>Great news! A spot has opened for <strong>{{event_title}}</strong> ({{event_date}}) and your waitlist registration has been confirmed.</p>
<p style="margin:24px 0;">
  <a href="{{event_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">View Your Registration</a>
</p>',
 '["first_name","event_title","event_date","event_url"]'),

('EVENT_REMINDER_24H', 'EMAIL',
 'Reminder: {{event_title}} is tomorrow - Bhopal Camera Club',
 '<p>Hi {{first_name}},</p>
<p>This is a reminder that <strong>{{event_title}}</strong> is tomorrow.</p>
<table style="margin:16px 0;border-collapse:collapse;width:100%;max-width:480px;">
  <tr><td style="padding:6px 12px 6px 0;color:#666;font-size:13px;white-space:nowrap;">Date &amp; Time</td><td style="padding:6px 0;font-size:13px;"><strong>{{event_date}}</strong></td></tr>
  <tr><td style="padding:6px 12px 6px 0;color:#666;font-size:13px;white-space:nowrap;">Venue</td><td style="padding:6px 0;font-size:13px;"><strong>{{event_location}}</strong></td></tr>
</table>
<p style="font-size:13px;color:#555;">{{what_to_bring}}</p>
<p style="margin:24px 0;">
  <a href="{{event_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">View Event Details</a>
</p>',
 '["first_name","event_title","event_date","event_location","what_to_bring","event_url"]'),

('EVENT_CANCELLED', 'EMAIL',
 '{{event_title}} has been cancelled - Bhopal Camera Club',
 '<p>Hi {{first_name}},</p>
<p>We are sorry to inform you that <strong>{{event_title}}</strong> ({{event_date}}) has been cancelled.</p>
<p style="background:#FFF7E6;border-left:3px solid #F5A82A;padding:12px 16px;font-size:13px;">{{cancellation_reason}}</p>
<p style="font-size:13px;color:#555;">If you paid a registration fee, it will be refunded to you. Our team will reach out separately with refund details.</p>
<p>We apologise for the inconvenience and look forward to seeing you at a future event.</p>',
 '["first_name","event_title","event_date","cancellation_reason"]'),

('EVENT_REGISTRATION_CANCELLED_SELF', 'EMAIL',
 'Your registration for {{event_title}} has been cancelled',
 '<p>Hi {{first_name}},</p>
<p>Your registration for <strong>{{event_title}}</strong> ({{event_date}}) has been cancelled as requested.</p>
<p>We hope to see you at a future BCC event.</p>
<p style="margin:24px 0;">
  <a href="{{events_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Browse Upcoming Events</a>
</p>',
 '["first_name","event_title","event_date","events_url"]');

-- ============================================================================
-- SECTION C: IN_APP templates
-- ============================================================================

INSERT INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES

('EVENT_REGISTRATION_CONFIRMED', 'IN_APP',
 'Registration confirmed',
 'You are registered for {{event_title}} on {{event_date}}.',
 '["event_title","event_date"]'),

('EVENT_REGISTRATION_WAITLISTED', 'IN_APP',
 'Added to waitlist',
 'You are on the waitlist for {{event_title}} (position {{waitlist_position}}). We will notify you if a spot opens.',
 '["event_title","waitlist_position"]'),

('EVENT_SLOT_AVAILABLE', 'IN_APP',
 'Spot opened for you',
 'A spot has opened for {{event_title}} ({{event_date}}). Your registration is now confirmed.',
 '["event_title","event_date"]'),

('EVENT_REMINDER_24H', 'IN_APP',
 'Event tomorrow',
 '{{event_title}} is tomorrow at {{event_start_time}}. See you there!',
 '["event_title","event_start_time"]'),

('EVENT_CANCELLED', 'IN_APP',
 'Event cancelled',
 '{{event_title}} ({{event_date}}) has been cancelled. {{cancellation_reason}}',
 '["event_title","event_date","cancellation_reason"]'),

('EVENT_REGISTRATION_CANCELLED_SELF', 'IN_APP',
 'Registration cancelled',
 'Your registration for {{event_title}} has been cancelled.',
 '["event_title"]');
