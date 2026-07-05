-- ============================================================================
-- seed_0007_reinstated_renewed_types.sql
-- Module 17 Communication Engine -- adds MEMBERSHIP_REINSTATED and
-- MEMBERSHIP_RENEWED notification types + templates.
--
-- These two types were TODO stubs in membership-lifecycle.service.ts
-- (notifyMemberDirect fallback). This seed closes those stubs.
--
-- After running this seed: the lifecycle.service.ts notifyMemberDirect()
-- call-sites are replaced with notifyMember() and the fallback method removed.
--
-- Section A: notification_types (2 new rows)
-- Section B: EMAIL templates (2 rows)
-- Section C: IN_APP templates (2 rows)
--
-- INSERT IGNORE is used so the seed is safe to re-run.
-- No single quotes inside any string value.
-- No non-ASCII characters. Hindi (body_hi) left NULL -- editable via admin.
-- ============================================================================


-- ============================================================================
-- SECTION A: notification_types
-- ============================================================================

INSERT IGNORE INTO notification_types
  (type_key, category, module, trigger_event,
   fires_email, fires_in_app, fires_whatsapp, fires_sms, is_opt_outable, is_active)
VALUES

('MEMBERSHIP_REINSTATED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Coordinator lifts a membership suspension; state transitions from SUSPENDED to ACTIVE.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_RENEWED',
 'LIFECYCLE', 'RENEWAL',
 'Member or coordinator completes renewal; state transitions from EXPIRED to ACTIVE.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE);


-- ============================================================================
-- SECTION B: EMAIL templates
-- ============================================================================

INSERT IGNORE INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES

('MEMBERSHIP_REINSTATED', 'EMAIL',
 'Your BCC membership has been reinstated',
 '<p>Hi {{full_name}},</p>
<p>Your Bhopal Camera Club <strong>{{membership_class}}</strong> membership suspension has been lifted and your membership is now fully active.</p>
<p>All benefits are restored. Welcome back to the club.</p>
<p style="margin:24px 0;">
  <a href="https://v3bcc.bhopal.info/hub/" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Go to Member Hub</a>
</p>
<p style="color:#666;font-size:13px;">If you have questions about this decision, please contact your coordinator.</p>',
 '["full_name","membership_class"]'),

('MEMBERSHIP_RENEWED', 'EMAIL',
 'Your BCC membership has been renewed',
 '<p>Hi {{full_name}},</p>
<p>Your Bhopal Camera Club <strong>{{membership_class}}</strong> membership has been renewed and is now active for another term.</p>
<p>Your permanent membership number remains <strong>{{membership_number}}</strong>. It never changes.</p>
<p style="margin:24px 0;">
  <a href="https://v3bcc.bhopal.info/hub/" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">View Membership</a>
</p>
<p style="color:#666;font-size:13px;">Thank you for continuing your journey with Bhopal Camera Club.</p>',
 '["full_name","membership_class","membership_number"]');


-- ============================================================================
-- SECTION C: IN_APP templates
-- ============================================================================

INSERT IGNORE INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES

('MEMBERSHIP_REINSTATED', 'IN_APP',
 'Membership reinstated',
 'Your {{membership_class}} membership suspension has been lifted. Full benefits are restored.',
 '["membership_class"]'),

('MEMBERSHIP_RENEWED', 'IN_APP',
 'Membership renewed',
 'Your {{membership_class}} membership has been renewed and is now active for another term.',
 '["membership_class"]');
