-- ============================================================================
-- 0054_seed_demo_activities.sql
-- Demo upcoming activities for Feedback Stage 5 home page validation.
-- All seeded with future dates; state = PUBLISHED so they appear on the home page.
-- created_by = 1 (Rajnish Khare, founding admin).
-- ============================================================================

INSERT IGNORE INTO events (
  uuid, slug, title, description, event_type, occurrence,
  starts_at, ends_at, location_name, location_address,
  capacity, waitlist_enabled, fee_type, base_fee_paise,
  eligibility_mode, difficulty_level, age_restriction,
  weather_dependent, volunteer_slots_needed, what_to_bring,
  tags, banner_r2_key, state, cancellation_reason,
  created_by, created_at, updated_at
) VALUES
(
  'a1b2c3d4-0001-0000-0000-000000000001',
  'monsoon-photowalk-upper-lake-2026',
  'Monsoon Photowalk — Upper Lake',
  'Capture the drama of Bhopal''s monsoon season at the Upper Lake (Bada Talab). Golden-hour light on water, birds returning to the shore, and the city reflected in the rain-fed expanse. All skill levels welcome.',
  'PHOTOWALK', 'SINGLE',
  '2026-07-27 06:30:00', '2026-07-27 09:00:00',
  'Upper Lake Boat Club Jetty, Bhopal',
  'Boat Club Road, Shymala Hills, Bhopal, Madhya Pradesh 462002',
  40, 1, 'FREE', 0,
  'OPEN', 'ALL', 'ALL',
  1, 2,
  'Camera, extra batteries, rain cover or waterproof bag for gear, comfortable footwear',
  '["photowalk","monsoon","upperlake","bhopal","landscape"]',
  NULL,
  'PUBLISHED', NULL,
  1,
  NOW(), NOW()
),
(
  'a1b2c3d4-0002-0000-0000-000000000002',
  'composition-workshop-2026-august',
  'Composition Workshop — The Art of Framing',
  'A two-hour interactive workshop on composition techniques: rule of thirds, leading lines, negative space, and framing within a frame. Practical exercises with immediate feedback from senior BCC members.',
  'WORKSHOP', 'SINGLE',
  '2026-08-09 10:00:00', '2026-08-09 12:30:00',
  'BCC Clubhouse, Bhopal',
  'TBD — details sent to registered participants',
  25, 0, 'FREE', 0,
  'MEMBERS_ONLY', 'ALL', 'ALL',
  0, 1,
  'Camera, notebook, any lens combination you normally use',
  '["workshop","composition","technique","members"]',
  NULL,
  'PUBLISHED', NULL,
  1,
  NOW(), NOW()
),
(
  'a1b2c3d4-0003-0000-0000-000000000003',
  'annual-print-exhibition-2026',
  'BCC Annual Print Exhibition 2026',
  'Bhopal Camera Club''s flagship annual exhibition. Selected prints from member portfolios, curated by the exhibition committee. Open to the public. Inaugurated by distinguished guests from Bhopal''s arts and culture community.',
  'EXHIBITION_EVENT', 'SINGLE',
  '2026-08-22 11:00:00', '2026-08-24 20:00:00',
  'Bharat Bhavan, Bhopal',
  'Near Shamla Hills, Bhopal, Madhya Pradesh 462013',
  NULL, 1, 'FREE', 0,
  'OPEN', 'ALL', 'ALL',
  0, 4,
  NULL,
  '["exhibition","annual","prints","bharat-bhavan","open-to-public"]',
  NULL,
  'PUBLISHED', NULL,
  1,
  NOW(), NOW()
);
