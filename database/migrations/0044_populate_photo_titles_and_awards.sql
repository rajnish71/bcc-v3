-- ============================================================================
-- 0044_populate_photo_titles_and_awards.sql
-- Phase D -- Batch D2: Populate user_photo_titles and user_awards (hardcoded)
--
-- No cross-database join needed. All data is known from Phase D audit.
-- Source: Phase_D_Schema_Blueprint.md Part 3 row plan.
--
-- SECTION 1: user_photo_titles — 12 rows
--   sanjaykumarshukla: 11 titles (FIP, PSA, FIAP, 2× GPU, 6× OTHER)
--   kshitijpatle:       1 title  (FIP/AFIP)
--
-- SECTION 2: user_awards — 5 rows
--   prakashhatvalne: 4 structured award rows (reverse-chronological)
--   kshitijpatle:    1 narrative row
--   rahilkhan:       awards = "Loading....." → DISCARDED (placeholder)
--
-- NOTE: users.awards_html (Tiptap HTML column) is populated in migration 0045
-- immediately after the column is added. That migration adds the column and
-- populates it in the same transaction to maintain dependency ordering.
--
-- INSERT IGNORE: idempotent, safe to re-run.
-- REQUIRES: sudo mysql (accesses bcc_v3 via database qualifier; no cross-DB JOIN)
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- ============================================================================
-- SECTION 1: user_photo_titles (12 rows)
-- sort_order: FIP=10, PSA=20, FIAP=30, GPU=40/41, OTHER=50–55
-- ============================================================================

INSERT IGNORE INTO bcc_v3.user_photo_titles (user_id, body_code, title_code, body_name, sort_order)
SELECT u.id, 'FIP',   'EFIP',        NULL,      10 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'PSA',   'PPSA',        NULL,      20 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'FIAP',  'AFIAP',       NULL,      30 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'GPU',   'GPU-CR3',     NULL,      40 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'GPU',   'GPU VIP-3',   NULL,      41 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'OTHER', 'FRPA',        'FRPA',    50 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'OTHER', 'GNG',         'GNG',     51 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'OTHER', 'Hon PESGSPC', 'PESGSPC', 52 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'OTHER', 'GPA-PESGSPC', 'PESGSPC', 53 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'OTHER', 'HonVNPC',     'VNPC',    54 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'OTHER', 'Hon WPAI',    'WPAI',    55 FROM bcc_v3.users u WHERE u.username = 'sanjaykumarshukla'
UNION ALL
SELECT u.id, 'FIP',   'AFIP',        NULL,      10 FROM bcc_v3.users u WHERE u.username = 'kshitijpatle';

-- ============================================================================
-- SECTION 2: user_awards
-- ============================================================================

-- Prakash Hatvalne: 4 structured award rows (reverse-chronological, sort 10–40)
INSERT IGNORE INTO bcc_v3.user_awards (user_id, award_name, awarding_body, award_year, description, sort_order)
SELECT u.id, 'Grand Prize', 'Smithsonian Institution', 2011,
  '8th Smithsonian Photo Contest (USA) — beat over 52,000 global entries with an iconic frame of Indonesian Ramayana dancers preparing in a Bhopal greenroom.',
  10
FROM bcc_v3.users u WHERE u.username = 'prakashhatvalne'
UNION ALL
SELECT u.id, 'First Prize', 'UNDP New York', 2010,
  'UN Development Programme photography contest — frame capturing a young schoolboy against contrasting steps, highlighting universal education goals.',
  20
FROM bcc_v3.users u WHERE u.username = 'prakashhatvalne'
UNION ALL
SELECT u.id, 'First Prize', 'Friends of Earth International', 2009,
  'Recognised internationally for impactful environmental and conservation-focused imagery. (Netherlands)',
  30
FROM bcc_v3.users u WHERE u.username = 'prakashhatvalne'
UNION ALL
SELECT u.id, 'Humanity Photo Award', 'China', 2006,
  'Second Prize for documenting and preserving cultural folklore and human diversity.',
  40
FROM bcc_v3.users u WHERE u.username = 'prakashhatvalne';

-- Kshitij Patle: 1 narrative row (full achievement list from distinctions.awards)
INSERT IGNORE INTO bcc_v3.user_awards (user_id, award_name, awarding_body, award_year, description, sort_order)
SELECT u.id,
  'Photography Achievements',
  NULL,
  NULL,
  'AFIP Distinction from the Federation of Indian Photography. Top 100 Photographer in Black & White category, 35AWARDS 8th International Photo Awards 2022 (Russia). Greenstorm Photo Festival Finalist — Top 30 of 11,835 entries from 155 countries. Most Promising Young Photographer of the Year 2019 — Bhopal Camera Club. 1st Position, State-Level Wildlife Week Photography Competition 2021 & 2022 — Van Vihar National Park. 1st Position, Bhopal Through Your Lens — MANIT Bhopal. 1st Position, Life of Sparrow — Regional Museum of Natural History Bhopal. 1st Position, Mamta Photography Contest 2024. Fakhruddin Shah Award 2023 — Maharana Pratap Educational Society. Green Influencer Ambassador 2026 — World Environment Day. Work featured in Asian Photography Magazine, Chiiz Photography Magazine, and Wildlife Today Magazine. Photographs exhibited at WWF exhibitions in Delhi, Goa, and Bhopal.',
  10
FROM bcc_v3.users u WHERE u.username = 'kshitijpatle';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0044_populate_photo_titles_and_awards.sql', NOW());

COMMIT;
