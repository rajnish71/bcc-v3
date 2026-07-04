-- ============================================================================
-- seed_0005_notification_taxonomy.sql
-- Module 17 Communication Engine - notification type catalogue + templates.
--
-- Section A: notification_types (27 Phase 1 types)
-- Section B: notification_templates EMAIL channel (HTML fragments)
-- Section C: notification_templates IN_APP channel (plain text)
--
-- Phase 2+ types (events, contests, school) will be added when those modules
-- are built. All Phase 1 types are seeded here even if not yet triggered by
-- an active module, so the taxonomy is complete from day one.
--
-- HTML fragments in EMAIL body_en use double-quoted attributes only.
-- No single quotes appear inside any string value.
-- No non-ASCII characters. Hindi (body_hi) left NULL -- editable via admin.
-- CommunicationService wraps body_en in the standard BCC email shell.
-- ============================================================================

-- ============================================================================
-- SECTION A: notification_types
-- ============================================================================

INSERT INTO notification_types
  (type_key, category, module, trigger_event,
   fires_email, fires_in_app, fires_whatsapp, fires_sms, is_opt_outable, is_active)
VALUES

-- IDENTITY / AUTH -----------------------------------------------------------
('AUTH_EMAIL_VERIFY',
 'TRANSACTIONAL', 'IDENTITY',
 'User registers and needs to verify their email address to activate account.',
 TRUE, FALSE, FALSE, FALSE, FALSE, TRUE),

('AUTH_PASSWORD_RESET',
 'TRANSACTIONAL', 'IDENTITY',
 'User requests a password reset link.',
 TRUE, FALSE, FALSE, FALSE, FALSE, TRUE),

('AUTH_MAGIC_LINK',
 'TRANSACTIONAL', 'IDENTITY',
 'User requests a passwordless magic-link sign-in.',
 TRUE, FALSE, FALSE, FALSE, FALSE, TRUE),

('AUTH_ADMIN_ACCOUNT_CREATED',
 'TRANSACTIONAL', 'IDENTITY',
 'Coordinator creates a platform account on behalf of a user.',
 TRUE, FALSE, FALSE, FALSE, FALSE, TRUE),

('AUTH_WELCOME_REGISTERED',
 'TRANSACTIONAL', 'IDENTITY',
 'User successfully verifies email and completes registration.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

-- MEMBERSHIP APPLICATION ----------------------------------------------------
('MEMBERSHIP_APPLICATION_SUBMITTED',
 'TRANSACTIONAL', 'MEMBERSHIP',
 'Member submits a membership application.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

('MEMBERSHIP_APPLICATION_APPROVED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Coordinator or committee approves a membership application.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_APPLICATION_REJECTED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Coordinator or committee rejects a membership application.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_APPLICATION_CLARIFICATION',
 'TRANSACTIONAL', 'MEMBERSHIP',
 'Coordinator requests clarification or additional documents from applicant.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

-- MEMBERSHIP LIFECYCLE (constitutional transitions: is_opt_outable = FALSE) --
('MEMBERSHIP_ACTIVATED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Payment confirmed; membership transitions to ACTIVE state.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_NUMBER_ASSIGNED',
 'TRANSACTIONAL', 'MEMBERSHIP',
 'MEM-007 permanent membership number issued after activation.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_SUSPENDED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Coordinator suspends a membership.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_TERMINATED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Membership terminated (grace period lapsed or disciplinary action).',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_EXPIRED',
 'LIFECYCLE', 'MEMBERSHIP',
 'Membership term ends; grace period begins.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('MEMBERSHIP_CARD_READY',
 'TRANSACTIONAL', 'MEMBERSHIP',
 'Digital membership card generated and ready for download.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

-- COORDINATOR ALERTS --------------------------------------------------------
('COORDINATOR_NEW_APPLICATION',
 'ALERT', 'MEMBERSHIP',
 'New membership application received; coordinator action required.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

-- PAYMENT -------------------------------------------------------------------
('PAYMENT_INVOICE_ISSUED',
 'TRANSACTIONAL', 'PAYMENT',
 'Membership fee invoice generated after application approval.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('PAYMENT_RECEIPT_CONFIRMED',
 'TRANSACTIONAL', 'PAYMENT',
 'Payment received and confirmed via Razorpay webhook.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('PAYMENT_FAILED',
 'ALERT', 'PAYMENT',
 'Payment attempt failed; member must retry.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('PAYMENT_RETRY_PROMPT',
 'ALERT', 'PAYMENT',
 'Reminder that a payment is still pending and the window is closing.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

-- RENEWAL REMINDERS ---------------------------------------------------------
('RENEWAL_REMINDER_60',
 'LIFECYCLE', 'RENEWAL',
 'Renewal reminder sent 60 days before membership expiry.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

('RENEWAL_REMINDER_30',
 'LIFECYCLE', 'RENEWAL',
 'Renewal reminder sent 30 days before membership expiry.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

('RENEWAL_REMINDER_14',
 'LIFECYCLE', 'RENEWAL',
 'Renewal reminder sent 14 days before membership expiry.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE),

('RENEWAL_REMINDER_7',
 'LIFECYCLE', 'RENEWAL',
 'Renewal reminder sent 7 days before membership expiry.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('RENEWAL_REMINDER_0',
 'LIFECYCLE', 'RENEWAL',
 'Membership expires today notice.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

('RENEWAL_GRACE_OVERDUE',
 'LIFECYCLE', 'RENEWAL',
 'Membership expired; member is within grace period and must reapply.',
 TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),

-- RECOGNITION ---------------------------------------------------------------
('RECOGNITION_AWARDED',
 'TRANSACTIONAL', 'MEMBERSHIP',
 'Recognition badge awarded to a member by coordinator or AUTO track.',
 TRUE, TRUE, FALSE, FALSE, TRUE, TRUE);


-- ============================================================================
-- SECTION B: EMAIL templates (HTML fragment - CommunicationService adds shell)
-- ============================================================================

INSERT INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES

('AUTH_EMAIL_VERIFY', 'EMAIL',
 'Verify your email address - Bhopal Camera Club',
 '<p>Hi {{first_name}},</p>
<p>Thank you for joining Bhopal Camera Club. Please verify your email address to complete your registration and activate your account.</p>
<p style="margin:24px 0;">
  <a href="{{verification_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Verify Email Address</a>
</p>
<p style="color:#666;font-size:13px;">This link expires in 24 hours. If you did not create an account with BCC, please ignore this email.</p>',
 '["first_name","verification_url"]'),

('AUTH_PASSWORD_RESET', 'EMAIL',
 'Reset your password - Bhopal Camera Club',
 '<p>Hi {{first_name}},</p>
<p>We received a request to reset the password for your BCC account. Click the button below to choose a new password.</p>
<p style="margin:24px 0;">
  <a href="{{reset_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Reset Password</a>
</p>
<p style="color:#666;font-size:13px;">This link expires in 1 hour. If you did not request a password reset, your account is safe and no action is needed.</p>',
 '["first_name","reset_url"]'),

('AUTH_MAGIC_LINK', 'EMAIL',
 'Your sign-in link - Bhopal Camera Club',
 '<p>Hi {{first_name}},</p>
<p>Use the link below to sign in to your BCC account. This link expires in 15 minutes and can only be used once.</p>
<p style="margin:24px 0;">
  <a href="{{magic_link_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Sign In to BCC</a>
</p>
<p style="color:#666;font-size:13px;">If you did not request this link, please ignore this email. Your account has not been accessed.</p>',
 '["first_name","magic_link_url"]'),

('AUTH_ADMIN_ACCOUNT_CREATED', 'EMAIL',
 'Your Bhopal Camera Club account has been created',
 '<p>Hi {{first_name}},</p>
<p>An account has been created for you on the Bhopal Camera Club platform by a coordinator.</p>
<p><strong>Your login details:</strong></p>
<table style="border-collapse:collapse;margin:8px 0;">
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td style="padding:4px 0;font-weight:bold;">{{email}}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">Temporary password</td><td style="padding:4px 0;font-weight:bold;font-family:monospace;">{{temp_password}}</td></tr>
</table>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/signin" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Sign In Now</a>
</p>
<p style="color:#666;font-size:13px;">Please sign in and change your password immediately. Your temporary password will expire after first use.</p>',
 '["first_name","email","temp_password","platform_url"]'),

('AUTH_WELCOME_REGISTERED', 'EMAIL',
 'Welcome to Bhopal Camera Club',
 '<p>Hi {{first_name}},</p>
<p>Your email has been verified and your BCC account is ready. Welcome to Bhopal Camera Club!</p>
<p>Your account gives you access to the BCC platform. To participate in club activities, exhibitions, and contests, the next step is to apply for membership.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/membership/apply" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Apply for Membership</a>
</p>
<p style="color:#666;font-size:13px;">Not ready to apply yet? You can explore the platform and apply whenever you are ready.</p>',
 '["first_name","platform_url"]'),

('MEMBERSHIP_APPLICATION_SUBMITTED', 'EMAIL',
 'Membership application received - Bhopal Camera Club',
 '<p>Dear {{full_name}},</p>
<p>Your application for <strong>{{membership_class}}</strong> membership with Bhopal Camera Club has been received and is currently under review by the coordinator.</p>
<p>You will receive an update once the review is complete. If clarification is needed, we will contact you through this email and your member portal.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/application" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Track Your Application</a>
</p>',
 '["full_name","membership_class","platform_url"]'),

('MEMBERSHIP_APPLICATION_APPROVED', 'EMAIL',
 'Your BCC membership application has been approved',
 '<p>Dear {{full_name}},</p>
<p>We are pleased to inform you that your application for <strong>{{membership_class}}</strong> membership with Bhopal Camera Club has been approved.</p>
<p>The next step is payment of your membership fee. Your invoice will be shared shortly. Once payment is confirmed, your membership will be activated and your membership card issued.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/payment" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Complete Payment</a>
</p>',
 '["full_name","membership_class","platform_url"]'),

('MEMBERSHIP_APPLICATION_REJECTED', 'EMAIL',
 'Update on your BCC membership application',
 '<p>Dear {{full_name}},</p>
<p>Thank you for your interest in Bhopal Camera Club. After careful review, your application for <strong>{{membership_class}}</strong> membership has not been accepted at this time.</p>
<p><strong>Reason:</strong> {{rejection_reason}}</p>
<p>You are welcome to re-apply after 30 days. If you have questions, please contact the BCC coordinator.</p>
<p style="color:#666;font-size:13px;">We appreciate your interest in BCC and hope to welcome you in a future application cycle.</p>',
 '["full_name","membership_class","rejection_reason"]'),

('MEMBERSHIP_APPLICATION_CLARIFICATION', 'EMAIL',
 'Clarification needed - your BCC membership application',
 '<p>Dear {{full_name}},</p>
<p>Your membership application requires some clarification before it can proceed to the next stage.</p>
<p><strong>Details from the coordinator:</strong></p>
<p style="background:#f8f8f8;border-left:3px solid #F5A82A;padding:12px 16px;margin:16px 0;">{{clarification_note}}</p>
<p>Please sign in to your member portal to respond or upload any requested documents.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/application" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Respond to Coordinator</a>
</p>',
 '["full_name","clarification_note","platform_url"]'),

('MEMBERSHIP_ACTIVATED', 'EMAIL',
 'Your BCC membership is now active!',
 '<p>Dear {{full_name}},</p>
<p>Congratulations! Your <strong>{{membership_class}}</strong> membership with Bhopal Camera Club is now active.</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Membership number</td><td style="padding:4px 0;font-weight:bold;font-family:monospace;">{{membership_number}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Membership class</td><td style="padding:4px 0;font-weight:bold;">{{membership_class}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Valid until</td><td style="padding:4px 0;font-weight:bold;">{{expiry_date}}</td></tr>
</table>
<p>Your digital membership card is being generated and will be ready shortly.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Go to Member Hub</a>
</p>',
 '["full_name","membership_class","membership_number","expiry_date","platform_url"]'),

('MEMBERSHIP_NUMBER_ASSIGNED', 'EMAIL',
 'Your BCC membership number has been assigned',
 '<p>Dear {{full_name}},</p>
<p>Your permanent Bhopal Camera Club membership number has been assigned:</p>
<p style="font-size:28px;font-weight:bold;font-family:monospace;letter-spacing:2px;color:#F5A82A;margin:24px 0;">{{membership_number}}</p>
<p>This number is yours for life. It is the unique identifier that represents your membership record with Bhopal Camera Club in perpetuity.</p>',
 '["full_name","membership_number"]'),

('MEMBERSHIP_SUSPENDED', 'EMAIL',
 'Important: Your BCC membership has been suspended',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership with Bhopal Camera Club has been suspended.</p>
<p>While suspended, your access to member-only features is restricted. Please contact the BCC coordinator to understand the reason and discuss next steps.</p>',
 '["full_name","membership_class"]'),

('MEMBERSHIP_TERMINATED', 'EMAIL',
 'Your BCC membership has been terminated',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership with Bhopal Camera Club has been terminated.</p>
<p>If you believe this is in error or wish to discuss this decision, please contact the BCC coordinator directly.</p>',
 '["full_name","membership_class"]'),

('MEMBERSHIP_EXPIRED', 'EMAIL',
 'Your BCC membership has expired',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership with Bhopal Camera Club expired on <strong>{{expiry_date}}</strong>.</p>
<p>You have a grace period of <strong>{{grace_days}} days</strong> to renew before your account is terminated. Please renew your membership as soon as possible to avoid losing access.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/renew" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Renew Membership</a>
</p>',
 '["full_name","membership_class","expiry_date","grace_days","platform_url"]'),

('MEMBERSHIP_CARD_READY', 'EMAIL',
 'Your BCC digital membership card is ready',
 '<p>Dear {{full_name}},</p>
<p>Your digital Bhopal Camera Club membership card has been generated and is ready for download.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/card" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Download Membership Card</a>
</p>',
 '["full_name","platform_url"]'),

('COORDINATOR_NEW_APPLICATION', 'EMAIL',
 'New membership application received - action required',
 '<p>Hi,</p>
<p>A new membership application has been submitted and requires your review.</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Applicant</td><td style="padding:4px 0;font-weight:bold;">{{full_name}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Applied for</td><td style="padding:4px 0;font-weight:bold;">{{membership_class}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Submitted</td><td style="padding:4px 0;">{{submitted_at}}</td></tr>
</table>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/admin/applications" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Review Application</a>
</p>',
 '["full_name","membership_class","submitted_at","platform_url"]'),

('PAYMENT_INVOICE_ISSUED', 'EMAIL',
 'Invoice for your BCC membership fee',
 '<p>Dear {{full_name}},</p>
<p>Your invoice for <strong>{{membership_class}}</strong> membership is ready.</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Invoice number</td><td style="padding:4px 0;font-family:monospace;">{{invoice_number}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Amount due</td><td style="padding:4px 0;font-weight:bold;">INR {{amount}}</td></tr>
</table>
<p>Please complete your payment via the member portal to activate your membership.</p>
<p style="margin:24px 0;">
  <a href="{{payment_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Pay Now</a>
</p>',
 '["full_name","membership_class","invoice_number","amount","payment_url"]'),

('PAYMENT_RECEIPT_CONFIRMED', 'EMAIL',
 'Payment confirmed - BCC membership',
 '<p>Dear {{full_name}},</p>
<p>Your payment has been received. Thank you!</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Receipt number</td><td style="padding:4px 0;font-family:monospace;">{{invoice_number}}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:#666;">Amount paid</td><td style="padding:4px 0;font-weight:bold;">INR {{amount}}</td></tr>
</table>
<p>Your membership will be activated shortly and you will receive a confirmation email.</p>',
 '["full_name","invoice_number","amount"]'),

('PAYMENT_FAILED', 'EMAIL',
 'Payment unsuccessful - action required',
 '<p>Dear {{full_name}},</p>
<p>Your payment of <strong>INR {{amount}}</strong> for BCC membership was unsuccessful.</p>
<p>Please try again via the member portal. If the problem persists, contact your bank or try a different payment method.</p>
<p style="margin:24px 0;">
  <a href="{{payment_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Retry Payment</a>
</p>',
 '["full_name","amount","payment_url"]'),

('PAYMENT_RETRY_PROMPT', 'EMAIL',
 'Reminder: Complete your BCC membership payment',
 '<p>Dear {{full_name}},</p>
<p>A payment of <strong>INR {{amount}}</strong> for your <strong>{{membership_class}}</strong> membership is still pending. Your membership cannot be activated until payment is complete.</p>
<p style="margin:24px 0;">
  <a href="{{payment_url}}" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Complete Payment</a>
</p>',
 '["full_name","membership_class","amount","payment_url"]'),

('RENEWAL_REMINDER_60', 'EMAIL',
 'Your BCC membership renews in 60 days',
 '<p>Dear {{full_name}},</p>
<p>A friendly reminder that your <strong>{{membership_class}}</strong> membership expires on <strong>{{expiry_date}}</strong> (in 60 days).</p>
<p>Consider renewing early to ensure uninterrupted access to all BCC member benefits.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/renew" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Renew Membership</a>
</p>',
 '["full_name","membership_class","expiry_date","platform_url"]'),

('RENEWAL_REMINDER_30', 'EMAIL',
 'Your BCC membership expires in 30 days',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership expires on <strong>{{expiry_date}}</strong> (30 days from now).</p>
<p>Please renew soon to avoid any interruption to your member access and benefits.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/renew" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Renew Now</a>
</p>',
 '["full_name","membership_class","expiry_date","platform_url"]'),

('RENEWAL_REMINDER_14', 'EMAIL',
 'Your BCC membership expires in 14 days',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership expires in <strong>14 days</strong> on {{expiry_date}}.</p>
<p>Please renew your membership before it expires to maintain your member status without a gap.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/renew" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Renew Membership</a>
</p>',
 '["full_name","membership_class","expiry_date","platform_url"]'),

('RENEWAL_REMINDER_7', 'EMAIL',
 'Urgent: Your BCC membership expires in 7 days',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership expires in <strong>7 days</strong> on {{expiry_date}}.</p>
<p>Please renew immediately. If your membership lapses, a grace period applies before your account is terminated, but renewing now avoids any gap in your benefits.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/renew" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Renew Now</a>
</p>',
 '["full_name","membership_class","expiry_date","platform_url"]'),

('RENEWAL_REMINDER_0', 'EMAIL',
 'Your BCC membership expires today',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership with Bhopal Camera Club expires today.</p>
<p>Please renew now to avoid entering the grace period. If you do not renew within the grace period, your membership will be terminated and you will need to reapply.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member/renew" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Renew Now</a>
</p>',
 '["full_name","membership_class","platform_url"]'),

('RENEWAL_GRACE_OVERDUE', 'EMAIL',
 'Urgent: BCC membership expired - reapplication required',
 '<p>Dear {{full_name}},</p>
<p>Your <strong>{{membership_class}}</strong> membership expired on <strong>{{expiry_date}}</strong> and is now in its grace period.</p>
<p><strong>{{grace_days_remaining}} days remaining</strong> in your grace period.</p>
<p>Per BCC membership rules, you must submit a new membership application before the grace period ends. After this date, your account will be terminated.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/membership/apply" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">Submit New Application</a>
</p>',
 '["full_name","membership_class","expiry_date","grace_days_remaining","platform_url"]'),

('RECOGNITION_AWARDED', 'EMAIL',
 'Congratulations - BCC Recognition Award',
 '<p>Dear {{full_name}},</p>
<p>We are delighted to inform you that you have been awarded the <strong>{{recognition_class}}</strong> recognition by Bhopal Camera Club.</p>
<p>This honour recognises your outstanding contribution to photography and to the BCC community. Your recognition badge will appear on your photographer profile and membership card.</p>
<p style="margin:24px 0;">
  <a href="{{platform_url}}/member" style="display:inline-block;background:#F5A82A;color:#0B0B0E;padding:12px 28px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:15px;">View Your Profile</a>
</p>
<p>Congratulations once again from the entire BCC team.</p>',
 '["full_name","recognition_class","platform_url"]');


-- ============================================================================
-- SECTION C: IN_APP templates (plain text for notification bell)
-- Only types with fires_in_app = TRUE get an IN_APP template.
-- Title is the short bell label; body_en is the expanded panel text.
-- We store the title in subject_en (repurposed for IN_APP as bell title).
-- ============================================================================

INSERT INTO notification_templates (type_key, channel, subject_en, body_en, variables) VALUES

('AUTH_WELCOME_REGISTERED', 'IN_APP',
 'Welcome to Bhopal Camera Club',
 'Your account is ready. Explore the platform and apply for membership whenever you are ready.',
 '["first_name","platform_url"]'),

('MEMBERSHIP_APPLICATION_SUBMITTED', 'IN_APP',
 'Application received',
 'Your {{membership_class}} membership application has been submitted and is under review.',
 '["membership_class"]'),

('MEMBERSHIP_APPLICATION_APPROVED', 'IN_APP',
 'Application approved',
 'Your membership application has been approved. Complete your payment to activate your membership.',
 '["membership_class"]'),

('MEMBERSHIP_APPLICATION_REJECTED', 'IN_APP',
 'Application not accepted',
 'Your membership application could not be accepted at this time. Check your email for details.',
 '["membership_class"]'),

('MEMBERSHIP_APPLICATION_CLARIFICATION', 'IN_APP',
 'Clarification requested',
 'The coordinator has requested clarification on your membership application. Please respond via your member portal.',
 NULL),

('MEMBERSHIP_ACTIVATED', 'IN_APP',
 'Membership active',
 'Your {{membership_class}} membership is now active. Welcome to BCC!',
 '["membership_class","membership_number"]'),

('MEMBERSHIP_NUMBER_ASSIGNED', 'IN_APP',
 'Membership number assigned',
 'Your permanent BCC membership number {{membership_number}} has been issued.',
 '["membership_number"]'),

('MEMBERSHIP_SUSPENDED', 'IN_APP',
 'Membership suspended',
 'Your membership has been suspended. Contact the coordinator for details.',
 NULL),

('MEMBERSHIP_TERMINATED', 'IN_APP',
 'Membership terminated',
 'Your BCC membership has been terminated.',
 NULL),

('MEMBERSHIP_EXPIRED', 'IN_APP',
 'Membership expired',
 'Your membership expired on {{expiry_date}}. You have {{grace_days}} days to renew before your account is terminated.',
 '["expiry_date","grace_days"]'),

('MEMBERSHIP_CARD_READY', 'IN_APP',
 'Membership card ready',
 'Your digital BCC membership card is ready. Download it from your member hub.',
 NULL),

('COORDINATOR_NEW_APPLICATION', 'IN_APP',
 'New application pending review',
 '{{full_name}} has submitted a {{membership_class}} membership application. Review required.',
 '["full_name","membership_class"]'),

('PAYMENT_INVOICE_ISSUED', 'IN_APP',
 'Invoice ready',
 'Your membership fee invoice for INR {{amount}} is ready. Complete payment to activate your membership.',
 '["amount"]'),

('PAYMENT_RECEIPT_CONFIRMED', 'IN_APP',
 'Payment confirmed',
 'Payment of INR {{amount}} received. Your membership will be activated shortly.',
 '["amount"]'),

('PAYMENT_FAILED', 'IN_APP',
 'Payment unsuccessful',
 'Your payment of INR {{amount}} was unsuccessful. Please retry.',
 '["amount"]'),

('PAYMENT_RETRY_PROMPT', 'IN_APP',
 'Payment pending',
 'Your membership payment of INR {{amount}} is still pending.',
 '["amount"]'),

('RENEWAL_REMINDER_60', 'IN_APP',
 'Renewal in 60 days',
 'Your {{membership_class}} membership expires on {{expiry_date}}. Consider renewing early.',
 '["membership_class","expiry_date"]'),

('RENEWAL_REMINDER_30', 'IN_APP',
 'Renewal in 30 days',
 'Your {{membership_class}} membership expires on {{expiry_date}}. Renew soon to avoid interruption.',
 '["membership_class","expiry_date"]'),

('RENEWAL_REMINDER_14', 'IN_APP',
 'Renewal in 14 days',
 'Your membership expires in 14 days on {{expiry_date}}. Please renew now.',
 '["expiry_date"]'),

('RENEWAL_REMINDER_7', 'IN_APP',
 'Renewal in 7 days',
 'Your membership expires in 7 days. Renew immediately to avoid a lapse.',
 '["expiry_date"]'),

('RENEWAL_REMINDER_0', 'IN_APP',
 'Membership expires today',
 'Your BCC membership expires today. Renew now to maintain your member status.',
 NULL),

('RENEWAL_GRACE_OVERDUE', 'IN_APP',
 'Membership in grace period',
 'Your membership has expired. You have {{grace_days_remaining}} days left in your grace period to submit a new application.',
 '["grace_days_remaining"]'),

('RECOGNITION_AWARDED', 'IN_APP',
 'Recognition awarded',
 'Congratulations! You have been awarded the {{recognition_class}} recognition by Bhopal Camera Club.',
 '["recognition_class"]');
