-- seed_0012_events_data.sql
-- 3 upcoming BCC events (PUBLISHED, created_by user 1 / Rajnish K. Khare)
-- event_type uses enum values WITHOUT underscores: PHOTOWALK (not PHOTO_WALK)
-- Rajnish should update descriptions, venues, and banner images
-- via the Events API or future admin panel as needed.

INSERT INTO events (
  uuid, slug, title, description,
  event_type, occurrence,
  starts_at, ends_at,
  location_name, location_address, location_landmark,
  capacity, waitlist_enabled,
  fee_type, base_fee_paise,
  eligibility_mode,
  difficulty_level, age_restriction, weather_dependent,
  volunteer_slots_needed, what_to_bring, tags,
  banner_r2_key, state,
  created_by, created_at, updated_at
) VALUES
(
  '11111111-2222-3333-4444-555555500001',
  'monsoon-photography-walk-bharat-bhavan-11111111',
  'Monsoon Photography Walk - Bharat Bhavan Trail',
  'A guided monsoon photowalk along the Bharat Bhavan lakeside trail. The post-rain landscape, Upper Lake reflections, and lush greenery make this one of the best times to shoot in Bhopal. We will cover composition in low-contrast light, handling moisture near the lens, and finding strong foreground elements. All skill levels welcome.',
  'PHOTOWALK', 'SINGLE',
  '2026-08-09 06:30:00', '2026-08-09 09:30:00',
  'Bharat Bhavan, Bhopal',
  'Bharat Bhavan, Shamla Hills, Bhopal, Madhya Pradesh 462013',
  'Meet at the main gate of Bharat Bhavan facing Upper Lake',
  40, TRUE, 'FREE', 0, 'MEMBERS_ONLY',
  'BEGINNER', 'ALL', TRUE,
  2,
  'Camera, lens cloth, small waterproof bag for gear, water bottle, comfortable walking shoes',
  '["monsoon","photowalk","landscape","Upper Lake"]',
  NULL, 'PUBLISHED', 1, NOW(), NOW()
),
(
  '11111111-2222-3333-4444-555555500002',
  'monthly-critique-feedback-session-aug-2026-11111111',
  'Monthly Critique & Feedback Session - August 2026',
  'Our monthly open critique session where members submit up to three photographs for group review. Each image is discussed openly. Submit your images via the Member Hub before the session date. No experience level is too early or too late to benefit from peer critique.',
  'MEETUP', 'RECURRING',
  '2026-08-22 11:00:00', '2026-08-22 13:00:00',
  'BCC Chapter House, Bhopal',
  'Venue confirmed via Member Hub closer to the date.',
  NULL,
  25, FALSE, 'FREE', 0, 'MEMBERS_ONLY',
  'ALL', 'ALL', FALSE,
  0,
  'Laptop or phone to display your submissions digitally',
  '["critique","feedback","learning","monthly"]',
  NULL, 'PUBLISHED', 1, NOW(), NOW()
),
(
  '11111111-2222-3333-4444-555555500003',
  'low-light-night-photography-workshop-11111111',
  'Low-Light & Night Photography Workshop',
  'A hands-on evening workshop covering manual exposure for night scenes, long-exposure light trails, star photography basics, noise management at high ISO, and post-processing for night images. We will shoot around the illuminated monuments of old Bhopal. Participants need a camera with manual mode and a tripod.',
  'WORKSHOP', 'SINGLE',
  '2026-09-12 18:30:00', '2026-09-12 22:00:00',
  'Moti Masjid Area, Old Bhopal',
  'Old Bhopal, near Moti Masjid, Bhopal, Madhya Pradesh',
  'Coordinator will share precise meeting point via WhatsApp group before the event',
  20, TRUE, 'FREE', 0, 'MEMBERS_ONLY',
  'INTERMEDIATE', 'ALL', FALSE,
  1,
  'Camera with manual mode, sturdy tripod (essential), fully charged batteries, remote shutter release if available',
  '["night photography","long exposure","workshop","low light"]',
  NULL, 'PUBLISHED', 1, NOW(), NOW()
);
