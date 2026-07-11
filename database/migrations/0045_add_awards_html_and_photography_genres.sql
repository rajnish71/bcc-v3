-- ============================================================================
-- 0045_add_awards_html_and_photography_genres.sql
-- Phase D -- Batch D2: Schema additions + awards_html data population
--
-- SCHEMA CHANGES:
--   users.awards_html         TEXT NULL    -- Tiptap v2 HTML; 3000 char max (app-enforced)
--   users.photography_genres  JSON NULL    -- array of genre strings; interim until Phase H
--
-- DATA:
--   Populates awards_html for prakashhatvalne and kshitijpatle immediately after
--   the column is added. This keeps the dependency in a single transaction.
--   (The task spec placed this UPDATE in 0044, but the column did not exist before 0045.
--    Moved here to maintain strict dependency ordering.)
--
-- Credentials: bcc_v3_app
-- ============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

ALTER TABLE users
  ADD COLUMN awards_html         TEXT          NULL AFTER bio,
  ADD COLUMN photography_genres  JSON          NULL AFTER awards_html;

-- ============================================================================
-- Populate awards_html for the two members with real award data
-- ============================================================================

-- Prakash Hatvalne: structured HTML list of 4 international awards
UPDATE users
SET awards_html = '<ul><li>Grand Prize, 8th Smithsonian Photo Contest, USA (2011)</li><li>First Prize, UNDP New York, USA (2010)</li><li>First Prize, Friends of Earth International, Netherlands (2009)</li><li>Humanity Photo Award, China (2006)</li></ul>'
WHERE username = 'prakashhatvalne';

-- Kshitij Patle: narrative HTML list from distinctions.awards
UPDATE users
SET awards_html = '<ul><li>AFIP Distinction from the Federation of Indian Photography</li><li>Top 100 Photographer, Black &amp; White category — 35AWARDS 8th International Photo Awards 2022, Russia</li><li>Greenstorm Photo Festival Finalist — Top 30 of 11,835 entries from 155 countries</li><li>Most Promising Young Photographer of the Year 2019 — Bhopal Camera Club</li><li>1st Position, State-Level Wildlife Week Photography Competition 2021 &amp; 2022 — Van Vihar National Park, Bhopal</li><li>1st Position, Bhopal Through Your Lens Competition — MANIT Bhopal</li><li>1st Position, Life of Sparrow Competition — Regional Museum of Natural History, Bhopal</li><li>1st Position, Mamta Photography Contest 2024</li><li>Fakhruddin Shah Award 2023 — Maharana Pratap Educational Society</li><li>Green Influencer Ambassador 2026 — World Environment Day</li><li>Work featured in Asian Photography Magazine, Chiiz Photography Magazine, and Wildlife Today Magazine</li><li>Photographs exhibited at WWF exhibitions in Delhi, Goa, and Bhopal</li></ul>'
WHERE username = 'kshitijpatle';

INSERT INTO schema_migrations (filename, applied_at)
VALUES ('0045_add_awards_html_and_photography_genres.sql', NOW());

COMMIT;
